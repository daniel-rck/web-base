/**
 * The pairing code is the root secret in a typeable form:
 *
 *   Crockford base32( version 0x02 | secret (16 bytes) | checksum (2 bytes) )
 *
 * 19 bytes → 31 symbols, shown in groups of four. The checksum is the first two
 * bytes of SHA-256("web-base-sync pairing" | version | secret) and catches
 * typos, not attackers. Whoever holds the code can read and write the data.
 */
import {
  concatBytes,
  crockfordDecode,
  crockfordEncode,
  normalizeCrockford,
  utf8,
} from "./encoding.ts";
import { SyncError } from "./errors.ts";

const VERSION = 0x02;
const SECRET_BYTES = 16;
const CODE_BYTES = 1 + SECRET_BYTES + 2;
const CHECKSUM_LABEL = utf8("web-base-sync pairing");

export function generateSecret(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
}

async function checksum(version: number, secret: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const input = concatBytes(CHECKSUM_LABEL, Uint8Array.of(version), secret);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input)).slice(0, 2);
}

/** The canonical code: 31 symbols, no hyphens. */
export async function encodePairingCode(secret: Uint8Array): Promise<string> {
  if (secret.length !== SECRET_BYTES) throw new RangeError("Sync secret must be 16 bytes.");
  return crockfordEncode(
    concatBytes(Uint8Array.of(VERSION), secret, await checksum(VERSION, secret)),
  );
}

/**
 * Split a code into its fields without verifying the checksum (synchronous, for
 * validating stored state). `null` when it is not 19 bytes of Crockford base32.
 */
export function parsePairingCode(
  code: string,
): { version: number; secret: Uint8Array<ArrayBuffer>; checksum: Uint8Array<ArrayBuffer> } | null {
  const bytes = crockfordDecode(code);
  if (bytes?.length !== CODE_BYTES) return null;
  return {
    version: bytes[0] ?? -1,
    secret: bytes.slice(1, 1 + SECRET_BYTES),
    checksum: bytes.slice(1 + SECRET_BYTES),
  };
}

/** Typed or scanned code → secret. Throws `SyncError("invalid_code")`. */
export async function decodePairingCode(code: string): Promise<Uint8Array<ArrayBuffer>> {
  const parsed = parsePairingCode(code);
  if (parsed?.version !== VERSION) throw new SyncError("invalid_code");
  const expected = await checksum(parsed.version, parsed.secret);
  if (expected.some((byte, i) => byte !== parsed.checksum[i])) throw new SyncError("invalid_code");
  return parsed.secret;
}

/** `0ABC-DEFG-…`: groups of four for reading aloud and typing. */
export function formatPairingCode(code: string): string {
  return (
    normalizeCrockford(code)
      .match(/.{1,4}/g)
      ?.join("-") ?? ""
  );
}
