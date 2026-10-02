// Not typechecked (see tsconfig.templates.json): worker/sync.ts needs Workers types.
import { describe, expect, it } from "vitest";
import { SyncClient } from "../../templates/sync/client/client.ts";
import { handleSync } from "../../templates/sync/worker/sync.ts";
import { handlerFetch } from "./fakes/fetch.ts";
import { FakeR2Bucket } from "./fakes/r2.ts";
import { memoryStorage } from "./fakes/storage.ts";
import { failure, storedCode } from "./helpers.ts";

const MARKER = "PLAINTEXT-MARKER-4711";
const union = (local, remote) => ({
  notes: [...new Set([...local.notes, ...remote.notes])].toSorted(),
});

function world() {
  const bucket = new FakeR2Bucket();
  const server = handlerFetch((request) => handleSync(request, { SYNC: bucket }));
  const device = () => {
    const storage = memoryStorage();
    return { storage, client: new SyncClient({ storage, fetch: server.fetch }) };
  };
  return { bucket, server, device };
}

describe("end to end: client ⇄ Worker ⇄ R2", () => {
  it("pairs a second device that then reads the first device's data", async () => {
    const { device } = world();
    const a = device();
    const b = device();
    await a.client.enable();
    await a.client.push({ notes: ["from A"] });
    await b.client.importPairingCode(a.client.pairingCode());
    await expect(b.client.pull()).resolves.toEqual({
      status: "updated",
      data: { notes: ["from A"] },
    });
    await expect(b.client.pull()).resolves.toEqual({ status: "unchanged" });
  });

  it("merges concurrent edits via sync()", async () => {
    const { device } = world();
    const a = device();
    const b = device();
    await a.client.enable();
    await a.client.sync({ notes: ["base"] }, union);
    await b.client.importPairingCode(a.client.pairingCode());
    await b.client.sync({ notes: [] }, union);

    await a.client.sync({ notes: ["base", "A"] }, union);
    // B edits on a stale ETag: a plain push conflicts, sync() resolves it.
    await expect(b.client.push({ notes: ["base", "B"] })).rejects.toMatchObject(
      failure("conflict"),
    );
    const merged = await b.client.sync({ notes: ["base", "B"] }, union);
    expect(merged).toEqual({ notes: ["A", "B", "base"] });
    await expect(a.client.sync({ notes: ["base", "A"] }, union)).resolves.toEqual(merged);
  });

  it("keeps different secrets apart", async () => {
    const { bucket, device } = world();
    const a = device();
    const c = device();
    await a.client.enable();
    await a.client.push({ notes: ["A only"] });
    await c.client.enable();
    await expect(c.client.pull()).resolves.toEqual({ status: "missing" });
    await c.client.push({ notes: ["C only"] });
    expect(bucket.objects.size).toBe(2);
  });

  it("deletes everything on disable({ deleteRemote: true })", async () => {
    const { bucket, device } = world();
    const a = device();
    await a.client.enable();
    await a.client.push({ notes: ["bye"] });
    expect(bucket.objects.size).toBe(1);
    await a.client.disable({ deleteRemote: true });
    expect(bucket.objects.size).toBe(0);
    expect(a.client.isEnabled()).toBe(false);
  });

  it("stores nothing the server could read", async () => {
    const { bucket, server, device } = world();
    const a = device();
    await a.client.enable();
    await a.client.push({ notes: [MARKER] });
    await a.client.sync({ notes: [MARKER, "more"] }, union);
    const code = storedCode(a.storage);
    const stored = bucket.storedText().join("\n");
    expect(stored).not.toContain(MARKER);
    expect(stored).not.toContain(code);
    const metadata = JSON.stringify([...bucket.objects.values()].map((o) => o.meta));
    expect(metadata).not.toContain(code);
    for (const request of server.requests) expect(JSON.stringify(request)).not.toContain(code);
  });
});
