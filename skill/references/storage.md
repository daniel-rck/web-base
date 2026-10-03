# Storage reference

IndexedDB via the `idb` library, plus a tiny `useLiveQuery` hook for
reactive queries.

Files in `src/lib/db/`:

| File | Policy | What it holds |
|---|---|---|
| `open.ts` | owned | `createDBOpener()` — one cached connection and its lifecycle |
| `mutations.ts` | owned | `mutationChannel()`, `notifyMutation()`, `clearStores()` |
| `useLiveQuery.ts` | owned | the reactive query hook |
| `db.ts` | scaffold | `AppSchema`, the database name, the migration ladder, `clearAll()` |
| `index.ts` | scaffold | barrel |

Edit `db.ts` only. The owned files are overwritten by `web-base update`.

## Opening the DB

```typescript
import type { DBSchema } from "idb";
import { clearStores } from "./mutations.ts";
import { createDBOpener } from "./open.ts";

export interface AppSchema extends DBSchema {
  tenants: {
    key: string;
    value: { id: string; name: string; createdAt: number };
    indexes: { byName: string };
  };
}

export const getDB = createDBOpener<AppSchema>({
  name: "hausverwaltung", // unique per app: in local dev every app shares localhost
  version: 2,
  upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      db.createObjectStore("tenants", { keyPath: "id" });
    }
    if (oldVersion < 2) {
      tx.objectStore("tenants").createIndex("byName", "name");
    }
  },
});

export async function clearAll(): Promise<void> {
  await clearStores(await getDB());
}

export { notifyMutation } from "./mutations.ts";
```

Delete the scaffold's `[storeName: string]` index signature as soon as the
first real store exists — while it is there any string typechecks as a store
name and every value is `unknown`.

### The migration ladder

- One `if (oldVersion < N)` step per schema version, in ascending order.
- `oldVersion` is 0 on a fresh install, so a new user runs every step and an
  existing user only the ones they're missing.
- **Never edit a step that has shipped.** Users who already ran it won't run it
  again. Bump `version` and add a step.
- Inside `upgrade`, use the `tx` argument (the versionchange transaction) to
  reach existing stores — e.g. to add an index or migrate records. Don't open
  another transaction there.

### Connection lifecycle

`createDBOpener` caches one connection and handles what IndexedDB leaves to
the app:

| Event | What happens |
|---|---|
| Another tab opens a newer version (`blocking`) | The connection closes so that upgrade isn't blocked, then `onVersionChange()` runs — default: `location.reload()` |
| The browser drops the connection (`terminated`, Safari) | Forgotten; the next `getDB()` reopens |
| The open fails (`VersionError`, quota, private mode) | Not cached; the next `getDB()` retries |
| This tab's upgrade waits for another tab (`blocked`) | `console.warn` |

Pass `onVersionChange` when a reload could lose unsaved input — show a
"Neue Version verfügbar — bitte neu laden" banner instead. Until the reload,
`getDB()` rejects with `VersionError`.

## useLiveQuery hook

```typescript
function useLiveQuery<T>(
  storeName: string,
  query: () => Promise<T>,
  deps?: unknown[],
): { data: T | undefined; loading: boolean; error: Error | undefined };
```

Subscribes to the `db:<storeName>` and `db:*` BroadcastChannels
(`mutationChannel(storeName)` / `mutationChannel("*")`). Re-runs the query
on mount, when `storeName` or `deps` change, and whenever a mutation is
signalled — in this tab or another one.

What the component sees:

| Situation | Result |
|---|---|
| First run for the current `[storeName, ...deps]` pending | `{ data: undefined, loading: true, error: undefined }` — never the previous key's data |
| Re-run after a mutation (same key) | the current data, `loading: false`, until the new data arrives |
| A run failed | the last good data for that key, `loading: false`, `error` set (non-`Error` throws wrapped) |
| Two runs overlap | the newest one wins; an overtaken run never commits |

The result object keeps its identity until it changes, so it is safe in a
dependency list. `query` may be an inline closure — the hook always calls the
newest one (`useEffectEvent`) without re-subscribing. Pass everything the
query closes over that should trigger a re-run as `deps`:

```typescript
const { data: tenant } = useLiveQuery(
  "tenants",
  async () => (await getDB()).get("tenants", tenantId),
  [tenantId],
);
```

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

For a multi-store transaction, notify each store after `await tx.done` — or
`notifyMutation("*")` to re-run every live query.

## Migrating from Dexie

| Dexie | idb |
|---|---|
| `db.tenants.toArray()` | `db.getAll("tenants")` |
| `db.tenants.where("name").equals(x).toArray()` | `db.getAllFromIndex("tenants", "byName", x)` |
| `useLiveQuery(() => ...)` (`dexie-react-hooks`) | `useLiveQuery("tenants", () => ...)` |
| `db.version(2).stores({...})` | `if (oldVersion < 2) { … }` in `upgrade` |

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

`clearAll()` wipes every store in one transaction and emits a global mutation
event. Use it in test `beforeEach`:

```typescript
beforeEach(async () => {
  await clearAll();
});
```
