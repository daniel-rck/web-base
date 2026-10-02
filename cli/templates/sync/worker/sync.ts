/**
 * Sync protocol v2, mounted at /api/sync/* in worker/index.ts (see docs/sync.md):
 *
 *   GET | PUT | DELETE /api/sync/<objectId>   Authorization: Bearer <token>
 *
 * Objects are opaque envelopes in R2. The first PUT binds an object to
 * SHA-256(token); every later request must present the same token. The
 * Worker never sees the secret or plaintext, and stores no IP addresses.
 */
import {
  authHash,
  bearer,
  error,
  normalizeEtag,
  parseEnvelope,
  respond,
  sameHash,
} from "./sync-http.ts";

export type SyncEnv = {
  SYNC: R2Bucket;
  /** Optional Rate Limiting binding; keyed by object id, never by IP. */
  SYNC_RATE_LIMIT?: RateLimit;
};

export type SyncOptions = {
  /** Largest accepted envelope. Default 8 MiB. */
  maxBytes?: number;
};

type Target = { bucket: R2Bucket; key: string; auth: string };

const ROUTE = /^\/api\/sync\/([0-9A-HJKMNP-TV-Z]{16})$/;
const METHODS = new Set(["GET", "PUT", "DELETE"]);

export async function handleSync(
  request: Request,
  env: SyncEnv,
  options: SyncOptions = {},
): Promise<Response> {
  const objectId = ROUTE.exec(new URL(request.url).pathname)?.[1];
  if (!objectId) return error(404, "not_found");
  if (!METHODS.has(request.method)) {
    return error(405, "method_not_allowed", { allow: "GET, PUT, DELETE" });
  }
  const limit = await env.SYNC_RATE_LIMIT?.limit({ key: objectId });
  if (limit && !limit.success) return error(429, "rate_limited", { "retry-after": "60" });
  const token = bearer(request);
  if (!token) return error(401, "unauthorized");

  const target = { bucket: env.SYNC, key: `v2/${objectId}`, auth: await authHash(token) };
  if (request.method === "GET") return read(request, target);
  if (request.method === "DELETE") return remove(target);
  return write(request, target, options.maxBytes ?? 8 * 1024 * 1024);
}

async function read(request: Request, { bucket, key, auth }: Target): Promise<Response> {
  const ifNoneMatch = request.headers.get("if-none-match");
  // A failed condition yields the metadata without `body` (→ 304).
  const object = ifNoneMatch
    ? await bucket.get(key, { onlyIf: { etagDoesNotMatch: normalizeEtag(ifNoneMatch) } })
    : await bucket.get(key);
  if (!object) return error(404, "not_found");
  // Ownership before freshness: a 304 would confirm the ETag to a stranger.
  if (!sameHash(auth, object.customMetadata?.auth)) {
    if (hasBody(object)) await object.body.cancel();
    return error(403, "forbidden");
  }
  if (!hasBody(object)) return respond(304, { etag: object.httpEtag });
  return respond(
    200,
    {
      etag: object.httpEtag,
      "content-type": "application/json",
      "x-content-type-options": "nosniff",
    },
    object.body,
  );
}

function hasBody(object: R2Object | R2ObjectBody): object is R2ObjectBody {
  return "body" in object;
}

async function write(request: Request, target: Target, maxBytes: number): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) {
    return error(413, "too_large");
  }
  const body = await request.arrayBuffer();
  if (body.byteLength > maxBytes) return error(413, "too_large");
  if (!parseEnvelope(body)) return error(400, "bad_envelope");

  const ifMatch = request.headers.get("if-match");
  if (request.headers.get("if-none-match")?.trim() === "*") return create(target, body);
  if (!ifMatch) return error(428, "precondition_required");
  return update(target, body, normalizeEtag(ifMatch));
}

async function create({ bucket, key, auth }: Target, body: ArrayBuffer): Promise<Response> {
  if (await bucket.head(key)) return error(412, "conflict");
  // The condition closes the race between head() and put() where R2 honours it.
  const created = await bucket.put(key, body, {
    onlyIf: { etagDoesNotMatch: "*" },
    customMetadata: { auth },
  });
  return created ? respond(204, { etag: created.httpEtag }) : error(412, "conflict");
}

async function update(
  { bucket, key, auth }: Target,
  body: ArrayBuffer,
  ifMatch: string,
): Promise<Response> {
  const current = await bucket.head(key);
  if (!current) return error(412, "conflict");
  if (!sameHash(auth, current.customMetadata?.auth)) return error(403, "forbidden");
  if (ifMatch !== current.etag) return error(412, "conflict");
  const updated = await bucket.put(key, body, {
    onlyIf: { etagMatches: current.etag },
    customMetadata: { auth },
  });
  return updated ? respond(204, { etag: updated.httpEtag }) : error(412, "conflict");
}

async function remove({ bucket, key, auth }: Target): Promise<Response> {
  const current = await bucket.head(key);
  if (!current) return respond(204);
  if (!sameHash(auth, current.customMetadata?.auth)) return error(403, "forbidden");
  await bucket.delete(key);
  return respond(204);
}
