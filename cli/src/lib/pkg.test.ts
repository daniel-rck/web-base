import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patchPackageJson, readWebBaseVersion, stampWebBaseVersion } from "./pkg.ts";

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
      devDependencies: { "@biomejs/biome": "^2.4.15" },
      scripts: { lint: "biome check ." },
    });
    const pkg = await readPkg();
    expect(pkg.devDependencies).toEqual({ "@biomejs/biome": "^2.4.15" });
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

describe("stampWebBaseVersion", () => {
  it("adds webBase.version when absent", async () => {
    await writePkg({ name: "scratch", version: "0.0.0" });
    await stampWebBaseVersion({ targetDir: scratch, version: "0.2.0" });
    const pkg = await readPkg();
    expect(pkg.webBase).toEqual({ version: "0.2.0" });
  });

  it("updates an existing webBase.version", async () => {
    await writePkg({ name: "scratch", version: "0.0.0", webBase: { version: "0.1.0" } });
    await stampWebBaseVersion({ targetDir: scratch, version: "0.2.0" });
    const pkg = await readPkg();
    expect(pkg.webBase).toEqual({ version: "0.2.0" });
  });

  it("preserves other webBase fields", async () => {
    await writePkg({
      name: "scratch",
      version: "0.0.0",
      webBase: { version: "0.1.0", note: "keep me" },
    });
    await stampWebBaseVersion({ targetDir: scratch, version: "0.2.0" });
    const pkg = await readPkg();
    expect(pkg.webBase).toEqual({ version: "0.2.0", note: "keep me" });
  });

  it("does not write the file in dry-run mode", async () => {
    await writePkg({ name: "scratch", version: "0.0.0" });
    await stampWebBaseVersion({ targetDir: scratch, version: "0.2.0", dryRun: true });
    const pkg = await readPkg();
    expect(pkg.webBase).toBeUndefined();
  });
});

describe("readWebBaseVersion", () => {
  it("returns the stamped version", async () => {
    await writePkg({ name: "scratch", version: "0.0.0", webBase: { version: "0.2.0" } });
    expect(await readWebBaseVersion(scratch)).toBe("0.2.0");
  });

  it("returns undefined when unstamped", async () => {
    await writePkg({ name: "scratch", version: "0.0.0" });
    expect(await readWebBaseVersion(scratch)).toBeUndefined();
  });

  it("returns undefined when package.json is missing", async () => {
    expect(await readWebBaseVersion(resolve(scratch, "nope"))).toBeUndefined();
  });
});

describe("stampWebBaseVersion formatting", () => {
  it("splices the stamp in without reformatting the rest of the file", async () => {
    // Deliberately non-`JSON.stringify` formatting: an inline array and a
    // nested object that a round-trip would reflow.
    const raw = [
      "{",
      '  "name": "scratch",',
      '  "version": "0.0.0",',
      '  "keywords": ["a", "b", "c"],',
      '  "lint-staged": { "*.ts": ["biome check --write"] }',
      "}",
      "",
    ].join("\n");
    await writeFile(resolve(scratch, "package.json"), raw, "utf8");

    await stampWebBaseVersion({ targetDir: scratch, version: "0.3.0" });

    const after = await readFile(resolve(scratch, "package.json"), "utf8");
    expect(after).toContain('"keywords": ["a", "b", "c"],');
    expect(after).toContain('"lint-staged": { "*.ts": ["biome check --write"] },');
    expect(JSON.parse(after).webBase).toEqual({ version: "0.3.0" });
  });

  it("rewrites only the version literal when already stamped", async () => {
    const raw = [
      "{",
      '  "name": "scratch",',
      '  "keywords": ["a", "b"],',
      '  "webBase": {',
      '    "version": "0.1.0"',
      "  }",
      "}",
      "",
    ].join("\n");
    await writeFile(resolve(scratch, "package.json"), raw, "utf8");

    await stampWebBaseVersion({ targetDir: scratch, version: "0.3.0" });

    const after = await readFile(resolve(scratch, "package.json"), "utf8");
    expect(after).toBe(raw.replace('"0.1.0"', '"0.3.0"'));
  });
});
