import { describe, expect, it } from "vitest";
import {
  adoptionOf,
  type BlockCheck,
  type CheckReport,
  type FileCheck,
  judgeCheck,
} from "./check.ts";

const file = (status: FileCheck["status"]): FileCheck => ({
  path: status,
  status,
  added: 0,
  removed: 0,
});
const block = (template: string, files: FileCheck[]): BlockCheck => ({
  template,
  files,
  adoption: adoptionOf(files),
});
const report = (blocks: BlockCheck[], obsolete: CheckReport["obsolete"] = []): CheckReport => ({
  template: "core",
  stamped: undefined,
  blocks,
  obsolete,
});

describe("adoptionOf", () => {
  it("judges a block by its owned, managed files", () => {
    expect(adoptionOf([file("identical"), file("differs")])).toBe("full");
    expect(adoptionOf([file("identical"), file("missing")])).toBe("partial");
    expect(adoptionOf([file("missing")])).toBe("none");
    expect(adoptionOf([])).toBe("nothing-owned");
    expect(adoptionOf([file("unmanaged")])).toBe("nothing-owned");
  });
});

describe("judgeCheck", () => {
  it("passes a chain with nothing to guard (scaffold seams only)", () => {
    expect(judgeCheck(report([block("router", [])]), { strict: true })).toEqual({
      exitCode: 0,
      failures: [],
    });
  });

  it("fails on drift", () => {
    expect(
      judgeCheck(report([block("layout", [file("differs")])]), { strict: false }).exitCode,
    ).toBe(1);
  });

  it("fails when nothing guardable was adopted", () => {
    const verdict = judgeCheck(report([block("layout", [file("missing")]), block("router", [])]), {
      strict: false,
    });
    expect(verdict.failures).toEqual([
      "no owned building blocks found — this app is not on the base at all",
    ]);
  });

  it("tolerates unadopted and partial blocks unless --strict", () => {
    const r = report([
      block("layout", [file("identical"), file("missing")]),
      block("storage", [file("missing")]),
    ]);
    expect(judgeCheck(r, { strict: false }).exitCode).toBe(0);
    expect(judgeCheck(r, { strict: true }).failures).toEqual([
      "1 block(s) not adopted",
      "1 owned file(s) absent",
    ]);
  });

  it("fails --strict on an obsolete leftover", () => {
    const r = report(
      [block("oxc", [file("identical")])],
      [{ template: "oxc", kind: "file", name: "biome.json" }],
    );
    expect(judgeCheck(r, { strict: false }).exitCode).toBe(0);
    expect(judgeCheck(r, { strict: true }).failures).toEqual(["1 obsolete leftover(s)"]);
  });
});
