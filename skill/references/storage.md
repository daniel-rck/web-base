# Storage reference

IndexedDB via the `idb` library, plus a tiny `useLiveQuery` hook for
reactive queries.

## Opening the DB

```typescript
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface AppSchema extends DBSchema {
  tenants: {
    key: string;
    value: { id: string; name: string; createdAt: number };
    indexes: { byName: string };
  };
}

const DB_NAME = "app";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<AppSchema>> | null = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<AppSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("tenants")) {
          const store = db.createObjectStore("tenants", { keyPath: "id" });
          store.createIndex("byName", "name");
        }
      },
    });
  }
  return dbPromise;
}
```

## useLiveQuery hook

```typescript
function useLiveQuery<T>(
  storeName: string,
  query: () => Promise<T>,
  deps?: unknown[],
): { data: T | undefined; loading: boolean; error: Error | undefined };
```

Subscribes to the `db:<storeName>` and `db:*` BroadcastChannels. Re-runs
the query whenever a mutation is signalled.

Usage:

```typescript
function TenantList() {
  const { data, loading } = useLiveQuery("tenants", async () => {
    const db = await getDB();
    return db.getAll("tenants");
  });
  if (loading) return <Spinner />;
  return <ul>{data?.map((t) => <li key={t.id}>{t.name}</li>)}</ul>;
}
```

Mutations must call `notifyMutation(storeName)` after a successful write
so subscribers re-query:

```typescript
async function addTenant(t: Tenant) {
  const db = await getDB();
  await db.put("tenants", t);
  notifyMutation("tenants");
}
```

## Migrating from Dexie

| Dexie | idb |
|---|---|
| `db.tenants.toArray()` | `db.getAll("tenants")` |
| `db.tenants.where("name").equals(x).toArray()` | `db.getAllFromIndex("tenants", "byName", x)` |
| `useLiveQuery(() => ...)` (`dexie-react-hooks`) | `useLiveQuery("tenants", () => ...)` |
| `db.version(2).stores({...})` | `upgrade(db, oldVersion, newVersion)` callback |

Drop `dexie` and `dexie-react-hooks` from `package.json`. The local
`useLiveQuery` replaces both.

## Migrating from localStorage

Move to idb when:
- Records are queryable (filter, sort, paginate).
- Records grow beyond a few KB.
- Multiple components need reactive updates.

Keep in localStorage when:
- Single settings flag (theme override, last-opened tab).
- Total size < ~10 KB.

## Indexing patterns

- Add an `index` for any field you `.where()` on.
- Use compound keys for natural composites (e.g. `[tenantId, year]`).
- Don't add indexes "just in case" — they cost write throughput.

## Testing

`clearAll()` wipes every store and emits a global mutation event. Use it
in test `beforeEach`.

```typescript
beforeEach(async () => {
  await clearAll();
});
```
