# Sync (end-to-end encrypted, protocol v2)

This app syncs one JSON document between a user's devices through Cloudflare
R2. Devices share a random secret; the Worker only ever stores ciphertext and
cannot read, forge or link it to a person. There is no account and no email.

Installed by `web-base add sync`. The files under `src/lib/sync/` (except
`index.ts`) and `worker/sync*.ts` are owned by web-base — `update` replaces
them. This document and `src/lib/sync/index.ts` are the app's own; add the
app's schema and merge notes below.

## Protocol

### Keys

- **Root secret:** 16 random bytes, created by `syncClient.enable()` on the
  first device and copied to the others by pairing.
- **HKDF-SHA256** with salt `daniel-rck/web-base sync v2` and three `info`
  labels derives independent values:

  | info | Output | Use |
  |---|---|---|
  | `daniel-rck/web-base sync v2/enc` | AES-GCM-256 key, non-extractable | encrypts the document |
  | `daniel-rck/web-base sync v2/id` | 80 bits → 16 Crockford base32 chars | `objectId`, the name on the server |
  | `daniel-rck/web-base sync v2/auth` | 256 bits → 43 base64url chars | bearer token |

  Knowing the object id or the token reveals nothing about the key or the
  secret.

### Envelope

```json
{ "v": 2, "iv": "<base64url, 12 bytes>", "ct": "<base64url, AES-GCM output>" }
```

The plaintext is `JSON.stringify(document)`; the additional authenticated data
is `web-base-sync/v2/<objectId>`, so a ciphertext cannot be moved to another
object. `v` versions the **wire format** only and must be `2`
(`unsupported_version` otherwise). Version the app's own data schema inside the
document.

### Pairing code and link

```
Crockford base32( 0x02 | secret (16 bytes) | first 2 bytes of SHA-256("web-base-sync pairing" | 0x02 | secret) )
```

19 bytes → 31 characters, shown in groups of four
(`0800-20G3-0G2G-C1R8-1450-P30D-1R7W-VC8`). Input is forgiving: case,
spaces and hyphens are ignored, `I`/`L` read as `1`, `O` as `0`; a wrong
length, version or checksum is `invalid_code`. The link is the same string in
the fragment — `https://<app>/#sync=<code>` (HashRouter apps may also use
`#/route?sync=<code>`). Browsers never send the fragment to the server.

### Worker routes

All under `/api/sync/<objectId>` with `Authorization: Bearer <token>`. Every
response is `cache-control: no-store`; errors are `{ "error": "<code>" }`.

| Request | Answer |
|---|---|
| `GET` (optionally `If-None-Match: <etag>`) | `200` envelope + `ETag`, `304` unchanged, `404` missing, `403` other token |
| `PUT` + `If-None-Match: *` | create: `204` + `ETag`, `412` exists |
| `PUT` + `If-Match: <etag>` | update: `204` + `ETag`, `412` stale or missing, `403` other token |
| `PUT` without either | `428` |
| `PUT` over 8 MiB / not an envelope | `413` / `400` |
| `DELETE` | `204` (also when missing), `403` other token |
| other methods | `405` with `Allow: GET, PUT, DELETE` |
| any, rate limited | `429` with `Retry-After: 60` |

The first `PUT` binds the object to `hex(SHA-256(token))` (R2 custom metadata).
The R2 key is `v2/<objectId>`. Nothing else is stored: no IP addresses, no
timestamps beyond R2's own.

### Client state

`localStorage["web-base-sync"] = { "v": 2, "code": "<pairing code>", "etag": "<last ETag>" | null }`.
Every `SyncClient` method reads it fresh, so a reload or a second tab needs no
initialization. A corrupt or older state is removed (the device then shows as
not set up).

## Threat model

- **The pairing code is the root secret, forever.** Whoever has it can read
  and overwrite the data. It leaks through browser history and history sync
  (the link is visited before `consumePairingFragment()` cleans the address
  bar), screenshots of the QR code, chats and messengers, clipboard managers
  and shoulder surfing. Show it only on request and only on the user's screen.
- **Rotation:** on one device `await syncClient.disable({ deleteRemote: true })`,
  then `await syncClient.enable()` and pair every other device again (they
  need `importPairingCode(code, { replace: true })`). The old code then points
  at nothing.
- **The server (or whoever controls the Cloudflare account)** sees object ids,
  sizes and timing, and can delete or withhold data. It cannot decrypt, cannot
  forge an envelope, and cannot move one between objects. **It can roll back:**
  replaying an older envelope is not detected. If that matters, keep a
  monotonic revision in the document and warn when a pulled one is older than
  the last one seen.
- **A leaked object id** (logs, analytics) gives neither read nor write — every
  request needs the token. A leaked token allows deleting and overwriting with
  garbage, not reading.
- **XSS defeats everything.** Script running in the app's origin can read the
  code from `localStorage` — and could use a non-extractable key just as well,
  so storing the secret differently would not help. The defence is a strict
  Content-Security-Policy (`script-src 'self'`) and no third-party scripts.
- **iOS:** an installed PWA (home screen) does not share storage with Safari. A
  QR code scanned with the camera opens Safari, so pairing lands there. Inside
  the installed app, use the manual code instead.

## Wiring

`src/main.tsx` — take the code out of the URL **before** the router reads it:

```tsx
import { consumePairingFragment, isSyncError, syncClient, syncErrorMessage } from "./lib/sync/index.ts";

const pairing = consumePairingFragment();
if (pairing) await adoptPairing(pairing);
// … then createRoot(…).render(<RouterProvider router={router} />)

async function adoptPairing(code: string): Promise<void> {
  try {
    await syncClient.importPairingCode(code);
  } catch (error) {
    if (!isSyncError(error, "already_enabled")) {
      window.alert(isSyncError(error) ? syncErrorMessage(error.code) : String(error));
      return;
    }
    const replace = window.confirm(
      "Dieses Gerät ist bereits mit einer anderen Synchronisierung verbunden. " +
        "Möchtest du sie ersetzen? Die Daten auf diesem Gerät werden danach mit " +
        "der neuen Synchronisierung zusammengeführt.",
    );
    if (replace) await syncClient.importPairingCode(code, { replace: true });
  }
}
```

Use the app's own dialog instead of `confirm` where it has one. A manual code
field calls the same `importPairingCode(input)`; show
`syncErrorMessage(error.code)` for `invalid_code`.

## Merging

`syncClient.sync(local, merge)` pulls, calls `merge(local, remote)`, pushes the
result and retries on a conflict (up to three times). It returns the merged
document — **persist it locally**. `merge` may run more than once, so it must
be deterministic and idempotent. Last-writer-wins per record with tombstones:

```ts
type SyncedRecord<T> = { updatedAt: number; deleted?: true; value?: T };
type SyncDoc<T> = { schema: 1; records: Record<string, SyncedRecord<T>> };

export function merge<T>(local: SyncDoc<T>, remote: SyncDoc<T>): SyncDoc<T> {
  if (remote.schema > local.schema) throw new Error("Bitte aktualisiere die App.");
  const records = { ...remote.records };
  for (const [id, mine] of Object.entries(local.records)) {
    const theirs = records[id];
    if (!theirs || mine.updatedAt > theirs.updatedAt) records[id] = mine;
  }
  return { schema: local.schema, records };
}
```

Deleting sets `deleted: true` and a new `updatedAt` instead of dropping the
record, otherwise the next merge brings it back. Call `sync()` on start, when
the tab becomes visible again, on `online`, and (debounced) after local edits.
Treat `offline`, `timeout` and `rate_limited` (`error.retryAfter` seconds) as
"try later"; show `syncErrorMessage(error.code)` for everything else.

## Pairing QR code

The template ships no QR library. With [`uqr`](https://github.com/unjs/uqr)
(MIT, no dependencies; `bun add uqr`):

```tsx
import { renderSVG } from "uqr";
import { syncClient } from "../lib/sync/index.ts";

export function PairingQr() {
  const url = syncClient.pairingUrl();
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(renderSVG(url))}`;
  return (
    <figure>
      <img src={src} alt="QR-Code zum Koppeln eines weiteren Geräts" width={240} height={240} />
      <figcaption>
        Oder gib diesen Code auf dem anderen Gerät ein: <code>{syncClient.pairingCode()}</code>
      </figcaption>
    </figure>
  );
}
```

## App notes

<!-- The app's document schema, merge rules and anything that deviates. -->
