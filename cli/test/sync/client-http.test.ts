import { afterEach, describe, expect, it } from "vitest";
import { hang, networkError, reply, scriptedFetch, type Responder } from "./fakes/fetch.ts";
import { memoryStorage } from "./fakes/storage.ts";
import { device, failure, openBody, remote, stored } from "./helpers.ts";

async function enabled(...responders: Responder[]) {
  const storage = memoryStorage();
  const server = scriptedFetch(...responders);
  const client = device(storage, server, 50);
  await client.enable();
  return { storage, server, client };
}

describe("push / pull", () => {
  it("creates with If-None-Match: *, then updates with If-Match", async () => {
    const { storage, server, client } = await enabled(stored('"e1"'), stored('"e2"'));
    await client.push({ n: 1 });
    await client.push({ n: 2 });
    const [create, update] = server.requests;
    expect(create?.headers).toMatchObject({
      "if-none-match": "*",
      "content-type": "application/json",
    });
    expect(create?.headers).not.toHaveProperty("if-match");
    expect(update?.headers).toMatchObject({ "if-match": '"e1"' });
    expect(update?.headers).not.toHaveProperty("if-none-match");
    await expect(openBody(storage, update?.body ?? null)).resolves.toEqual({ n: 2 });
  });

  it("turns 412 into a conflict", async () => {
    const { client } = await enabled(stored('"e1"'), reply(412));
    await client.push({ n: 1 });
    await expect(client.push({ n: 2 })).rejects.toMatchObject({
      ...failure("conflict"),
      status: 412,
    });
  });

  it("reports a missing object and forgets the ETag", async () => {
    const { server, client } = await enabled(stored('"e1"'), reply(404), stored('"e2"'));
    await client.push({ n: 1 });
    await expect(client.pull()).resolves.toEqual({ status: "missing" });
    await client.push({ n: 2 });
    expect(server.requests[2]?.headers["if-none-match"]).toBe("*");
  });

  it("reports unchanged on 304", async () => {
    const { server, client } = await enabled(stored('"e1"'), reply(304));
    await client.push({ n: 1 });
    await expect(client.pull()).resolves.toEqual({ status: "unchanged" });
    expect(server.requests[1]?.headers["if-none-match"]).toBe('"e1"');
  });

  it("decrypts updates and remembers their ETag", async () => {
    const storage = memoryStorage();
    await device(storage, scriptedFetch()).enable();
    const server = scriptedFetch(remote(storage, { n: 7 }, 'W/"e9"'), reply(304));
    const client = device(storage, server);
    await expect(client.pull()).resolves.toEqual({ status: "updated", data: { n: 7 } });
    await client.pull();
    expect(server.requests[0]?.headers).not.toHaveProperty("if-none-match");
    expect(server.requests[1]?.headers["if-none-match"]).toBe('W/"e9"');
  });
});

describe("failures", () => {
  it("rejects malformed responses as bad_response", async () => {
    const etag = { etag: '"e1"' };
    const { client } = await enabled(
      reply(200, { body: "<html>", headers: etag }),
      reply(200, { body: '{"v":2,"iv":"short","ct":"x"}', headers: etag }),
      reply(200, { body: '{"v":"2"}', headers: etag }),
    );
    for (let i = 0; i < 3; i++) {
      await expect(client.pull()).rejects.toMatchObject(failure("bad_response"));
    }
  });

  it("insists on an ETag after a successful write", async () => {
    const { client } = await enabled(reply(204));
    await expect(client.push({})).rejects.toMatchObject(failure("bad_response"));
  });

  it("refuses a v1 envelope as unsupported_version", async () => {
    const v1 = JSON.stringify({ ciphertext: "AAAA", iv: "AAAA", v: 1 });
    const { client } = await enabled(reply(200, { body: v1, headers: { etag: '"e1"' } }));
    await expect(client.pull()).rejects.toMatchObject(failure("unsupported_version"));
  });

  it("passes Retry-After through on 429", async () => {
    const { client } = await enabled(reply(429, { headers: { "retry-after": "60" } }));
    await expect(client.pull()).rejects.toMatchObject({
      ...failure("rate_limited"),
      status: 429,
      retryAfter: 60,
    });
  });

  it("maps a network failure to offline", async () => {
    const { client } = await enabled(networkError());
    await expect(client.pull()).rejects.toMatchObject(failure("offline"));
  });

  it("times out a silent server", async () => {
    const { client } = await enabled(hang());
    await expect(client.pull()).rejects.toMatchObject(failure("timeout"));
  });

  it("honours the caller's AbortSignal", async () => {
    const { server, client } = await enabled(hang());
    const controller = new AbortController();
    const pending = client.pull({ signal: controller.signal, timeoutMs: 5000 });
    setTimeout(() => controller.abort(), 5);
    await expect(pending).rejects.toMatchObject(failure("aborted"));
    await expect(client.push({}, { signal: AbortSignal.abort() })).rejects.toMatchObject(
      failure("aborted"),
    );
    expect(server.requests).toHaveLength(1);
  });

  describe("without AbortSignal.any (Safari < 17.4)", () => {
    const original = AbortSignal.any;
    afterEach(() => {
      Object.defineProperty(AbortSignal, "any", { value: original, configurable: true });
    });

    it("still tells an abort from a timeout", async () => {
      Object.defineProperty(AbortSignal, "any", { value: undefined, configurable: true });
      const { client } = await enabled(hang(), hang());
      const controller = new AbortController();
      const pending = client.pull({ signal: controller.signal });
      setTimeout(() => controller.abort(), 5);
      await expect(pending).rejects.toMatchObject(failure("aborted"));
      const signal = new AbortController().signal;
      await expect(client.pull({ signal })).rejects.toMatchObject(failure("timeout"));
    });
  });
});
