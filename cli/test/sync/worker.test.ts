// Not typechecked (see tsconfig.templates.json): worker/sync.ts needs Workers types.
import { describe, expect, it } from "vitest";
import { FakeRateLimit } from "./fakes/rate-limit.ts";
import { ID, json, STRANGER, TOKEN, worker } from "./worker-helpers.ts";

describe("routing", () => {
  it("404s unknown paths", async () => {
    const { call } = worker();
    const paths = ["/api/sync", "/api/sync/", `/api/sync/${ID}/data.json`, "/api/sync/SHORT"];
    for (const path of [...paths, `/api/sync/${ID.toLowerCase()}`, "/api/other"]) {
      const response = await call("GET", { path });
      expect(await json(response)).toEqual({ status: 404, body: { error: "not_found" } });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  });

  it("405s other methods with Allow", async () => {
    const { call } = worker();
    for (const method of ["POST", "PATCH", "HEAD", "OPTIONS"]) {
      const response = await call(method);
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("GET, PUT, DELETE");
    }
  });

  it("401s a missing or malformed token", async () => {
    const { call } = worker();
    for (const authorization of [undefined, "Bearer short", `Basic ${TOKEN}`, `Bearer ${TOKEN}=`]) {
      const headers = authorization ? { authorization } : {};
      const response = await call("GET", { token: null, headers });
      expect(await json(response)).toEqual({ status: 401, body: { error: "unauthorized" } });
    }
  });
});

describe("GET", () => {
  it("returns the stored bytes unchanged", async () => {
    const { call, create } = worker();
    const body = JSON.stringify({ v: 2, iv: "Q".repeat(16), ct: "Q".repeat(40) });
    const etag = (await create(body)).headers.get("etag");
    const response = await call("GET");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(body);
    expect(response.headers.get("etag")).toBe(etag);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("304s the current ETag and 200s a stale one", async () => {
    const { call, create } = worker();
    const etag = (await create()).headers.get("etag");
    const same = await call("GET", { headers: { "if-none-match": etag } });
    expect(same.status).toBe(304);
    expect(same.headers.get("etag")).toBe(etag);
    const stale = await call("GET", { headers: { "if-none-match": '"0000"' } });
    expect(stale.status).toBe(200);
  });

  it("403s another token, even for a matching ETag", async () => {
    const { call, create } = worker();
    const etag = (await create()).headers.get("etag");
    const plain = await call("GET", { token: STRANGER });
    expect(await json(plain)).toEqual({ status: 403, body: { error: "forbidden" } });
    const probing = await call("GET", { token: STRANGER, headers: { "if-none-match": etag } });
    expect(probing.status).toBe(403);
  });

  it("404s a missing object", async () => {
    const { call } = worker();
    expect(await json(await call("GET"))).toEqual({ status: 404, body: { error: "not_found" } });
  });
});

describe("DELETE", () => {
  it("deletes, then the object is gone", async () => {
    const { bucket, call, create } = worker();
    await create();
    expect((await call("DELETE")).status).toBe(204);
    expect((await call("GET")).status).toBe(404);
    expect(bucket.objects.size).toBe(0);
  });

  it("204s a missing object", async () => {
    expect((await worker().call("DELETE")).status).toBe(204);
  });

  it("403s another token and keeps the object", async () => {
    const { bucket, call, create } = worker();
    await create();
    expect((await call("DELETE", { token: STRANGER })).status).toBe(403);
    expect(bucket.objects.size).toBe(1);
  });
});

describe("rate limiting", () => {
  it("429s with Retry-After when the binding says no, keyed by object id", async () => {
    const limiter = new FakeRateLimit();
    const { call } = worker({ SYNC_RATE_LIMIT: limiter });
    limiter.allow = false;
    const response = await call("GET", { headers: { "cf-connecting-ip": "203.0.113.7" } });
    expect(await json(response)).toEqual({ status: 429, body: { error: "rate_limited" } });
    expect(response.headers.get("retry-after")).toBe("60");
    expect(limiter.keys).toEqual([ID]);
  });

  it("is checked after routing and before authentication", async () => {
    const limiter = new FakeRateLimit();
    const { call } = worker({ SYNC_RATE_LIMIT: limiter });
    await call("GET", { path: "/api/sync/nope" });
    await call("POST");
    expect(limiter.keys).toEqual([]);
    limiter.allow = false;
    expect((await call("GET", { token: null })).status).toBe(429);
  });

  it("passes everything without a binding", async () => {
    expect((await worker().create()).status).toBe(204);
  });
});
