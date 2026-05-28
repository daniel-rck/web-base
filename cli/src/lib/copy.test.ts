import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyTemplateFiles, diffTemplateFile } from "./copy.ts";

let scratch: string;
let templates: string;
let target: string;

beforeEach(async () => {
  scratch = await mkdtemp(resolve(tmpdir(), "web-base-copy-"));
  templates = resolve(scratch, "templates");
  target = resolve(scratch, "target");
  await mkdir(resolve(templates, "hygiene"), { recursive: true });
  await mkdir(target, { recursive: true });
  await writeFile(resolve(templates, "hygiene", "LICENSE"), "MIT 2026", "utf8");
  process.env.WEB_BASE_TEMPLATES_DIR = templates;
});

afterEach(async () => {
  process.env.WEB_BASE_TEMPLATES_DIR = undefined;
  await rm(scratch, { recursive: true, force: true });
});

describe("copyTemplateFiles", () => {
  it("copies a file to the destination", async () => {
    await copyTemplateFiles([{ from: "LICENSE", to: "LICENSE" }], {
      targetDir: target,
      template: "hygiene",
    });
    expect(existsSync(resolve(target, "LICENSE"))).toBe(true);
    expect(await readFile(resolve(target, "LICENSE"), "utf8")).toBe("MIT 2026");
  });

  it("skips existing files by default", async () => {
    await writeFile(resolve(target, "LICENSE"), "existing", "utf8");
    await copyTemplateFiles([{ from: "LICENSE", to: "LICENSE" }], {
      targetDir: target,
      template: "hygiene",
    });
    expect(await readFile(resolve(target, "LICENSE"), "utf8")).toBe("existing");
  });

  it("overwrites existing files when force is true", async () => {
    await writeFile(resolve(target, "LICENSE"), "existing", "utf8");
    await copyTemplateFiles([{ from: "LICENSE", to: "LICENSE" }], {
      targetDir: target,
      template: "hygiene",
      force: true,
    });
    expect(await readFile(resolve(target, "LICENSE"), "utf8")).toBe("MIT 2026");
  });

  it("overwrites existing files when the spec sets overwrite", async () => {
    await writeFile(resolve(target, "LICENSE"), "existing", "utf8");
    await copyTemplateFiles([{ from: "LICENSE", to: "LICENSE", overwrite: true }], {
      targetDir: target,
      template: "hygiene",
    });
    expect(await readFile(resolve(target, "LICENSE"), "utf8")).toBe("MIT 2026");
  });

  it("does not write anything in dry-run mode", async () => {
    await copyTemplateFiles([{ from: "LICENSE", to: "LICENSE" }], {
      targetDir: target,
      template: "hygiene",
      dryRun: true,
    });
    expect(existsSync(resolve(target, "LICENSE"))).toBe(false);
  });

  it("creates parent directories as needed", async () => {
    await copyTemplateFiles([{ from: "LICENSE", to: "deep/nested/LICENSE" }], {
      targetDir: target,
      template: "hygiene",
    });
    expect(existsSync(resolve(target, "deep/nested/LICENSE"))).toBe(true);
  });

  it("throws a descriptive error when the source file is missing", async () => {
    await expect(
      copyTemplateFiles([{ from: "MISSING", to: "MISSING" }], {
        targetDir: target,
        template: "hygiene",
      }),
    ).rejects.toThrow("Template file not found: hygiene/MISSING");
  });
});

describe("diffTemplateFile", () => {
  it("reports missing when the local file does not exist", async () => {
    const result = await diffTemplateFile(
      { from: "LICENSE", to: "LICENSE" },
      { targetDir: target, template: "hygiene" },
    );
    expect(result).toEqual({ status: "missing", added: 0, removed: 0 });
  });

  it("reports identical when contents match", async () => {
    await writeFile(resolve(target, "LICENSE"), "MIT 2026", "utf8");
    const result = await diffTemplateFile(
      { from: "LICENSE", to: "LICENSE" },
      { targetDir: target, template: "hygiene" },
    );
    expect(result).toEqual({ status: "identical", added: 0, removed: 0 });
  });

  it("reports added/removed line counts when contents differ", async () => {
    // template source (canonical): 3 lines; local: 2 lines, one differing.
    await writeFile(resolve(templates, "hygiene", "NOTES"), "alpha\nbeta\ngamma", "utf8");
    await writeFile(resolve(target, "NOTES"), "alpha\nDELTA", "utf8");
    const result = await diffTemplateFile(
      { from: "NOTES", to: "NOTES" },
      { targetDir: target, template: "hygiene" },
    );
    // LCS is "alpha" (1 common line): source adds beta+gamma (+2),
    // local drops DELTA (-1).
    expect(result).toEqual({ status: "differs", added: 2, removed: 1 });
  });

  it("throws a descriptive error when the source file is missing", async () => {
    await expect(
      diffTemplateFile(
        { from: "MISSING", to: "MISSING" },
        { targetDir: target, template: "hygiene" },
      ),
    ).rejects.toThrow("Template file not found: hygiene/MISSING");
  });
});
