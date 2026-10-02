import { describe, expect, it } from "vitest";
import type { PackageJson, PackageJsonDoc } from "./doc.ts";
import { readWebBase, stampVersion } from "./webbase.ts";

function doc(data: PackageJson): PackageJsonDoc {
  return {
    path: "/app/package.json",
    raw: "{}",
    data,
    style: { indent: "  ", eol: "\n", finalNewline: true },
    dirty: new Set(),
  };
}

describe("readWebBase", () => {
  it("is empty without a package.json or webBase block", () => {
    expect(readWebBase(undefined)).toEqual({ version: undefined, unmanaged: new Set() });
    expect(readWebBase(doc({ name: "x" }))).toEqual({ version: undefined, unmanaged: new Set() });
  });

  it("reads the stamp and normalizes unmanaged paths", () => {
    const config = readWebBase(
      doc({
        webBase: { version: "0.3.1", unmanaged: ["./src/lib/db/useLiveQuery.ts", "a\\b.ts"] },
      }),
    );
    expect(config.version).toBe("0.3.1");
    expect([...config.unmanaged]).toEqual(["src/lib/db/useLiveQuery.ts", "a/b.ts"]);
  });

  it.each([
    [{ webBase: "0.3.1" }, /webBase must be an object/],
    [{ webBase: { version: 3 } }, /version must be a version/],
    [{ webBase: { version: "latest" } }, /version must be a version/],
    [{ webBase: { unmanaged: "src/x.ts" } }, /unmanaged must be an array/],
    [{ webBase: { unmanaged: ["../outside.ts"] } }, /escapes its root/],
    [{ webBase: { unmanaged: ["/etc/passwd"] } }, /is absolute/],
  ])("rejects %j", (data, message) => {
    expect(() => readWebBase(doc(data as PackageJson))).toThrow(message);
  });
});

describe("stampVersion", () => {
  it("adds the stamp and keeps other webBase fields", () => {
    const d = doc({ webBase: { version: "0.1.0", unmanaged: ["x"] } });
    expect(stampVersion(d, "0.6.0")).toBe(true);
    expect(d.data.webBase).toEqual({ version: "0.6.0", unmanaged: ["x"] });
    expect(d.dirty).toEqual(new Set(["stamp"]));
  });

  it("is a no-op at the same version", () => {
    const d = doc({ webBase: { version: "0.6.0" } });
    expect(stampVersion(d, "0.6.0")).toBe(false);
    expect(d.dirty.size).toBe(0);
  });
});
