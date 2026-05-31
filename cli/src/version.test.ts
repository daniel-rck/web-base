import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { compareVersions, WEB_BASE_VERSION } from "./version.ts";

const here = dirname(fileURLToPath(import.meta.url));
// cli/src/version.test.ts → repo root
const rootPkgPath = resolve(here, "../../package.json");

describe("WEB_BASE_VERSION", () => {
  it("matches the root package.json version (no drift)", async () => {
    const raw = await readFile(rootPkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version: string };
    expect(WEB_BASE_VERSION).toBe(pkg.version);
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("returns 1 when the first is newer", () => {
    expect(compareVersions("0.2.0", "0.1.9")).toBe(1);
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1);
  });

  it("returns -1 when the first is older", () => {
    expect(compareVersions("0.1.0", "0.2.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2.1")).toBe(-1);
  });

  it("treats missing segments as zero", () => {
    expect(compareVersions("1", "1.0.0")).toBe(0);
    expect(compareVersions("1.1", "1.0.5")).toBe(1);
  });
});
