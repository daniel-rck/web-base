/**
 * Wire format v2: what the Worker stores. `v` versions the wire format only;
 * the app's own data schema version belongs inside the encrypted payload.
 */
export type SyncEnvelope = {
  v: 2;
  /** base64url (no padding) of the 12-byte AES-GCM IV. */
  iv: string;
  /** base64url (no padding) of the AES-GCM ciphertext including its tag. */
  ct: string;
};

/** What the client persists per device (localStorage by default). */
export type SyncState = {
  v: 2;
  /** The pairing code without hyphens. It IS the root secret: never send it. */
  code: string;
  /** Last ETag seen for the remote object; `null` = "assume it does not exist". */
  etag: string | null;
  /**
   * `fingerprint()` of the document stored at `etag` (the one pulled or pushed
   * with it), or `null`. `sync()` trusts a 304 only for exactly that document,
   * so a pull the app never got to save can't make it push stale data back.
   */
  fp: string | null;
};

export type PullResult<T> =
  | { status: "unchanged" }
  | { status: "missing" }
  | { status: "updated"; data: T };

/** The slice of `Storage` the client needs, so tests and apps can swap it. */
export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SyncClientOptions = {
  /** Base path of the Worker routes. Default `/api/sync`. */
  endpoint?: string;
  /** Default: `localStorage`, guarded so a blocked storage cannot crash the app. */
  storage?: StorageLike;
  fetch?: typeof fetch;
  /** Per-request timeout including the body. Default 30 s. */
  timeoutMs?: number;
  /** Storage key of the persisted `SyncState`. Default `web-base-sync`. */
  storageKey?: string;
};

export type RequestOptions = {
  signal?: AbortSignal;
  /** Overrides the client's `timeoutMs` for this call. */
  timeoutMs?: number;
};
