/**
 * Protocol v2 key schedule and envelope. One 128-bit root secret feeds
 * HKDF-SHA256 with a fixed salt; distinct `info` labels yield independent
 * values, so knowing one (the server sees `objectId` and the token) reveals
 * nothing about the others or the secret.
 */
import { base64urlDecode, base64urlEncode, crockfordEncode, utf8 } from "./encoding.ts";
import { SyncError } from "./errors.ts";
import type { SyncEnvelope } from "./types.ts";

const LABEL = "daniel-rck/web-base sync v2";
const SALT = utf8(LABEL);

export type SyncKeys = {
  /** AES-GCM-256, non-extractable. */
  encKey: CryptoKey;
  /** 80 bits as 16 Crockford base32 chars: the object name on the server. */
  objectId: string;
  /** 256 bits as base64url: the bearer token. The server keeps only its SHA-256. */
  authToken: string;
};

function hkdf(purpose: "enc" | "id" | "auth"): HkdfParams {
  return { name: "HKDF", hash: "SHA-256", salt: SALT, info: utf8(`${LABEL}/${purpose}`) };
}

export async function deriveKeys(secret: Uint8Array<ArrayBuffer>): Promise<SyncKeys> {
  const root = await crypto.subtle.importKey("raw", secret, "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
  const [encKey, id, auth] = await Promise.all([
    crypto.subtle.deriveKey(hkdf("enc"), root, { name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]),
    crypto.subtle.deriveBits(hkdf("id"), root, 80),
    crypto.subtle.deriveBits(hkdf("auth"), root, 256),
  ]);
  return {
    encKey,
    objectId: crockfordEncode(new Uint8Array(id)),
    authToken: base64urlEncode(new Uint8Array(auth)),
  };
}

/** Binds a ciphertext to its object, so the server cannot swap objects around. */
function aad(objectId: string): Uint8Array<ArrayBuffer> {
  return utf8(`web-base-sync/v2/${objectId}`);
}

export async function seal(
  encKey: CryptoKey,
  objectId: string,
  payload: unknown,
): Promise<SyncEnvelope> {
  const json = JSON.stringify(payload);
  if (json === undefined) throw new TypeError("Sync payload is not JSON-serializable.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(objectId) },
    encKey,
    utf8(json),
  );
  return { v: 2, iv: base64urlEncode(iv), ct: base64urlEncode(new Uint8Array(ct)) };
}

/**
 * Decrypt and parse an envelope. Throws `unsupported_version` for another wire
 * format and `decrypt_failed` for a wrong key, a tampered or moved ciphertext,
 * or a plaintext that is not JSON.
 */
export async function open<T>(
  encKey: CryptoKey,
  objectId: string,
  envelope: { v: number; iv: string; ct: string },
): Promise<T> {
  if (envelope.v !== 2) throw new SyncError("unsupported_version");
  const iv = base64urlDecode(envelope.iv);
  const ct = base64urlDecode(envelope.ct);
  if (iv?.length !== 12 || !ct) throw new SyncError("decrypt_failed");
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: aad(objectId) },
      encKey,
      ct,
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch (cause) {
    throw new SyncError("decrypt_failed", { cause });
  }
}
