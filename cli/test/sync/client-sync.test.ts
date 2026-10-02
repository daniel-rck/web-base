import { describe, expect, it, vi } from "vitest";
import { reply, scriptedFetch, type Responder } from "./fakes/fetch.ts";
import { memoryStorage, type MemoryStorage } from "./fakes/storage.ts";
import { device, failure, openBody, remote, stored } from "./helpers.ts";

type Doc = { items: string[] };

const union = (local: Doc, other: Doc): Doc => ({
  items: [...new Set([...local.items, ...other.items])].toSorted(),
});

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
    expect(server.requests[2]?.headers["if-none-match"]).toBe('"e1"');
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

  it("skips the upload when the remote already has everything", async () => {
    const { server, client } = await enabled((s) => [remote(s, { items: ["a", "b"] }, '"e1"')]);
    await expect(client.sync({ items: ["a"] }, union)).resolves.toEqual({ items: ["a", "b"] });
    expect(server.requests).toHaveLength(1);
  });
});
