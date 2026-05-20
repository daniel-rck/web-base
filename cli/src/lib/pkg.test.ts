import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patchPackageJson } from "./pkg.ts";

let scratch: string;

async function writePkg(content: Record<string, unknown>): Promise<void> {
  await writeFile(resolve(scratch, "package.json"), JSON.stringify(content, null, 2), "utf8");
}

async function readPkg(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(scratch, "package.json"), "utf8"));
}

beforeEach(async () => {
  scratch = await mkdtemp(resolve(tmpdir(), "web-base-pkg-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("patchPackageJson", () => {
  it("adds missing keys", async () => {
    await writePkg({ name: "scratch", version: "0.0.0" });
    await patchPackageJson({
      targetDir: scratch,
      devDependencies: { "@biomejs/biome": "^1.9.4" },
      scripts: { lint: "biome check ." },
    });
    const pkg = await readPkg();
    expect(pkg.devDependencies).toEqual({ "@biomejs/biome": "^1.9.4" });
    expect(pkg.scripts).toEqual({ lint: "biome check ." });
  });

  it("leaves identical keys untouched", async () => {
    await writePkg({
      name: "scratch",
      version: "0.0.0",
      scripts: { lint: "biome check ." },
    });
    await patchPackageJson({
      targetDir: scratch,
      scripts: { lint: "biome check ." },
    });
    const pkg = await readPkg();
    expect(pkg.scripts).toEqual({ lint: "biome check ." });
  });

  it("overwrites keys whose values differ", async () => {
    await writePkg({
      name: "scratch",
      version: "0.0.0",
      dependencies: { idb: "^7.0.0" },
    });
    await patchPackageJson({
      targetDir: scratch,
      dependencies: { idb: "^8.0.3" },
    });
    const pkg = await readPkg();
    expect(pkg.dependencies).toEqual({ idb: "^8.0.3" });
  });

  it("does not remove existing keys not mentioned in the input", async () => {
    await writePkg({
      name: "scratch",
      version: "0.0.0",
      scripts: { dev: "vite", lint: "biome check ." },
    });
    await patchPackageJson({
      targetDir: scratch,
      scripts: { format: "biome format --write ." },
    });
    const pkg = await readPkg();
    expect(pkg.scripts).toEqual({
      dev: "vite",
      lint: "biome check .",
      format: "biome format --write .",
    });
  });

  it("does not write the file in dry-run mode", async () => {
    await writePkg({ name: "scratch", version: "0.0.0" });
    await patchPackageJson({
      targetDir: scratch,
      devDependencies: { idb: "^8.0.3" },
      dryRun: true,
    });
    const pkg = await readPkg();
    expect(pkg.devDependencies).toBeUndefined();
  });
});
