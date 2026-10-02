/**
 * Persistence for `SyncState`. Browsers can refuse storage at any time
 * (Safari private mode, blocked site data, a full quota), so every access goes
 * through a guard: reads degrade to "nothing stored", writes fail loudly with
 * `SyncError("storage_unavailable")` instead of a raw `DOMException`.
 */
import { SyncError } from "./errors.ts";
import { parsePairingCode } from "./pairing.ts";
import type { StorageLike, SyncState } from "./types.ts";

function write(run: () => void): void {
  try {
    run();
  } catch (cause) {
    throw new SyncError("storage_unavailable", { cause });
  }
}

export function guardStorage(storage: StorageLike): StorageLike {
  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => write(() => storage.setItem(key, value)),
    removeItem: (key) => write(() => storage.removeItem(key)),
  };
}

/** `localStorage`, looked up on every call (merely touching it can throw). */
export function safeLocalStorage(): StorageLike {
  return guardStorage({
    getItem: (key) => globalThis.localStorage.getItem(key),
    setItem: (key, value) => globalThis.localStorage.setItem(key, value),
    removeItem: (key) => globalThis.localStorage.removeItem(key),
  });
}

/**
 * The state under one key. Nothing is cached: every call reads storage, so a
 * reload or a second tab can never leave a client half-initialized.
 */
export class SyncStore {
  readonly #storage: StorageLike;
  readonly #key: string;

  constructor(storage: StorageLike, key: string) {
    this.#storage = guardStorage(storage);
    this.#key = key;
  }

  /** The state, or `null`. Anything else (corrupt JSON, an older format) is removed. */
  load(): SyncState | null {
    const raw = this.#storage.getItem(this.#key);
    if (raw === null) return null;
    const state = parseState(raw);
    if (!state) {
      try {
        this.#storage.removeItem(this.#key);
      } catch {
        // Read-only storage: nothing to clean up, and nothing worth reporting.
      }
    }
    return state;
  }

  /** Like `load()`, but throws `SyncError("not_enabled")` instead of returning `null`. */
  require(): SyncState {
    const state = this.load();
    if (!state) throw new SyncError("not_enabled");
    return state;
  }

  save(state: SyncState): void {
    this.#storage.setItem(this.#key, JSON.stringify(state));
  }

  /** Record an ETag, unless the device was re-paired while the request ran. */
  setEtag(code: string, etag: string | null): void {
    const state = this.load();
    if (state?.code === code) this.save({ ...state, etag });
  }

  clear(): void {
    this.#storage.removeItem(this.#key);
  }
}

function parseState(raw: string): SyncState | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { v, code, etag } = value as Record<string, unknown>;
  if (v !== 2 || typeof code !== "string" || parsePairingCode(code)?.version !== 2) return null;
  if (etag !== null && typeof etag !== "string") return null;
  return { v: 2, code, etag };
}
