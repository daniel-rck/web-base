import { deriveKeys, open, seal, type SyncKeys } from "./crypto.ts";
import { isSyncError } from "./errors.ts";
import { readEnvelope, requireEtag, send, statusError, type SyncResponse } from "./http.ts";
import { decodePairingCode, encodePairingCode, generateSecret } from "./pairing.ts";
import { safeLocalStorage, SyncStore } from "./storage.ts";
import type { PullResult, RequestOptions, SyncClientOptions } from "./types.ts";

type Call = { method: "GET" | "PUT" | "DELETE"; headers?: Record<string, string>; body?: string };

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
    if (!this.#store.load()) this.#store.save({ v: 2, code, etag: null });
  }

  async pull<T>(options: RequestOptions = {}): Promise<PullResult<T>> {
    const { code, etag } = this.#store.require();
    const keys = await this.#keysFor(code);
    const headers: Record<string, string> = etag ? { "if-none-match": etag } : {};
    const response = await this.#send(keys, { method: "GET", headers }, options);
    if (response.status === 304) return { status: "unchanged" };
    if (response.status === 404) {
      this.#store.setEtag(code, null);
      return { status: "missing" };
    }
    if (response.status !== 200) throw statusError(response);
    const next = requireEtag(response);
    const data = await open<T>(keys.encKey, keys.objectId, readEnvelope(response.text));
    this.#store.setEtag(code, next);
    return { status: "updated", data };
  }

  /** Upload `payload`. Throws `SyncError("conflict")` if the remote moved on. */
  async push(payload: unknown, options: RequestOptions = {}): Promise<void> {
    const { code, etag } = this.#store.require();
    const keys = await this.#keysFor(code);
    const body = JSON.stringify(await seal(keys.encKey, keys.objectId, payload));
    // No known ETag means "create": the server refuses to overwrite what exists.
    const headers = {
      ...(etag ? { "if-match": etag } : { "if-none-match": "*" }),
      "content-type": "application/json",
    };
    const response = await this.#send(keys, { method: "PUT", headers, body }, options);
    if (response.status !== 200 && response.status !== 204) throw statusError(response);
    this.#store.setEtag(code, requireEtag(response));
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
      const remote = await this.pull<T>(request);
      if (remote.status === "updated") {
        current = await merge(current, remote.data);
        // The remote already holds everything we have: skip the upload.
        if (JSON.stringify(current) === JSON.stringify(remote.data)) return current;
      }
      try {
        await this.push(current, request);
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
