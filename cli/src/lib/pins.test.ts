import { describe, expect, it } from "vitest";
import { comparePins, type PinTable } from "./pins.ts";

const pins: PinTable = {
  packageManager: "bun@1.3.11",
  dependencies: { react: "^19.2.8" },
  devDependencies: { typescript: "~7.0.2", vite: "^8.2.2" },
};

describe("comparePins", () => {
  it("matches exact ranges and ignores packages the app doesn't use", () => {
    const report = comparePins(
      { packageManager: "bun@1.3.11", dependencies: { react: "^19.2.8", zod: "^4" } },
      pins,
    );
    expect(report).toEqual({ matched: 2, mismatches: [], notes: [] });
  });

  it("labels mismatches behind, ahead and different", () => {
    const report = comparePins(
      {
        packageManager: "bun@1.3.11",
        dependencies: { react: "^19.1.0" },
        devDependencies: { typescript: "^7.0.2", vite: "^9.0.0" },
      },
      pins,
    );
    expect(report.mismatches.map((m) => [m.name, m.kind])).toEqual([
      ["react", "behind"],
      ["typescript", "different"],
      ["vite", "ahead"],
    ]);
  });

  it("requires packageManager", () => {
    expect(comparePins({}, pins).mismatches).toEqual([
      {
        name: "packageManager",
        section: "packageManager",
        expected: "bun@1.3.11",
        actual: undefined,
        kind: "missing",
      },
    ]);
  });

  it("notes a package listed in the other section without failing on it", () => {
    const report = comparePins(
      { packageManager: "bun@1.3.11", devDependencies: { react: "^19.2.8" } },
      pins,
    );
    expect(report.mismatches).toEqual([]);
    expect(report.notes).toEqual([
      "react is pinned under dependencies but listed in devDependencies",
    ]);
  });
});
