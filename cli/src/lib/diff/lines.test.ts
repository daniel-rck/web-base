import { describe, expect, it } from "vitest";
import { countChanges, diffLines, splitLines } from "./lines.ts";

describe("splitLines", () => {
  it("keeps each line's newline, so a missing final newline is visible", () => {
    expect(splitLines("a\nb\n")).toEqual(["a\n", "b\n"]);
    expect(splitLines("a\nb")).toEqual(["a\n", "b"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("diffLines", () => {
  it("is all-equal for identical text", () => {
    expect(countChanges(diffLines("a\nb\n", "a\nb\n"))).toEqual({ added: 0, removed: 0 });
  });

  it("finds a minimal edit in the middle", () => {
    expect(diffLines("a\nb\nc\n", "a\nX\nc\n")).toEqual([
      { op: "equal", line: "a\n" },
      { op: "delete", line: "b\n" },
      { op: "insert", line: "X\n" },
      { op: "equal", line: "c\n" },
    ]);
  });

  it("handles inserts at the start and an empty side", () => {
    expect(countChanges(diffLines("b\n", "a\nb\n"))).toEqual({ added: 1, removed: 0 });
    expect(countChanges(diffLines("", "a\nb\n"))).toEqual({ added: 2, removed: 0 });
    expect(countChanges(diffLines("a\n", ""))).toEqual({ added: 0, removed: 1 });
  });

  it("counts a missing final newline as a change", () => {
    expect(countChanges(diffLines("a", "a\n"))).toEqual({ added: 1, removed: 1 });
  });
});
