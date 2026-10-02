import type { IDBPDatabase } from "idb";
import { clearStores, notifyMutation } from "../db/mutations.ts";
import { decodeValue, encodeValue } from "./codec.ts";
import {
  BACKUP_FORMAT,
  type BackupFile,
  checkCompatibility,
  FORMAT_VERSION,
  parseBackupFile,
} from "./format.ts";

export type RestoreOptions = {
  /** Reshape an older backup's data before it is written (schema changes). */
  migrate?: (file: BackupFile) => BackupFile;
};

// The functions take any schema; inside, the database is handled untyped.
const untyped = <S>(db: IDBPDatabase<S>) => db as unknown as IDBPDatabase;

/** Every store, every record, in one readonly transaction. */
export async function exportBackup<S>(database: IDBPDatabase<S>): Promise<BackupFile> {
  const db = untyped(database);
  const names = [...db.objectStoreNames];
  const dumps: {
    name: string;
    keyPath: string | string[] | null;
    autoIncrement: boolean;
    keys: IDBValidKey[];
    values: unknown[];
  }[] = [];
  if (names.length > 0) {
    const tx = db.transaction(names, "readonly");
    for (const name of names) {
      const store = tx.objectStore(name);
      const [values, keys] = await Promise.all([store.getAll(), store.getAllKeys()]);
      dumps.push({
        name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        keys,
        values,
      });
    }
    await tx.done;
  }
  // Encode after the transaction: reading Blobs inside it would let it commit early.
  const stores: BackupFile["stores"] = {};
  for (const d of dumps) {
    const inline = d.keyPath !== null;
    stores[d.name] = {
      keyPath: d.keyPath,
      autoIncrement: d.autoIncrement,
      records: await Promise.all(
        d.values.map(async (v, i) =>
          inline
            ? { v: await encodeValue(v) }
            : { k: await encodeValue(d.keys[i]), v: await encodeValue(v) },
        ),
      ),
    };
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: FORMAT_VERSION,
    app: db.name,
    dbVersion: db.version,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

/**
 * Replace the database's content with the backup — all stores, atomically.
 * Everything is decoded first, then one readwrite transaction clears and
 * refills every store; a single failing record aborts it, so nothing changes.
 */
export async function restoreBackup<S>(
  database: IDBPDatabase<S>,
  file: BackupFile,
  options: RestoreOptions = {},
): Promise<void> {
  const db = untyped(database);
  const source = options.migrate ? options.migrate(file) : file;
  checkCompatibility(source, db);
  const records = new Map(
    Object.entries(source.stores).map(([name, dump]) => [
      name,
      dump.records.map((r) => ({
        key: r.k === undefined ? undefined : (decodeValue(r.k) as IDBValidKey),
        value: decodeValue(r.v),
      })),
    ]),
  );
  const names = [...db.objectStoreNames];
  if (names.length === 0) return;
  const tx = db.transaction(names, "readwrite");
  // Only IDB requests may be awaited inside the transaction; queue them all, then wait.
  const requests: Promise<unknown>[] = [];
  for (const name of names) {
    const store = tx.objectStore(name);
    requests.push(store.clear());
    for (const { key, value } of records.get(name) ?? []) {
      requests.push(key === undefined ? store.put(value) : store.put(value, key));
    }
  }
  await Promise.all([...requests, tx.done]);
  for (const name of names) notifyMutation(name);
}

export async function importBackup<S>(
  db: IDBPDatabase<S>,
  text: string,
  options: RestoreOptions = {},
): Promise<void> {
  await restoreBackup(db, parseBackupFile(text), options);
}

/** „Alle Daten löschen": every store, plus this origin's localStorage (settings, sync secret). */
export async function wipeAllData<S>(db: IDBPDatabase<S>): Promise<void> {
  await clearStores(untyped(db));
  try {
    localStorage.clear();
  } catch {
    // Storage unavailable (private mode): nothing persisted there to clear.
  }
}
