import { type IDBPDatabase, openDB } from "idb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportBackup, importBackup, restoreBackup, wipeAllData } from "../../lib/backup/backup.ts";
import { BackupError } from "../../lib/backup/format.ts";

let db: IDBPDatabase;
let name: string;

beforeEach(async () => {
  name = `backup-test-${crypto.randomUUID()}`;
  db = await openDB(name, 2, {
    upgrade(d) {
      d.createObjectStore("tenants", { keyPath: "id" });
      d.createObjectStore("notes", { autoIncrement: true });
    },
  });
  await db.put("tenants", { id: "t1", name: "Erika", since: new Date("2024-01-01") });
  await db.put("notes", "Zählerstand ablesen", 7);
});

afterEach(() => db.close());

describe("backup", () => {
  it("exports and restores in-line and out-of-line keys, including Dates", async () => {
    const text = JSON.stringify(await exportBackup(db));
    await wipeAllData(db);
    expect(await db.count("tenants")).toBe(0);
    await importBackup(db, text);
    expect(await db.get("tenants", "t1")).toEqual({
      id: "t1",
      name: "Erika",
      since: new Date("2024-01-01"),
    });
    expect(await db.get("notes", 7)).toBe("Zählerstand ablesen");
  });

  it("rejects a backup from another app, a newer version or with unknown stores", async () => {
    const file = await exportBackup(db);
    await expect(restoreBackup(db, { ...file, app: "andere-app" })).rejects.toThrow(/anderen App/);
    await expect(restoreBackup(db, { ...file, dbVersion: 99 })).rejects.toThrow(/neueren Version/);
    const extra = {
      ...file,
      stores: { ...file.stores, ghosts: { keyPath: null, autoIncrement: false, records: [] } },
    };
    await expect(restoreBackup(db, extra)).rejects.toBeInstanceOf(BackupError);
    await expect(importBackup(db, "{ kein json")).rejects.toThrow(/keine gültige Sicherung/);
  });

  it("changes nothing when one record fails", async () => {
    const file = await exportBackup(db);
    const tenants = file.stores.tenants;
    if (!tenants) throw new Error("no tenants dump");
    // A record without its in-line key makes put() fail inside the transaction.
    tenants.records.push({ v: { name: "ohne id" } });
    await expect(restoreBackup(db, file)).rejects.toBeDefined();
    expect(await db.get("tenants", "t1")).toMatchObject({ name: "Erika" });
    expect(await db.count("notes")).toBe(1);
  });
});
