import { describe, expect, it } from "vitest";
import { consumePairingFragment, type PairingWindow } from "../../templates/sync/client/pairing.ts";
import { scriptedFetch } from "./fakes/fetch.ts";
import { memoryStorage } from "./fakes/storage.ts";
import { device, failure, stored, storedCode } from "./helpers.ts";

const GROUPED = /^([0-9A-HJKMNP-TV-Z]{4}-){7}[0-9A-HJKMNP-TV-Z]{3}$/;

async function firstDevice() {
  const storage = memoryStorage();
  const client = device(storage, scriptedFetch());
  await client.enable();
  return { storage, client, code: storedCode(storage) };
}

describe("SyncClient pairing", () => {
  it("shows the code grouped and links to it", async () => {
    const { client, code } = await firstDevice();
    expect(client.pairingCode()).toMatch(GROUPED);
    expect(client.pairingCode().replaceAll("-", "")).toBe(code);
    expect(client.pairingUrl("https://app.test/")).toBe(`https://app.test/#sync=${code}`);
  });

  it("needs a secret before it can show one", () => {
    const client = device(memoryStorage(), scriptedFetch());
    expect(() => client.pairingCode()).toThrow(expect.objectContaining(failure("not_enabled")));
    expect(() => client.pairingUrl()).toThrow(expect.objectContaining(failure("not_enabled")));
  });

  it("pairs a new device from the typed code", async () => {
    const a = await firstDevice();
    const storage = memoryStorage();
    const b = device(storage, scriptedFetch());
    await b.importPairingCode(` ${a.client.pairingCode().toLowerCase()} `);
    expect(storedCode(storage)).toBe(a.code);
    expect(b.pairingCode()).toBe(a.client.pairingCode());
  });

  it("pairs a new device from the scanned link", async () => {
    const a = await firstDevice();
    const { hash, pathname, search } = new URL(a.client.pairingUrl("https://app.test/"));
    const history = { state: null, replaceState: () => {} };
    const win: PairingWindow = { location: { hash, pathname, search }, history };
    const code = consumePairingFragment(win);
    const storage = memoryStorage();
    await device(storage, scriptedFetch()).importPairingCode(code ?? "");
    expect(storedCode(storage)).toBe(a.code);
  });

  it("refuses to silently replace a different secret", async () => {
    const a = await firstDevice();
    const b = await firstDevice();
    await expect(b.client.importPairingCode(a.code)).rejects.toMatchObject(
      failure("already_enabled"),
    );
    expect(storedCode(b.storage)).toBe(b.code);
  });

  it("replaces on request and starts over with no ETag", async () => {
    const a = await firstDevice();
    const storage = memoryStorage();
    const server = scriptedFetch(stored('"e1"'), stored('"e2"'));
    const b = device(storage, server);
    await b.enable();
    await b.push({ mine: true });
    await b.importPairingCode(a.code, { replace: true });
    expect(storedCode(storage)).toBe(a.code);
    await b.push({ mine: false });
    expect(server.requests[1]?.headers["if-none-match"]).toBe("*");
    expect(server.requests[1]?.url).not.toBe(server.requests[0]?.url);
  });

  it("treats the same code again as a no-op", async () => {
    const storage = memoryStorage();
    const server = scriptedFetch(stored('"e1"'), stored('"e2"'));
    const client = device(storage, server);
    await client.enable();
    await client.push({ n: 1 });
    await client.importPairingCode(client.pairingCode().toLowerCase());
    await client.push({ n: 2 });
    expect(server.requests[1]?.headers["if-match"]).toBe('"e1"');
  });

  it("rejects an invalid code without touching the state", async () => {
    const { client, storage, code } = await firstDevice();
    await expect(client.importPairingCode("0000-1111")).rejects.toMatchObject(
      failure("invalid_code"),
    );
    // Flip the checksum bits in the last symbol ("0" and "8" both have zero padding).
    const typo = `${code.slice(0, -1)}${code.endsWith("0") ? "8" : "0"}`;
    await expect(
      device(memoryStorage(), scriptedFetch()).importPairingCode(typo),
    ).rejects.toMatchObject(failure("invalid_code"));
    expect(storedCode(storage)).toBe(code);
  });
});
