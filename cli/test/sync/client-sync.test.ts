import { describe, expect, it, vi } from "vitest";
import { reply, scriptedFetch, type Responder } from "./fakes/fetch.ts";
import { memoryStorage, type MemoryStorage } from "./fakes/storage.ts";
import { device, failure, KEY, openBody, remote, stored } from "./helpers.ts";

type Doc = { items: string[] };

const union = (local: Doc, other: Doc): Doc => ({
  items: [...new Set([...local.items, ...other.items])].toSorted(),
});

/** A real server's GET: `304` when `If-None-Match` is the current ETag, else the document. */
function conditional(storage: MemoryStorage, payload: unknown, etag: string): Responder {
  return (request) =>
    request.headers["if-none-match"] === etag
      ? reply(304, { headers: { etag } })(request)
      : remote(storage, payload, etag)(request);
}

async function enabled(script: (storage: MemoryStorage) => Responder[]) {
  const storage = memoryStorage();
  await device(storage, scriptedFetch()).enable();
  const server = scriptedFetch(...script(storage));
  return { storage, server, client: device(storage, server) };
}

describe("SyncClient.sync()", () => {
  it("merges the remote and uploads the result", async () => {
    const { storage, server, client } = await enabled((s) => [
      remote(s, { items: ["b"] }, '"e1"'),
      stored('"e2"'),
    ]);
    await expect(client.sync({ items: ["a"] }, union)).resolves.toEqual({ items: ["a", "b"] });
    expect(server.requests[1]?.headers["if-match"]).toBe('"e1"');
    await expect(openBody(storage, server.requests[1]?.body ?? null)).resolves.toEqual({
      items: ["a", "b"],
    });
  });

  it("uploads local data when nothing is stored remotely yet", async () => {
    const { server, client } = await enabled(() => [reply(404), stored('"e1"')]);
    await client.sync({ items: ["a"] }, union);
    expect(server.requests[1]?.headers["if-none-match"]).toBe("*");
  });

  it("pulls and merges again after a conflict", async () => {
    const merge = vi.fn<typeof union>(union);
    const { storage, server, client } = await enabled((s) => [
      remote(s, { items: ["b"] }, '"e1"'),
      reply(412),
      remote(s, { items: ["b", "c"] }, '"e2"'),
      stored('"e3"'),
    ]);
    await expect(client.sync({ items: ["a"] }, merge)).resolves.toEqual({ items: ["a", "b", "c"] });
    expect(merge).toHaveBeenCalledTimes(2);
    // The merged document was never stored remotely: re-read it in full.
    expect(server.requests[2]?.headers["if-none-match"]).toBeUndefined();
    expect(server.requests[3]?.headers["if-match"]).toBe('"e2"');
    await expect(openBody(storage, server.requests[3]?.body ?? null)).resolves.toEqual({
      items: ["a", "b", "c"],
    });
  });

  it("gives up after maxAttempts conflicts", async () => {
    const { server, client } = await enabled(() => [
      reply(404),
      reply(412),
      reply(404),
      reply(412),
    ]);
    await expect(client.sync({ items: ["a"] }, union, { maxAttempts: 2 })).rejects.toMatchObject(
      failure("conflict"),
    );
    expect(server.requests).toHaveLength(4);
  });

  it("does not retry other failures", async () => {
    const { server, client } = await enabled(() => [reply(404), reply(500)]);
    await expect(client.sync({ items: ["a"] }, union)).rejects.toMatchObject(
      failure("server_error"),
    );
    expect(server.requests).toHaveLength(2);
  });

  it("pushes against the ETag its own pull saw, not one another tab stored since", async () => {
    let otherTab = true;
    const merge = (local: Doc, other: Doc): Doc => {
      if (otherTab) {
        // Another tab (same storage) finished a sync between our pull and push.
        otherTab = false;
        const state = JSON.parse(storage.getItem(KEY) ?? "{}") as Record<string, unknown>;
        storage.setItem(KEY, JSON.stringify({ ...state, etag: '"e2"', fp: null }));
      }
      return union(local, other);
    };
    const { storage, server, client } = await enabled((s) => [
      remote(s, { items: ["b"] }, '"e1"'),
      reply(412),
      remote(s, { items: ["b", "t"] }, '"e2"'),
      stored('"e3"'),
    ]);
    await expect(client.sync({ items: ["a"] }, merge)).resolves.toEqual({
      items: ["a", "b", "t"],
    });
    expect(server.requests[1]?.headers["if-match"]).toBe('"e1"');
    expect(server.requests[3]?.headers["if-match"]).toBe('"e2"');
  });

  it("trusts a 304 only for the document it last synced, so an unsaved pull can't roll back", async () => {
    const { server, client } = await enabled((s) => [
      remote(s, { items: ["b"] }, '"e1"'),
      stored('"e2"'),
      conditional(s, { items: ["a", "b"] }, '"e2"'),
    ]);
    await client.sync({ items: ["a"] }, union);
    // The app never saved the merged ["a", "b"] and syncs its old document again.
    await expect(client.sync({ items: ["a"] }, union)).resolves.toEqual({ items: ["a", "b"] });
    expect(server.requests[2]?.headers["if-none-match"]).toBeUndefined();
    expect(server.requests).toHaveLength(3);
  });

  it("a 304 for the document it last synced means there is nothing to upload", async () => {
    const { server, client } = await enabled(() => [
      reply(404),
      stored('"e1"'),
      reply(304, { headers: { etag: '"e1"' } }),
    ]);
    await client.sync({ items: ["a"] }, union);
    await expect(client.sync({ items: ["a"] }, union)).resolves.toEqual({ items: ["a"] });
    expect(server.requests[2]?.headers["if-none-match"]).toBe('"e1"');
    expect(server.requests).toHaveLength(3);
  });

  it("skips the upload when the remote already has everything", async () => {
    const { server, client } = await enabled((s) => [remote(s, { items: ["a", "b"] }, '"e1"')]);
    await expect(client.sync({ items: ["a"] }, union)).resolves.toEqual({ items: ["a", "b"] });
    expect(server.requests).toHaveLength(1);
  });
});
