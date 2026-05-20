/**
 * E2E sync crypto helpers. All keys derive from a 32-byte device secret
 * via HKDF-SHA256; ciphertexts use AES-GCM with a fresh 12-byte IV.
 */

const enc = new TextEncoder();

export async function importRawKey(bytes: ArrayBuffer): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", bytes, "HKDF", false, ["deriveKey"]);
}

export async function deriveDataKey(deviceSecret: ArrayBuffer, info: string): Promise<CryptoKey> {
  const hkdfKey = await importRawKey(deviceSecret);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: enc.encode("daniel-rck-sync-v1"),
      info: enc.encode(info),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer,
): Promise<{ ciphertext: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return { ciphertext, iv };
}

export async function decrypt(
  key: CryptoKey,
  ciphertext: ArrayBuffer,
  iv: ArrayBuffer,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
}

/** SHA-256 over the device secret, take first 10 bytes, Crockford b32 encode. */
export async function deriveObjectId(deviceSecret: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", deviceSecret));
  return crockfordBase32(hash.slice(0, 10));
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function crockfordBase32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      const index = (buffer >> bits) & 0x1f;
      out += CROCKFORD[index];
    }
  }
  if (bits > 0) {
    const index = (buffer << (5 - bits)) & 0x1f;
    out += CROCKFORD[index];
  }
  return out;
}

export function bytesToBase64(buf: ArrayBuffer | Uint8Array): string {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < view.byteLength; i++) {
    bin += String.fromCharCode(view[i] ?? 0);
  }
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
