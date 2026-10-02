# Sync reference

End-to-end encrypted device sync of one JSON document over Cloudflare R2,
paired by QR link or typed code. Extra, not in `core`. Optional per app.
Protocol v2; the normative description is the `sync` section of web-base's
[`03-templates.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/03-templates.md), and every app gets
`docs/sync.md` with the protocol, threat model and recipes.

```bash
bunx github:daniel-rck/web-base add sync
```

## Architecture

```
Device A ──seal (AES-GCM)──▶ Worker /api/sync/<objectId> ──▶ R2 bucket SYNC
   │                          (bearer token, ETags,          v2/<objectId>
   │ pairing code / QR link    no plaintext, no IPs)
   ▼
Device B ◀──open (AES-GCM)── same objectId, same token
```

The Worker stores ciphertext plus `SHA-256(token)` and nothing else. It never
sees the secret, the key or the plaintext. There is no account and no email.

## Keys

- **Root secret:** 16 random bytes from `syncClient.enable()` on the first
  device.
- **HKDF-SHA256**, salt `daniel-rck/web-base sync v2`, `info` = salt + `/enc`,
  `/id`, `/auth`: a non-extractable AES-GCM-256 key; an 80-bit `objectId`
  (16 Crockford base32 chars); a 256-bit bearer token (base64url). A leaked
  `objectId` gives neither read nor write.
- **Envelope:** `{ "v": 2, "iv": "<b64url>", "ct": "<b64url>" }` with AAD
  `web-base-sync/v2/<objectId>`. `v` is the wire format; the app's data schema
  version goes inside the document.

## Pairing

The second device receives the root secret itself — there is no server-side
pairing slot.

- `syncClient.pairingCode()` → `0800-20G3-0G2G-C1R8-1450-P30D-1R7W-VC8`
  (31 Crockford chars: version byte, secret, 2-byte checksum). Typing is
  forgiving (case, spaces, hyphens, I/L→1, O→0).
- `syncClient.pairingUrl()` → `https://<app>/#sync=<code>` for a QR code. The
  fragment never reaches the server.
- In `main.tsx`, **before the router mounts**: `consumePairingFragment()`
  returns the code (from `#sync=` or HashRouter's `#/route?sync=`) and removes
  it from the address bar, keeping `history.state`. Pass it to
  `syncClient.importPairingCode(code)`.
- `importPairingCode` throws `already_enabled` if the device holds another
  secret: ask the user (German text in `docs/sync.md`), then retry with
  `{ replace: true }`.
- The template ships no QR library (a template dependency would be forced on
  every adopter). Use `uqr`'s `renderSVG(url)`; example in `docs/sync.md`.
- iOS: an installed PWA does not share storage with Safari, so a scanned QR
  code pairs Safari. Inside the installed app, type the code.

## Conflicts and merging

Optimistic concurrency via R2 ETags:

- No known ETag → `PUT` with `If-None-Match: *` (create, never overwrite).
- Known ETag → `PUT` with `If-Match`, `GET` with `If-None-Match` (`304`).
- `412` → `SyncError("conflict")`. A pull `404` means "missing" and clears the
  ETag.

`syncClient.sync(local, merge)` does pull → merge → push and retries on a
conflict (default 3 attempts). It returns the merged document; persist it.
`merge` must be deterministic and idempotent — last-writer-wins per record by
`updatedAt`, with tombstones for deletes (recipe in `docs/sync.md`).

## Wiring

```toml
# wrangler.toml
[[r2_buckets]]
binding = "SYNC"
bucket_name = "<app-name>-sync"

# optional
[[ratelimits]]
name = "SYNC_RATE_LIMIT"
namespace_id = "1001"

[ratelimits.simple]
limit = 60
period = 60   # must be 10 or 60
```

```typescript
// worker/index.ts
import { handleSync } from "./sync.ts";

export interface Env {
  ASSETS: Fetcher;
  SYNC: R2Bucket;
  SYNC_RATE_LIMIT?: RateLimit;
}

// in handleApi:
if (url.pathname.startsWith("/api/sync/")) return handleSync(request, env);
```

`tsconfig.worker.json` needs `"allowImportingTsExtensions": true` because
`worker/sync.ts` imports `./sync-http.ts`.

## Rate limits

Optional Cloudflare Rate Limiting binding `SYNC_RATE_LIMIT`, keyed by
`objectId` — never by IP (shared NATs and rotating IPv6 make IP keys unfair,
and they would be personal data). Exceeding it returns `429` with
`Retry-After: 60`; the client surfaces `SyncError("rate_limited")` with
`retryAfter`. Without the binding nothing is limited.

## Errors

Every failure is a `SyncError` with a stable `code` (`offline`, `timeout`,
`conflict`, `invalid_code`, `already_enabled`, `rate_limited`, `forbidden`,
`decrypt_failed`, `unsupported_version`, `storage_unavailable`, …) and a
German `message`; `syncErrorMessage(code)` gives the same text for the UI.

## DSGVO and threat model

- No account, no email, no IP addresses or other personal data stored by the
  app; plaintext never leaves the device.
- The pairing code is the long-lived root secret. It leaks via browser history,
  screenshots and chats. Rotation: `disable({ deleteRemote: true })`, `enable()`,
  re-pair every device.
- The server can withhold, delete or roll back to an older envelope (not
  detected), but cannot read or forge data.
- XSS can read the secret from `localStorage`; the defence is a strict CSP
  (`script-src 'self'`).
- Worker logs MUST NOT include request bodies or the `Authorization` header.

## When to add sync

If the app has a single deployment target (one user, one device), don't add
it. The complexity isn't free. Add when:

- A user wants the same data across phone + desktop.
- Multiple devices write concurrently.
- The user explicitly asks for it.

Hausverwaltung has its own, older sync implementation and must not run
`web-base add sync` or `web-base check sync`. Tennisturnier keeps its KV-only
share-code protocol. No app uses the template's v1 sync, so v2 has no
migration path.
