import { describe, expect, it } from "vitest";
import type { PackageJson, PackageJsonDoc } from "./doc.ts";
import { patchSections } from "./patch.ts";

function doc(data: PackageJson): PackageJsonDoc {
  return {
    path: "/app/package.json",
    raw: "{}",
    data,
    style: { indent: "  ", eol: "\n", finalNewline: true },
    dirty: new Set(),
  };
}

describe("patchSections", () => {
  it("adds missing keys and marks the document dirty", () => {
    const d = doc({ name: "x" });
    const changes = patchSections(d, {
      devDependencies: { oxlint: "^1.85.0" },
      scripts: { lint: "oxlint" },
    });
    expect(d.data.devDependencies).toEqual({ oxlint: "^1.85.0" });
    expect(d.data.scripts).toEqual({ lint: "oxlint" });
    expect(changes).toHaveLength(2);
    expect(d.dirty.has("content")).toBe(true);
  });

  it("leaves identical keys alone and reports no change", () => {
    const d = doc({ scripts: { lint: "oxlint" } });
    expect(patchSections(d, { scripts: { lint: "oxlint" } })).toEqual([]);
    expect(d.dirty.size).toBe(0);
  });

  it("overwrites differing values and records the old one", () => {
    const d = doc({ dependencies: { idb: "^7.0.0" } });
    expect(patchSections(d, { dependencies: { idb: "^8.0.3" } })).toEqual([
      { section: "dependencies", name: "idb", from: "^7.0.0", to: "^8.0.3" },
    ]);
  });

  it("updates a package where the app lists it instead of duplicating it", () => {
    const d = doc({ devDependencies: { idb: "^7.0.0" } });
    patchSections(d, { dependencies: { idb: "^8.0.3" } });
    expect(d.data.dependencies).toBeUndefined();
    expect(d.data.devDependencies).toEqual({ idb: "^8.0.3" });
  });

  it("inserts into a sorted section in order, and appends to an unsorted one", () => {
    const sorted = doc({ devDependencies: { a: "1", c: "1" } });
    patchSections(sorted, { devDependencies: { b: "1" } });
    expect(Object.keys(sorted.data.devDependencies ?? {})).toEqual(["a", "b", "c"]);
    const unsorted = doc({ devDependencies: { c: "1", a: "1" } });
    patchSections(unsorted, { devDependencies: { b: "1" } });
    expect(Object.keys(unsorted.data.devDependencies ?? {})).toEqual(["c", "a", "b"]);
  });

  it("never reorders scripts", () => {
    const d = doc({ scripts: { dev: "vite", build: "vite build" } });
    patchSections(d, { scripts: { lint: "oxlint" } });
    expect(Object.keys(d.data.scripts ?? {})).toEqual(["dev", "build", "lint"]);
  });

  it("does not remove keys it wasn't given", () => {
    const d = doc({ scripts: { dev: "vite", lint: "old" } });
    patchSections(d, { scripts: { format: "oxfmt" } });
    expect(d.data.scripts).toEqual({ dev: "vite", lint: "old", format: "oxfmt" });
  });
});
