/**
 * Sync handlers mounted at /api/sync/* in worker/index.ts.
 *
 * R2 key pattern: objects/<objectId>/data.json where objectId is the
 * first 10 bytes of SHA-256(deviceSecret), Crockford-base32 encoded.
 *
 * Conflict detection: R2 ETag via If-Match (PUT) and If-None-Match (GET).
 * Rate-limiting (KV token-bucket): 5 pair/min, 10 claim/15min, 60 ops/min/IP.
 */

export interface SyncEnv {
  SYNC: R2Bucket;
  SYNC_KV: KVNamespace;
}

const RATE_LIMITS = {
  ops: { window: 60, limit: 60 },
  pair: { window: 60, limit: 5 },
  claim: { window: 900, limit: 10 },
};

export async function handleSync(
  request: Request,
  env: SyncEnv,
  _ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";

  if (!(await allow(env.SYNC_KV, `rl:ops:${ip}`, RATE_LIMITS.ops))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  // /api/sync/<objectId>/data.json
  const match = url.pathname.match(/^\/api\/sync\/([0-9A-HJKMNP-TV-Z]{16})\/data\.json$/);
  if (match) {
    const objectId = match[1] as string;
    const key = `objects/${objectId}/data.json`;

    if (request.method === "GET") {
      const obj = await env.SYNC.get(key, {
        onlyIf: { etagDoesNotMatch: request.headers.get("if-none-match") ?? undefined },
      });
      if (!obj) return new Response(null, { status: 404 });
      if (!("body" in obj)) return new Response(null, { status: 304 });
      return new Response(obj.body, { headers: { etag: obj.httpEtag } });
    }

    if (request.method === "PUT") {
      const ifMatch = request.headers.get("if-match");
      const body = await request.arrayBuffer();
      const put = await env.SYNC.put(key, body, {
        onlyIf: ifMatch ? { etagMatches: ifMatch } : undefined,
      });
      if (!put) return new Response(null, { status: 412 });
      return new Response(null, { status: 204, headers: { etag: put.httpEtag } });
    }
  }

  return Response.json({ error: "not_found" }, { status: 404 });
}

async function allow(
  kv: KVNamespace,
  key: string,
  { window, limit }: { window: number; limit: number },
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const raw = await kv.get(key);
  const bucket = raw ? (JSON.parse(raw) as { count: number; resetAt: number }) : null;

  if (!bucket || bucket.resetAt <= now) {
    await kv.put(key, JSON.stringify({ count: 1, resetAt: now + window }), {
      expirationTtl: window + 5,
    });
    return true;
  }

  if (bucket.count >= limit) return false;
  bucket.count++;
  await kv.put(key, JSON.stringify(bucket), { expirationTtl: window + 5 });
  return true;
}
