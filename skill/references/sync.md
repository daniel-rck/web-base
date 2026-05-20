# Sync reference

Hausverwaltung-style E2E-encrypted device sync. Extra, not in `core`.
Optional per app.

```bash
bunx github:daniel-rck/web-base add sync
```

## Architecture

Client encrypts → uploads ciphertext to R2 → other devices fetch and
decrypt. The Worker stores ciphertext only; it cannot read the payload.

```
Device A ──encrypt──▶ R2 bucket SYNC ◀──decrypt── Device B
                          │
                      KV SYNC_KV
                  (rate limits, pairing slots)
```

## R2 object layout

```
objects/<objectId>/data.json
```

`objectId` = first 10 bytes of `SHA-256(deviceSecret)`, Crockford-base32
(16 characters). The device secret is a 32-byte random value generated
once per device, persisted in `localStorage` under `sync-state-v1`.

## Cryptography

- **Key derivation:** HKDF-SHA256 with salt `"daniel-rck-sync-v1"` and an
  `info` label (e.g. `"data"` for payload key, `"pair"` for pairing
  wrap key). The device secret is the IKM.
- **Encryption:** AES-GCM-256 with a fresh random 12-byte IV per envelope.
- **Envelope shape:**
  ```json
  { "ciphertext": "<base64>", "iv": "<base64>", "v": 1 }
  ```

## Conflict resolution

Optimistic concurrency via R2 ETags.

- Client tracks the last known ETag in `SyncClientState.etag`.
- `PUT` sends `If-Match: <etag>` (no header on first push).
- `GET` sends `If-None-Match: <etag>` so unchanged objects return `304`.
- On `412 Precondition Failed`, the client pulls, merges, and retries.

The merge strategy is app-specific. For Hausverwaltung's CRUD records,
last-writer-wins per record (tagged by `updatedAt`) is acceptable.

## Pairing (device-to-device)

1. Initiating device:
   - Generate a 6-digit OTP.
   - Derive a wrap key via HKDF from the OTP.
   - AES-GCM-wrap the local device secret with the wrap key.
   - POST `/api/sync/pair/<otp>` with `{ wrapped, iv, expiresAt }`.
   - Worker stores in `SYNC_KV` with `expirationTtl: 300` (5 min).
2. Receiving device:
   - Enters the OTP.
   - GETs `/api/sync/pair/<otp>` → gets `{ wrapped, iv }`.
   - Derives the wrap key locally from the OTP.
   - Unwraps to get the device secret.
   - POSTs `/api/sync/pair/<otp>/claim` to delete the slot.

OTPs are single-use; the slot is deleted on first claim *and* expires
after 5 minutes regardless.

## Rate limits

KV-backed token buckets, keyed by `cf-connecting-ip`:

| Action | Limit | Window |
|---|---|---|
| Data ops (GET/PUT objects) | 60 | 60s |
| Pair-create | 5 | 60s |
| Pair-claim | 10 | 900s (15 min) |

Exceeding any returns `429 Too Many Requests`.

## DSGVO compliance

- No user account, no email, no PII at rest on the server.
- Plaintext never crosses the device boundary.
- Pairing OTPs expire after 5 minutes and are single-use.
- Worker logs MUST NOT include request bodies. Configure wrangler logging
  accordingly.

## When to add sync

If the app has a single deployment target (one user, one device), don't
add it. The complexity isn't free. Add when:

- A user wants the same data across phone + desktop.
- Multiple devices write concurrently.
- The user explicitly asks for it.

Hausverwaltung uses it. Tennisturnier and ErinnerMich currently don't.
