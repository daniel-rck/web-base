// Not typechecked (see tsconfig.templates.json): worker/sync.ts needs Workers types.
import { handleSync } from "../../templates/sync/worker/sync.ts";
import { FakeR2Bucket } from "./fakes/r2.ts";

/** The pinned v2 vectors for the secret 00 01 … 0f (see crypto.test.ts). */
export const ID = "QZQVCTQB5YM38E3S";
export const TOKEN = "aDXawcAEh-2YlLD2Iv63-o6SdUB7hlbh4p70W-Q3ATM";
export const STRANGER = "s".repeat(43);

export const envelope = (fill = "B") =>
  JSON.stringify({ v: 2, iv: "A".repeat(16), ct: fill.repeat(40) });

/** A Worker env around a fresh fake bucket, and helpers that call `handleSync`. */
export function worker(bindings = {}) {
  const bucket = new FakeR2Bucket();
  const env = { SYNC: bucket, ...bindings };

  function call(
    method,
    { path = `/api/sync/${ID}`, token = TOKEN, headers = {}, body, maxBytes } = {},
  ) {
    const h = new Headers(headers);
    if (token) h.set("authorization", `Bearer ${token}`);
    if (body !== undefined && !h.has("content-length")) {
      h.set("content-length", String(new TextEncoder().encode(body).byteLength));
    }
    const init = body === undefined ? { method, headers: h } : { method, headers: h, body };
    const request = new Request(`https://app.test${path}`, init);
    return handleSync(request, env, maxBytes ? { maxBytes } : undefined);
  }

  const create = (body = envelope(), token = TOKEN) =>
    call("PUT", { token, body, headers: { "if-none-match": "*" } });

  return { bucket, call, create };
}

export async function json(response) {
  return { status: response.status, body: await response.json() };
}
