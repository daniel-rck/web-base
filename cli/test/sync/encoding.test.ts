import { describe, expect, it } from "vitest";
import {
  base64urlDecode,
  base64urlEncode,
  crockfordDecode,
  crockfordEncode,
  normalizeCrockford,
} from "../../templates/sync/client/encoding.ts";

const bytes = (length: number) => Uint8Array.from({ length }, (_, i) => (i * 37 + 11) & 0xff);

describe("Crockford base32", () => {
  it("round-trips every length up to 32 bytes", () => {
    for (let n = 0; n <= 32; n++) {
      expect(crockfordDecode(crockfordEncode(bytes(n)))).toEqual(bytes(n));
    }
  });

  it("encodes known vectors with the Crockford alphabet", () => {
    expect(crockfordEncode(Uint8Array.of(0xff))).toBe("ZW");
    expect(crockfordEncode(Uint8Array.of(0x66))).toBe("CR");
    const all = crockfordEncode(Uint8Array.from({ length: 256 }, (_, i) => i));
    expect(all).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it("decodes leniently: case, hyphens, whitespace, I/L as 1, O as 0", () => {
    const code = crockfordEncode(bytes(10));
    expect(crockfordDecode(code.toLowerCase())).toEqual(bytes(10));
    expect(crockfordDecode(` ${code.slice(0, 4)}-${code.slice(4)}\n`)).toEqual(bytes(10));
    expect(normalizeCrockford("o0-Il i\tL")).toBe("001111");
    expect(crockfordDecode("lo")).toEqual(crockfordDecode("10"));
  });

  it("rejects other symbols, impossible lengths and non-zero padding", () => {
    expect(crockfordDecode("UU")).toBeNull();
    expect(crockfordDecode("A*")).toBeNull();
    expect(crockfordDecode("ÄB")).toBeNull();
    expect(crockfordDecode("0")).toBeNull();
    expect(crockfordDecode("000")).toBeNull();
    expect(crockfordDecode("ZZ")).toBeNull();
  });
});

describe("base64url", () => {
  it("round-trips every length up to 64 bytes", () => {
    for (let n = 0; n <= 64; n++) {
      expect(base64urlDecode(base64urlEncode(bytes(n)))).toEqual(bytes(n));
    }
  });

  it("uses the URL-safe alphabet without padding", () => {
    expect(base64urlEncode(Uint8Array.of(0xfb, 0xff))).toBe("-_8");
    expect(base64urlEncode(bytes(100))).toMatch(/^[\w-]+$/);
  });

  it("round-trips inputs larger than one chunk", () => {
    const big = Uint8Array.from({ length: 100_000 }, (_, i) => i % 251);
    expect(base64urlDecode(base64urlEncode(big))).toEqual(big);
  });

  it("rejects padding, the standard alphabet and non-canonical input", () => {
    expect(base64urlDecode("-_8=")).toBeNull();
    expect(base64urlDecode("+/8")).toBeNull();
    expect(base64urlDecode("A")).toBeNull();
    expect(base64urlDecode("AB")).toBeNull();
    expect(base64urlDecode("AA")).toEqual(Uint8Array.of(0));
  });
});
