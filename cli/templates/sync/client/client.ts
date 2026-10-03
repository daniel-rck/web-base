import { deriveKeys, fingerprint, open, seal, type SyncKeys } from "./crypto.ts";
import { isSyncError, SyncError } from "./errors.ts";
import { readEnvelope, requireEtag, send, statusError, type SyncResponse } from "./http.ts";
import {
  decodePairingCode,
  encodePairingCode,
  formatPairingCode,
  generateSecret,
  pairingUrl,
} from "./pairing.ts";
import { safeLocalStorage, SyncStore } from "./storage.ts";
import type { PullResult, RequestOptions, SyncClientOptions } from "./types.ts";

type Call = { method: "GET" | "PUT" | "DELETE"; headers?: Record<string, string>; body?: string };
/** A pull plus the ETag it saw — the precondition for a push based on it. */
type Pulled<T> = PullResult<T> & { etag: string | null };

/**
 * End-to-end encrypted sync of one JSON document per secret. Every method
 * reads its state from storage, so nothing needs initializing after a reload.
 */
export class SyncClient {
  readonly #endpoint: string;
  readonly #store: SyncStore;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;
  #keys: { code: string; keys: Promise<SyncKeys> } | null = null;

  constructor(options: SyncClientOptions = {}) {
    this.#endpoint = (options.endpoint ?? "/api/sync").replace(/\/+$/, "");
    this.#store = new SyncStore(
      options.storage ?? safeLocalStorage(),
      options.storageKey ?? "web-base-sync",
    );
    // Late-bound so `fetch` keeps its receiver and stubs of globalThis apply.
    this.#fetch = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.#timeoutMs = options.timeoutMs ?? 30_000;
  }

  /** Whether this device holds a secret. Never throws. */
  isEnabled(): boolean {
    return this.#store.load() !== null;
  }

  /** Create a secret for a first device. A no-op when one exists already. */
  async enable(): Promise<void> {
    if (this.#store.load()) return;
    const code = await encodePairingCode(generateSecret());
    if (!this.#store.load()) this.#store.save({ v: 2, code, etag: null, fp: null });
  }

  /** The code to type on another device, in groups of four. Throws `not_enabled`. */
  pairingCode(): string {
    return formatPairingCode(this.#store.require().code);
  }

  /** A link that pairs whoever opens it (render it as a QR code). Throws `not_enabled`. */
  pairingUrl(base?: string): string {
    return pairingUrl(this.#store.require().code, base);
  }

  /**
   * Adopt another device's secret. Throws `invalid_code`, or `already_enabled`
   * while this device holds a different one — pass `replace` once the user
   * confirmed. The same code again is a no-op.
   */
  async importPairingCode(code: string, options: { replace?: boolean } = {}): Promise<void> {
    const canonical = await encodePairingCode(await decodePairingCode(code));
    const current = this.#store.load();
    if (current?.code === canonical) return;
    if (current && !options.replace) throw new SyncError("already_enabled");
    this.#store.save({ v: 2, code: canonical, etag: null, fp: null });
  }

  /** Download the document. `unchanged` means: since this device's last pull or push. */
  async pull<T>(options: RequestOptions = {}): Promise<PullResult<T>> {
    const { code, etag } = this.#store.require();
    const result = await this.#get<T>(code, etag, options);
    return result.status === "updated"
      ? { status: "updated", data: result.data }
      : { status: result.status };
  }

  /**
   * Upload `payload` over the version this device last pulled or pushed.
   * Throws `SyncError("conflict")` if the remote moved on.
   */
  async push(payload: unknown, options: RequestOptions = {}): Promise<void> {
    const { code, etag } = this.#store.require();
    await this.#put(code, payload, etag, options);
  }

  /**
   * Pull → merge → push, retrying on conflict. Returns the merged value, which
   * the app must persist locally. `merge` may run more than once.
   */
  async sync<T>(
    local: T,
    merge: (local: T, remote: T) => T | Promise<T>,
    options: RequestOptions & { maxAttempts?: number } = {},
  ): Promise<T> {
    const { maxAttempts = 3, ...request } = options;
    let current = local;
    for (let attempt = 1; ; attempt++) {
      const { code, etag, fp } = this.#store.require();
      // A 304 proves the remote equals `current` only if `current` is exactly
      // the document stored at `etag`. Anything else — local edits, or a pull
      // the app never got to save — is merged with a full download.
      const known = etag !== null && fp !== null && fp === (await fingerprint(current));
      const remote = await this.#get<T>(code, known ? etag : null, request);
      if (remote.status === "unchanged") return current;
      if (remote.status === "updated") {
        current = await merge(current, remote.data);
        // The remote already holds everything we have: skip the upload.
        if (JSON.stringify(current) === JSON.stringify(remote.data)) return current;
      }
      try {
        // Against the ETag this attempt saw — never one another tab stored since.
        await this.#put(code, current, remote.etag, request);
        return current;
      } catch (error) {
        if (!isSyncError(error, "conflict") || attempt >= maxAttempts) throw error;
      }
    }
  }

  /** Forget the secret on this device; with `deleteRemote`, delete the data first. */
  async disable(options: { deleteRemote?: boolean } & RequestOptions = {}): Promise<void> {
    const state = this.#store.load();
    if (!state) return;
    if (options.deleteRemote) {
      const keys = await this.#keysFor(state.code);
      const response = await this.#send(keys, { method: "DELETE" }, options);
      if (response.status !== 204 && response.status !== 404) throw statusError(response);
    }
    this.#store.clear();
    this.#keys = null;
  }

  /** GET, conditional on `etag`; records the version it receives. */
  async #get<T>(code: string, etag: string | null, options: RequestOptions): Promise<Pulled<T>> {
    const keys = await this.#keysFor(code);
    const headers: Record<string, string> = etag ? { "if-none-match": etag } : {};
    const response = await this.#send(keys, { method: "GET", headers }, options);
    if (response.status === 304) return { status: "unchanged", etag };
    if (response.status === 404) {
      this.#store.setVersion(code, null, null);
      return { status: "missing", etag: null };
    }
    if (response.status !== 200) throw statusError(response);
    const next = requireEtag(response);
    const data = await open<T>(keys.encKey, keys.objectId, readEnvelope(response.text));
    this.#store.setVersion(code, next, await fingerprint(data));
    return { status: "updated", data, etag: next };
  }

  /** PUT over `etag` (`null`: create, never overwrite); records the new version. */
  async #put(code: string, payload: unknown, etag: string | null, options: RequestOptions) {
    const keys = await this.#keysFor(code);
    const body = JSON.stringify(await seal(keys.encKey, keys.objectId, payload));
    const headers = {
      ...(etag ? { "if-match": etag } : { "if-none-match": "*" }),
      "content-type": "application/json",
    };
    const response = await this.#send(keys, { method: "PUT", headers, body }, options);
    if (response.status !== 200 && response.status !== 204) throw statusError(response);
    this.#store.setVersion(code, requireEtag(response), await fingerprint(payload));
  }

  #keysFor(code: string): Promise<SyncKeys> {
    if (this.#keys?.code === code) return this.#keys.keys;
    const keys = decodePairingCode(code).then(deriveKeys);
    this.#keys = { code, keys };
    return keys;
  }

  #send(keys: SyncKeys, call: Call, options: RequestOptions): Promise<SyncResponse> {
    return send(`${this.#endpoint}/${keys.objectId}`, {
      ...call,
      headers: { ...call.headers, authorization: `Bearer ${keys.authToken}` },
      fetch: this.#fetch,
      timeoutMs: options.timeoutMs ?? this.#timeoutMs,
      signal: options.signal,
    });
  }
}
