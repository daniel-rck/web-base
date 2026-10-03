import { describe, expect, it } from "vitest";
import { diffLines } from "./lines.ts";
import { formatUnifiedDiff } from "./unified.ts";

const lines = (n: number, from = 1) =>
  Array.from({ length: n }, (_, i) => `l${i + from}\n`).join("");

describe("formatUnifiedDiff", () => {
  it("is empty for identical input", () => {
    expect(formatUnifiedDiff(diffLines("a\n", "a\n"), "x")).toBe("");
  });

  it("renders one hunk with three lines of context", () => {
    const before = lines(10);
    const after = before.replace("l5\n", "L5\n");
    expect(formatUnifiedDiff(diffLines(before, after), "src/a.ts")).toBe(
      [
        "--- local/src/a.ts",
        "+++ web-base/src/a.ts",
        "@@ -2,7 +2,7 @@",
        " l2",
        " l3",
        " l4",
        "-l5",
        "+L5",
        " l6",
        " l7",
        " l8",
        "",
      ].join("\n"),
    );
  });

  it("merges nearby changes and splits distant ones", () => {
    const before = lines(30);
    const near = before.replace("l5\n", "X\n").replace("l10\n", "Y\n");
    expect(formatUnifiedDiff(diffLines(before, near), "a").match(/^@@/gm)).toHaveLength(1);
    const far = before.replace("l5\n", "X\n").replace("l25\n", "Y\n");
    expect(formatUnifiedDiff(diffLines(before, far), "a").match(/^@@/gm)).toHaveLength(2);
  });

  it("uses the line before for an empty side and marks a missing final newline", () => {
    expect(formatUnifiedDiff(diffLines("", "a"), "f")).toBe(
      "--- local/f\n+++ web-base/f\n@@ -0,0 +1 @@\n+a\n\\ No newline at end of file\n",
    );
    expect(formatUnifiedDiff(diffLines("a\nb\n", "a\n"), "f")).toBe(
      "--- local/f\n+++ web-base/f\n@@ -1,2 +1 @@\n a\n-b\n",
    );
  });
});
