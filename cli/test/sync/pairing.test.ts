import { describe, expect, it } from "vitest";
import { concatBytes, crockfordEncode, utf8 } from "../../templates/sync/client/encoding.ts";
import {
  decodePairingCode,
  encodePairingCode,
  formatPairingCode,
  generateSecret,
} from "../../templates/sync/client/pairing.ts";
import { outcome } from "./helpers.ts";

const SECRET = Uint8Array.from({ length: 16 }, (_, i) => i);
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const invalid = { name: "SyncError", code: "invalid_code" };

/** A code built by hand, for versions the encoder refuses to produce. */
async function handmade(version: number, secret: Uint8Array): Promise<string> {
  const input = concatBytes(utf8("web-base-sync pairing"), Uint8Array.of(version), secret);
  const checksum = new Uint8Array(await crypto.subtle.digest("SHA-256", input)).slice(0, 2);
  return crockfordEncode(concatBytes(Uint8Array.of(version), secret, checksum));
}

describe("pairing codes", () => {
  it("round-trips a fresh 128-bit secret through 31 symbols", async () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(16);
    const code = await encodePairingCode(secret);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{31}$/);
    await expect(decodePairingCode(code)).resolves.toEqual(secret);
  });

  it("matches the pinned v2 vector", async () => {
    await expect(encodePairingCode(SECRET)).resolves.toBe("080020G30G2GC1R81450P30D1R7WVC8");
    await expect(handmade(2, SECRET)).resolves.toBe("080020G30G2GC1R81450P30D1R7WVC8");
  });

  it("formats in groups of four and accepts the grouped form back", async () => {
    const code = await encodePairingCode(SECRET);
    const grouped = formatPairingCode(code);
    expect(grouped).toBe("0800-20G3-0G2G-C1R8-1450-P30D-1R7W-VC8");
    expect(formatPairingCode(grouped)).toBe(grouped);
    await expect(decodePairingCode(grouped)).resolves.toEqual(SECRET);
  });

  it("forgives how people type: case, spaces, I/L/O look-alikes", async () => {
    const grouped = formatPairingCode(await encodePairingCode(SECRET));
    const sloppy = ` ${grouped.toLowerCase().replaceAll("0", "o").replaceAll("1", "l")} `;
    await expect(decodePairingCode(sloppy)).resolves.toEqual(SECRET);
  });

  it("catches a single-symbol typo in every position", async () => {
    const code = await encodePairingCode(SECRET);
    const typos = [...code].map((char, i) => {
      const next = ALPHABET.charAt((ALPHABET.indexOf(char) + 1) % ALPHABET.length);
      return code.slice(0, i) + next + code.slice(i + 1);
    });
    const outcomes = await Promise.all(typos.map((typo) => outcome(decodePairingCode(typo))));
    expect(outcomes).toEqual(typos.map(() => "invalid_code"));
  });

  it("rejects other versions even with a matching checksum", async () => {
    for (const version of [0x01, 0x03]) {
      await expect(decodePairingCode(await handmade(version, SECRET))).rejects.toMatchObject(
        invalid,
      );
    }
  });

  it("rejects wrong lengths and foreign symbols", async () => {
    const code = await encodePairingCode(SECRET);
    const bad = ["", code.slice(0, -1), `${code}0`, `${code.slice(0, -1)}U`, "not a code"];
    const outcomes = await Promise.all(bad.map((text) => outcome(decodePairingCode(text))));
    expect(outcomes).toEqual(bad.map(() => "invalid_code"));
  });

  it("refuses to encode a secret of the wrong size", async () => {
    await expect(encodePairingCode(new Uint8Array(32))).rejects.toThrow(RangeError);
  });
});
