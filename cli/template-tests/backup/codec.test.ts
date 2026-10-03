import { describe, expect, it } from "vitest";
import { decodeValue, encodeValue } from "../../lib/backup/codec.ts";

const roundTrip = async (value: unknown) =>
  decodeValue(JSON.parse(JSON.stringify(await encodeValue(value))));

describe("backup codec", () => {
  it("keeps what plain JSON would lose", async () => {
    const value = {
      when: new Date("2026-10-02T12:00:00.000Z"),
      tags: new Set(["a", "b"]),
      lookup: new Map([[1, "eins"]]),
      bytes: new Uint8Array([1, 2, 3]),
      missing: undefined,
      odd: [Number.NaN, Number.POSITIVE_INFINITY, -0.5],
      big: 12345678901234567890n,
    };
    expect(await roundTrip(value)).toEqual(value);
  });

  it("round-trips Blobs and Files with type and name", async () => {
    const file = new File(["hallo"], "notiz.txt", { type: "text/plain" });
    const back = (await roundTrip({ file })) as { file: File };
    expect(back.file).toBeInstanceOf(File);
    expect(back.file.name).toBe("notiz.txt");
    expect(back.file.type).toBe("text/plain");
    expect(await back.file.text()).toBe("hallo");
  });

  it("escapes a real $wb key instead of misreading it as a tag", async () => {
    expect(await roundTrip({ $wb: "date", v: "kein Datum" })).toEqual({
      $wb: "date",
      v: "kein Datum",
    });
  });
});
