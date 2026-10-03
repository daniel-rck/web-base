/**
 * An in-memory stand-in for the subset of Cloudflare's `R2Bucket` binding that
 * `worker/sync.ts` uses. Structural, so it needs no Workers types. Semantics
 * mirror the R2 Workers API docs:
 *
 * - `etag` is unquoted; `httpEtag` is the same value wrapped in double quotes.
 * - The etag derives from the content (R2 uses the MD5 of a single-part upload;
 *   here the first 32 hex chars of SHA-256), so identical bytes keep the etag.
 * - `onlyIf.etagMatches` passes only when the object exists and its etag equals
 *   the value; `onlyIf.etagDoesNotMatch` passes when the object is missing or
 *   its etag differs. `"*"` matches any existing object in both. (R2's docs do
 *   not spell out the wildcard for `R2Conditional`; the worker always checks
 *   with `head()` first and uses the condition only to close the race window.)
 * - A `get` whose condition fails returns the metadata without `body`; a
 *   missing object is `null`. A `put` whose condition fails stores nothing and
 *   returns `null`.
 * - `customMetadata` is stored and returned as given. `delete` of a missing key
 *   is a no-op.
 */

export type R2Conditional = { etagMatches?: string; etagDoesNotMatch?: string };

export type FakeR2Object = {
  key: string;
  etag: string;
  httpEtag: string;
  size: number;
  uploaded: Date;
  customMetadata: Record<string, string>;
};

export type FakeR2ObjectBody = FakeR2Object & {
  body: ReadableStream<Uint8Array<ArrayBuffer>>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
};

type Stored = { meta: FakeR2Object; bytes: Uint8Array<ArrayBuffer> };

export class FakeR2Bucket {
  readonly objects = new Map<string, Stored>();
  /** Runs at the start of every `put`, to interleave a concurrent writer. */
  beforePut: ((key: string) => Promise<void>) | null = null;

  async head(key: string): Promise<FakeR2Object | null> {
    const stored = this.objects.get(key);
    return stored ? copy(stored.meta) : null;
  }

  async get(
    key: string,
    options: { onlyIf?: R2Conditional } = {},
  ): Promise<FakeR2ObjectBody | FakeR2Object | null> {
    const stored = this.objects.get(key);
    if (!stored) return null;
    if (!passes(options.onlyIf, stored.meta)) return copy(stored.meta);
    const { bytes } = stored;
    return {
      ...copy(stored.meta),
      body: new Blob([bytes]).stream(),
      arrayBuffer: async () => bytes.slice().buffer,
      text: async () => new TextDecoder().decode(bytes),
    };
  }

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array<ArrayBuffer> | string,
    options: { onlyIf?: R2Conditional; customMetadata?: Record<string, string> } = {},
  ): Promise<FakeR2Object | null> {
    await this.beforePut?.(key);
    const current = this.objects.get(key)?.meta ?? null;
    if (!passes(options.onlyIf, current)) return null;
    const bytes = toBytes(value);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const etag = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
    const meta: FakeR2Object = {
      key,
      etag,
      httpEtag: `"${etag}"`,
      size: bytes.byteLength,
      uploaded: new Date(),
      customMetadata: { ...options.customMetadata },
    };
    this.objects.set(key, { meta, bytes });
    return copy(meta);
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  /** Every stored object decoded as UTF-8, to assert what the server can read. */
  storedText(): string[] {
    return [...this.objects.values()].map(({ bytes }) => new TextDecoder().decode(bytes));
  }
}

function passes(onlyIf: R2Conditional | undefined, current: FakeR2Object | null): boolean {
  if (!onlyIf) return true;
  const matches = (value: string) =>
    current !== null && (value === "*" || unquote(value) === current.etag);
  if (onlyIf.etagMatches !== undefined && !matches(onlyIf.etagMatches)) return false;
  if (onlyIf.etagDoesNotMatch !== undefined && matches(onlyIf.etagDoesNotMatch)) return false;
  return true;
}

function unquote(value: string): string {
  return value.replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
}

function toBytes(value: ArrayBuffer | Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> {
  if (typeof value === "string") return new TextEncoder().encode(value);
  return value instanceof Uint8Array ? value.slice() : new Uint8Array(value.slice(0));
}

function copy(meta: FakeR2Object): FakeR2Object {
  return { ...meta, customMetadata: { ...meta.customMetadata } };
}
