import type { DBSchema } from "idb";
import { clearStores } from "./mutations.ts";
import { createDBOpener } from "./open.ts";

// Your app's schema. Each store gets a `key`/`value` shape and (optionally)
// named indexes.
export interface AppSchema extends DBSchema {
  // Example:
  // tenants: {
  //   key: string;
  //   value: { id: string; name: string; createdAt: number };
  //   indexes: { byName: string };
  // };
  //
  // Delete this index signature once real stores exist: while it is here any
  // string typechecks as a store name and every value is `unknown`.
  [storeName: string]: { key: IDBValidKey; value: unknown };
}

export const getDB = createDBOpener<AppSchema>({
  // Unique per app: in local dev every app shares the localhost origin, so two
  // apps with the same name would share (and upgrade) one database.
  name: "<app-name>",
  version: 1,
  upgrade(db, oldVersion) {
    // The migration ladder. `oldVersion` is 0 on a fresh install, so a new user
    // runs every step and an existing one only the steps they're missing.
    // Never edit a step that has shipped: bump `version` and add a new
    // `if (oldVersion < N)` below the last one.
    if (oldVersion < 1) {
      // Example:
      // db.createObjectStore("tenants", { keyPath: "id" }).createIndex("byName", "name");
    }
    // if (oldVersion < 2) { … }
    void db;
  },
});

/** Wipe every store (tests' `beforeEach`, a "delete all data" action). */
export async function clearAll(): Promise<void> {
  await clearStores(await getDB());
}

export { notifyMutation } from "./mutations.ts";
