/** Request parsing and response helpers for worker/sync.ts. */

/** Every response is uncacheable: sync data must never come out of a cache. */
export function respond(
  status: number,
  headers: Record<string, string> = {},
  body: BodyInit | null = null,
): Response {
  return new Response(body, { status, headers: { ...headers, "cache-control": "no-store" } });
}

/** `{ "error": "<code>" }` with a stable lowercase code; never internal details. */
export function error(
  status: number,
  code: string,
  headers: Record<string, string> = {},
): Response {
  const json = { ...headers, "content-type": "application/json" };
  return respond(status, json, JSON.stringify({ error: code }));
}

const TOKEN = /^Bearer ([\w-]{43})$/;

/** The bearer token (256 bits of base64url), or `null`. */
export function bearer(request: Request): string | null {
  return TOKEN.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
}

/** hex(SHA-256(token)): the only trace of a token the server keeps. */
export async function authHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests. */
export function sameHash(expected: string, actual: string | undefined): boolean {
  if (actual?.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  return diff === 0;
}

/**
 * An ETag as R2 stores it: no `W/` prefix (Cloudflare weakens ETags when it
 * compresses a response) and no quotes (`httpEtag` has them, `etag` not).
 */
export function normalizeEtag(value: string): string {
  return value
    .trim()
    .replace(/^W\//, "")
    .replace(/^"(.*)"$/, "$1");
}

const IV = /^[\w-]{16}$/;
const CT = /^[\w-]{22,}$/;

/** The body as a v2 envelope `{ v: 2, iv, ct }`, or `null`. The content stays opaque. */
export function parseEnvelope(body: ArrayBuffer): { v: 2; iv: string; ct: string } | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(body));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { v, iv, ct } = value as Record<string, unknown>;
  if (v !== 2 || typeof iv !== "string" || typeof ct !== "string") return null;
  return IV.test(iv) && CT.test(ct) ? { v, iv, ct } : null;
}
