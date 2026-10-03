/**
 * Byte encodings for the sync protocol. Everything returns
 * `Uint8Array<ArrayBuffer>` so results pass straight into Web Crypto as a
 * `BufferSource` without casts.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encoder = new TextEncoder();

export function utf8(text: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(text);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** Crockford base32, most significant bit first; the last symbol is zero-padded. */
export function crockfordEncode(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD.charAt((buffer >> bits) & 31);
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD.charAt((buffer << (5 - bits)) & 31);
  return out;
}

/** What people type: no hyphens or spaces, upper case, I/L read as 1, O as 0. */
export function normalizeCrockford(text: string): string {
  return text.replaceAll(/[\s-]/g, "").toUpperCase().replaceAll(/[IL]/g, "1").replaceAll("O", "0");
}

/**
 * Lenient Crockford base32 decode (see `normalizeCrockford`). Returns `null`
 * for any other symbol, a length no encoder produces, or non-zero padding bits
 * — so a typo in the last symbol is still caught.
 */
export function crockfordDecode(text: string): Uint8Array<ArrayBuffer> | null {
  const clean = normalizeCrockford(text);
  const out = new Uint8Array(Math.floor((clean.length * 5) / 8));
  if (clean.length !== Math.ceil((out.length * 8) / 5)) return null;
  let buffer = 0;
  let bits = 0;
  let index = 0;
  for (const char of clean) {
    const value = CROCKFORD.indexOf(char);
    if (value < 0) return null;
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (buffer >> bits) & 0xff;
    }
    buffer &= (1 << bits) - 1;
  }
  return buffer === 0 ? out : null;
}

const CHUNK = 0x8000;

/** base64url without padding (RFC 4648 §5). */
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Strict inverse of `base64urlEncode`: `null` unless the input is canonical. */
export function base64urlDecode(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[\w-]*$/.test(text) || text.length % 4 === 1) return null;
  const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return base64urlEncode(out) === text ? out : null;
}
