import { describe, expect, it } from "vitest";
import { deriveKeys, open, seal } from "../../templates/sync/client/crypto.ts";
import {
  base64urlDecode,
  base64urlEncode,
  crockfordEncode,
  utf8,
} from "../../templates/sync/client/encoding.ts";

const SECRET = Uint8Array.from({ length: 16 }, (_, i) => i);
const LABEL = "daniel-rck/web-base sync v2";

/** An independent HKDF-SHA256 per the spec, to pin the key schedule. */
async function hkdf(purpose: string, bits: number): Promise<Uint8Array<ArrayBuffer>> {
  const root = await crypto.subtle.importKey("raw", SECRET, "HKDF", false, ["deriveBits"]);
  const params = {
    name: "HKDF",
    hash: "SHA-256",
    salt: utf8(LABEL),
    info: utf8(`${LABEL}/${purpose}`),
  };
  return new Uint8Array(await crypto.subtle.deriveBits(params, root, bits));
}

const failure = (code: string) => ({ name: "SyncError", code });

describe("deriveKeys", () => {
  it("is deterministic and matches the pinned v2 vectors", async () => {
    const a = await deriveKeys(SECRET);
    const b = await deriveKeys(SECRET.slice());
    expect(a.objectId).toBe("QZQVCTQB5YM38E3S");
    expect(a.authToken).toBe("aDXawcAEh-2YlLD2Iv63-o6SdUB7hlbh4p70W-Q3ATM");
    expect(b.objectId).toBe(a.objectId);
    expect(b.authToken).toBe(a.authToken);
  });

  it("derives the three values from three distinct HKDF labels", async () => {
    const keys = await deriveKeys(SECRET);
    const [enc, id, auth] = await Promise.all([
      hkdf("enc", 256),
      hkdf("id", 80),
      hkdf("auth", 256),
    ]);
    expect(keys.objectId).toBe(crockfordEncode(id));
    expect(keys.authToken).toBe(base64urlEncode(auth));
    expect(id).not.toEqual(auth.slice(0, 10));
    expect(id).not.toEqual(enc.slice(0, 10));
    expect(enc).not.toEqual(auth);
    // The AES key is HKDF(".../enc"): an independently imported copy opens the envelope.
    const envelope = await seal(keys.encKey, keys.objectId, { ok: true });
    const copy = await crypto.subtle.importKey("raw", enc, "AES-GCM", false, ["decrypt"]);
    await expect(open(copy, keys.objectId, envelope)).resolves.toEqual({ ok: true });
  });

  it("does not use SHA-256(secret) as the object id", async () => {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", SECRET));
    const { objectId } = await deriveKeys(SECRET);
    expect(objectId).not.toBe(crockfordEncode(digest.slice(0, 10)));
    expect(objectId).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("makes a non-extractable AES-GCM key", async () => {
    const { encKey } = await deriveKeys(SECRET);
    expect(encKey.extractable).toBe(false);
    expect(encKey.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    await expect(crypto.subtle.exportKey("raw", encKey)).rejects.toBeInstanceOf(DOMException);
  });
});

describe("seal / open", () => {
  const payload = { text: "Grüße aus Köln 👋 — ñ", list: [1, 2, 3], nested: { ok: true } };

  it("round-trips unicode JSON", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const envelope = await seal(encKey, objectId, payload);
    expect(envelope.v).toBe(2);
    expect(base64urlDecode(envelope.iv)).toHaveLength(12);
    await expect(open(encKey, objectId, envelope)).resolves.toEqual(payload);
  });

  it("uses a fresh IV for every envelope", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const [a, b] = await Promise.all([
      seal(encKey, objectId, payload),
      seal(encKey, objectId, payload),
    ]);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });

  it("rejects a tampered ciphertext", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const envelope = await seal(encKey, objectId, payload);
    const ct = base64urlDecode(envelope.ct) ?? new Uint8Array();
    ct[0] = (ct[0] ?? 0) ^ 1;
    await expect(
      open(encKey, objectId, { ...envelope, ct: base64urlEncode(ct) }),
    ).rejects.toMatchObject(failure("decrypt_failed"));
  });

  it("binds the ciphertext to its object id (AAD)", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const envelope = await seal(encKey, objectId, payload);
    await expect(open(encKey, "0000000000000000", envelope)).rejects.toMatchObject(
      failure("decrypt_failed"),
    );
  });

  it("rejects another secret's key", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const other = await deriveKeys(new Uint8Array(16));
    const envelope = await seal(encKey, objectId, payload);
    await expect(open(other.encKey, objectId, envelope)).rejects.toMatchObject(
      failure("decrypt_failed"),
    );
  });

  it("refuses wire formats other than v2", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    const envelope = await seal(encKey, objectId, payload);
    await expect(open(encKey, objectId, { ...envelope, v: 3 })).rejects.toMatchObject(
      failure("unsupported_version"),
    );
  });

  it("refuses payloads JSON cannot represent", async () => {
    const { encKey, objectId } = await deriveKeys(SECRET);
    await expect(seal(encKey, objectId, undefined)).rejects.toThrow(TypeError);
  });
});
