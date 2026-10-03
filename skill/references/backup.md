# Backup reference (`backup` extra)

`web-base add backup` gives an app a way out for its data: everything in
IndexedDB lives only on this device, Safari evicts it after seven days without
a visit unless the app is installed, and DSGVO wants an "alles löschen". Needs
`storage` and `layout`. Recommended for apps with real user data
(Hausverwaltung, Zeiterfassung, Tankzettel, ErinnerMich, Pizzateig,
Tennisturnier); not in `core`.

## Settings page

```tsx
import { BackupCard } from "../../lib/backup/index.ts";
import { getDB } from "../../lib/db/index.ts";

<BackupCard getDB={getDB} />
// sync apps:   beforeWipe={() => syncClient.disable({ deleteRemote: true })}
// new schema:  migrate={(file) => ({ ...file, stores: upgraded(file.stores) })}
```

„Daten & Sicherung" offers: *Sicherung exportieren* (a
`<db-name>-sicherung-YYYY-MM-DD.json` download), *Sicherung importieren*
(confirm, then replace everything), *Speicher dauerhaft machen*
(`navigator.storage.persist()`, only behind the button — Firefox prompts) with
the usage, and *Alle Daten löschen* (every store plus `localStorage`, then
back to `/`). Messages are German; errors are `BackupError`s with
user-facing text.

## The file

```json
{
  "format": "web-base-backup",
  "formatVersion": 1,
  "app": "<IndexedDB name>",
  "dbVersion": 3,
  "exportedAt": "2026-10-02T12:00:00.000Z",
  "stores": { "tenants": { "keyPath": "id", "autoIncrement": false, "records": [{ "v": { … } }] } }
}
```

Values go through a codec that keeps what JSON would silently lose: `Date`,
`Map`, `Set`, `Blob`/`File` (base64 with type and name), `ArrayBuffer` and
typed arrays, `undefined`, `NaN`/`±Infinity`, `bigint`. The file is **not
encrypted** — the card says so.

## Rules

- **Restore is all-or-nothing.** Everything is decoded first, then one
  readwrite transaction clears and refills every store; a bad record aborts
  it and nothing changes. Afterwards `notifyMutation` fires per store, so
  every `useLiveQuery` refreshes.
- **Compatibility.** Another app's backup, a newer `dbVersion`, or a store this
  database doesn't have is rejected. An older version is accepted — pass
  `migrate` if the data shape changed.
- **Programmatic use:** `exportBackup(db)`, `restoreBackup(db, file, { migrate })`,
  `importBackup(db, text)`, `wipeAllData(db)`, `getStorageStatus()`,
  `requestPersistentStorage()`, `formatBytes(n)` (de-DE).
