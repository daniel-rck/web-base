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

/**
 * `<base>#sync=<code>` — the same string people type, so one parser serves
 * both. Browsers never send the fragment to the server. `base` defaults to the
 * current page without query or hash.
 */
export function pairingUrl(code: string, base: string = currentPage()): string {
  return `${base}#sync=${normalizeCrockford(code)}`;
}

function currentPage(): string {
  const location: Location | undefined = globalThis.location;
  return location ? `${location.origin}${location.pathname}` : "";
}

/** A hash as route + parameters: `#sync=…`, `#a=1&sync=…` or HashRouter's `#/path?sync=…`. */
function splitHash(hash: string): { route: string | null; params: URLSearchParams } {
  const fragment = hash.replace(/^#/, "");
  const query = fragment.indexOf("?");
  if (query >= 0) {
    return {
      route: fragment.slice(0, query),
      params: new URLSearchParams(fragment.slice(query + 1)),
    };
  }
  if (fragment.startsWith("/")) return { route: fragment, params: new URLSearchParams() };
  return { route: null, params: new URLSearchParams(fragment) };
}

/** The unvalidated `sync` parameter of a location hash, or `null`. */
export function readPairingCode(hash: string): string | null {
  return splitHash(hash).params.get("sync") || null;
}

export type PairingWindow = {
  location: Pick<Location, "hash" | "pathname" | "search">;
  history: Pick<History, "state" | "replaceState">;
};

/**
 * Take the code out of the address bar: returns it and replaces the URL with
 * one without it, keeping `history.state` (React Router keeps its index
 * there). Call it in main.tsx before the router mounts. `null` without a code
 * or outside a browser.
 */
export function consumePairingFragment(
  win: PairingWindow | undefined = globalThis.window,
): string | null {
  if (!win) return null;
  const { hash, pathname, search } = win.location;
  const code = readPairingCode(hash);
  if (code === null) return null;
  const { route, params } = splitHash(hash);
  params.delete("sync");
  const rest = params.toString();
  const fragment = route === null ? rest : rest ? `${route}?${rest}` : route;
  win.history.replaceState(
    win.history.state,
    "",
    `${pathname}${search}${fragment ? `#${fragment}` : ""}`,
  );
  return code;
}
