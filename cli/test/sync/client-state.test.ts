import { describe, expect, it } from "vitest";
import { base64urlEncode } from "../../templates/sync/client/encoding.ts";
import { decodePairingCode, formatPairingCode } from "../../templates/sync/client/pairing.ts";
import { reply, scriptedFetch } from "./fakes/fetch.ts";
import { memoryStorage, throwingStorage } from "./fakes/storage.ts";
import { device, ENDPOINT, failure, KEY, keysOf, stored, storedCode } from "./helpers.ts";

describe("SyncClient state", () => {
  it("works after a reload without calling isEnabled() first", async () => {
    const storage = memoryStorage();
    await device(storage, scriptedFetch()).enable();
    const server = scriptedFetch(stored('"e1"'), reply(304));
    const reloaded = device(storage, server);
    await reloaded.push({ n: 1 });
    await expect(reloaded.pull()).resolves.toEqual({ status: "unchanged" });
    const { objectId } = await keysOf(storage);
    expect(server.requests.map((r) => [r.method, r.url])).toEqual([
      ["PUT", `${ENDPOINT}/${objectId}`],
      ["GET", `${ENDPOINT}/${objectId}`],
    ]);
  });

  it("enable() never replaces an existing secret", async () => {
    const storage = memoryStorage();
    const client = device(storage, scriptedFetch());
    expect(client.isEnabled()).toBe(false);
    await client.enable();
    const code = storedCode(storage);
    await client.enable();
    await device(storage, scriptedFetch()).enable();
    expect(storedCode(storage)).toBe(code);
    expect(client.isEnabled()).toBe(true);
  });

  it("refuses to talk to the server before enable()", async () => {
    const server = scriptedFetch();
    const client = device(memoryStorage(), server);
    await expect(client.push({})).rejects.toMatchObject(failure("not_enabled"));
    await expect(client.pull()).rejects.toMatchObject(failure("not_enabled"));
    expect(server.requests).toEqual([]);
  });

  it("reads a blocked storage as disabled and refuses to enable", async () => {
    const client = device(throwingStorage(), scriptedFetch());
    expect(client.isEnabled()).toBe(false);
    await expect(client.enable()).rejects.toMatchObject(failure("storage_unavailable"));
  });
});

describe("SyncClient.disable()", () => {
  it("deletes the remote object, then forgets the secret", async () => {
    const storage = memoryStorage();
    const server = scriptedFetch(reply(204));
    const client = device(storage, server);
    await client.enable();
    const { objectId, authToken } = await keysOf(storage);
    await client.disable({ deleteRemote: true });
    expect(server.requests).toMatchObject([
      {
        method: "DELETE",
        url: `${ENDPOINT}/${objectId}`,
        headers: { authorization: `Bearer ${authToken}` },
      },
    ]);
    expect(client.isEnabled()).toBe(false);
    expect(storage.data.has(KEY)).toBe(false);
  });

  it("only forgets locally without deleteRemote, and is idempotent", async () => {
    const server = scriptedFetch();
    const client = device(memoryStorage(), server);
    await client.enable();
    await client.disable();
    await client.disable();
    expect(client.isEnabled()).toBe(false);
    expect(server.requests).toEqual([]);
  });

  it("keeps the secret when the delete fails, so it can be retried", async () => {
    const client = device(memoryStorage(), scriptedFetch(reply(500)));
    await client.enable();
    await expect(client.disable({ deleteRemote: true })).rejects.toMatchObject(
      failure("server_error"),
    );
    expect(client.isEnabled()).toBe(true);
  });
});

describe("SyncClient secrecy", () => {
  it("authenticates every request and never sends the secret or the code", async () => {
    const storage = memoryStorage();
    const server = scriptedFetch(
      stored('"e1"'),
      reply(304),
      reply(404),
      stored('"e2"'),
      reply(204),
    );
    const client = device(storage, server);
    await client.enable();
    const code = storedCode(storage);
    const secret = await decodePairingCode(code);
    const { authToken } = await keysOf(storage);
    await client.push({ note: "hello" });
    await client.pull();
    await client.sync({ note: "again" }, (local) => local);
    await client.disable({ deleteRemote: true });

    const needles = [
      code,
      formatPairingCode(code),
      base64urlEncode(secret),
      Array.from(secret, (b) => b.toString(16).padStart(2, "0")).join(""),
    ];
    expect(server.requests).toHaveLength(5);
    for (const request of server.requests) {
      expect(request.headers.authorization).toBe(`Bearer ${authToken}`);
      const wire = [request.url, JSON.stringify(request.headers), request.body ?? ""].join("\n");
      for (const needle of needles) expect(wire.toUpperCase()).not.toContain(needle.toUpperCase());
    }
  });
});
