// Not typechecked (see tsconfig.templates.json): worker/sync.ts needs Workers types.
import { describe, expect, it } from "vitest";
import { authHash } from "../../templates/sync/worker/sync-http.ts";
import { envelope, ID, json, STRANGER, TOKEN, worker } from "./worker-helpers.ts";

describe("PUT", () => {
  it("creates with If-None-Match: * and binds the object to SHA-256(token)", async () => {
    const { bucket, call } = worker();
    const response = await call("PUT", {
      body: envelope(),
      headers: { "if-none-match": "*", "cf-connecting-ip": "203.0.113.7" },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const stored = await bucket.head(`v2/${ID}`);
    expect(stored.customMetadata).toEqual({ auth: await authHash(TOKEN) });
    expect(JSON.stringify([...bucket.objects])).not.toContain("203.0.113.7");
  });

  it("refuses a second create", async () => {
    const { create } = worker();
    await create();
    const second = await create(envelope("C"));
    expect(await json(second)).toEqual({ status: 412, body: { error: "conflict" } });
  });

  it("updates only with the current ETag, quoted or weak", async () => {
    const { call, create } = worker();
    const etag = (await create()).headers.get("etag");
    const stale = await call("PUT", { body: envelope("C"), headers: { "if-match": '"0000"' } });
    expect(stale.status).toBe(412);
    const fresh = await call("PUT", { body: envelope("C"), headers: { "if-match": etag } });
    expect(fresh.status).toBe(204);
    const next = fresh.headers.get("etag");
    expect(next).not.toBe(etag);
    const weak = await call("PUT", { body: envelope("D"), headers: { "if-match": `W/${next}` } });
    expect(weak.status).toBe(204);
  });

  it("412s an update of a missing object", async () => {
    const { call } = worker();
    const response = await call("PUT", { body: envelope(), headers: { "if-match": '"x"' } });
    expect(response.status).toBe(412);
  });

  it("403s another token and leaves the object alone", async () => {
    const { bucket, call, create } = worker();
    const etag = (await create()).headers.get("etag");
    const before = bucket.storedText();
    const headers = { "if-match": etag };
    const response = await call("PUT", { token: STRANGER, body: envelope("C"), headers });
    expect(await json(response)).toEqual({ status: 403, body: { error: "forbidden" } });
    expect(bucket.storedText()).toEqual(before);
  });

  it("428s a write without a precondition", async () => {
    const response = await worker().call("PUT", { body: envelope() });
    expect(await json(response)).toEqual({ status: 428, body: { error: "precondition_required" } });
  });

  it("413s an oversized body, by header or by actual size", async () => {
    const { bucket, call } = worker();
    const body = envelope("B".repeat(10));
    const declared = await call("PUT", { body, maxBytes: 64, headers: { "if-none-match": "*" } });
    expect(declared.status).toBe(413);
    const headers = { "if-none-match": "*", "content-length": "10" };
    const lying = await call("PUT", { body, maxBytes: 64, headers });
    expect(lying.status).toBe(413);
    expect(bucket.objects.size).toBe(0);
  });

  it("stops reading a body without Content-Length as soon as it passes maxBytes", async () => {
    const { bucket, call } = worker();
    let pulled = 0;
    const body = new ReadableStream({
      pull(controller) {
        pulled++;
        if (pulled > 1000) controller.close();
        else controller.enqueue(new Uint8Array(32).fill(66));
      },
    });
    const response = await call("PUT", { body, maxBytes: 64, headers: { "if-none-match": "*" } });
    expect(response.status).toBe(413);
    expect(pulled).toBeLessThan(10);
    expect(bucket.objects.size).toBe(0);
  });

  it("400s anything but a v2 envelope", async () => {
    const { create } = worker();
    const bodies = ["not json", "{}", JSON.stringify({ v: 2, ct: "B".repeat(40) })];
    bodies.push(JSON.stringify({ v: 1, iv: "A".repeat(16), ct: "B".repeat(40) }));
    for (const body of bodies) {
      const response = await create(body);
      expect(await json(response)).toEqual({ status: 400, body: { error: "bad_envelope" } });
    }
  });

  it("412s when another write lands between head() and put()", async () => {
    const { bucket, call, create } = worker();
    const interleave = (fill) => async (key) => {
      bucket.beforePut = null;
      await bucket.put(key, envelope(fill), { customMetadata: { auth: await authHash(TOKEN) } });
    };
    bucket.beforePut = interleave("Z");
    expect((await create()).status).toBe(412);
    const etag = (await bucket.head(`v2/${ID}`)).httpEtag;
    bucket.beforePut = interleave("Y");
    const update = await call("PUT", { body: envelope("C"), headers: { "if-match": etag } });
    expect(update.status).toBe(412);
  });
});
