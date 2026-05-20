# Sync architecture (E2E-encrypted)

This app uses R2 + KV for end-to-end-encrypted device sync. The server
never sees plaintext.

## Object layout

```
R2 bucket SYNC:
  objects/<objectId>/data.json   — AES-GCM ciphertext envelope
```

`objectId` is the first 10 bytes of `SHA-256(deviceSecret)`, encoded with
Crockford base32 (16 characters). The device secret is a 32-byte random
value generated once per device, stored in `localStorage` under
`sync-state-v1`.

## Cryptography

- Per-purpose data keys are derived from the device secret via
  **HKDF-SHA256** with salt `"daniel-rck-sync-v1"` and an `info` label
  (e.g. `"data"`).
- Payloads are encrypted with **AES-GCM-256** using a fresh random 12-byte
  IV. The envelope shape:
  ```json
  { "ciphertext": "<base64>", "iv": "<base64>", "v": 1 }
  ```

## Conflict detection

Optimistic concurrency via R2 ETags:

- `PUT` requests carry an `If-Match: <etag>` header.
- `GET` requests carry an `If-None-Match: <etag>` header so unchanged
  objects return `304 Not Modified`.

On `412 Precondition Failed`, the client should pull, merge locally, and
retry.

## Pairing (device-to-device)

1. New device generates a 6-digit OTP, derives a wrap key from it (HKDF),
   wraps the local device secret with AES-GCM.
2. New device `POST`s the wrapped secret + IV to `/api/sync/pair` with
   the OTP as the slot identifier; the worker stores it in KV with
   `expirationTtl: 300` (5 minutes).
3. Receiving device enters the OTP, `GET`s the slot, unwraps locally.
4. After successful unwrap, the receiving device claims the slot
   (deletes it) so the OTP can't be reused.

## Rate limits

KV-backed token buckets, keyed by client IP:

- `60` data ops per minute
- `5` pair-create per minute
- `10` claim per 15 minutes

Exceeding any of these returns `429 Too Many Requests`.

## DSGVO compliance

- No user account, no email, no PII at rest on the server.
- Plaintext never crosses the device boundary.
- Pairing OTPs expire after 5 minutes and are single-use.
- Server logs MUST NOT include request bodies (configure worker logging
  accordingly).
