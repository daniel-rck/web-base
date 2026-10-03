import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupScratch, scratchDir, writeText } from "../../test/fixtures.ts";
import { compareTemplateFile } from "./compare.ts";
import { copyTemplateFile } from "./copy.ts";

let templates: string;
let target: string;

beforeEach(async () => {
  templates = await scratchDir("web-base-templates-");
  target = await scratchDir("web-base-target-");
  await writeText(resolve(templates, "hygiene", "LICENSE"), "MIT 2026");
  vi.stubEnv("WEB_BASE_TEMPLATES_DIR", templates);
});
afterEach(cleanupScratch);

const license = { from: "LICENSE", to: "LICENSE" };
const opts = (extra: Record<string, unknown> = {}) => ({
  targetDir: target,
  template: "hygiene",
  ...extra,
});
const local = () => readFile(resolve(target, "LICENSE"), "utf8");

describe("copyTemplateFile", () => {
  it("copies an absent file, creating parent directories", async () => {
    expect(await copyTemplateFile({ from: "LICENSE", to: "a/b/LICENSE" }, opts())).toBe("copied");
    expect(existsSync(resolve(target, "a/b/LICENSE"))).toBe(true);
  });

  it("skips an existing differing file by default", async () => {
    await writeFile(resolve(target, "LICENSE"), "local edit");
    expect(await copyTemplateFile(license, opts())).toBe("kept-differs");
    expect(await local()).toBe("local edit");
  });

  it("reports an identical file as same, ignoring line endings", async () => {
    await writeFile(resolve(target, "LICENSE"), "MIT 2026");
    expect(await copyTemplateFile(license, opts())).toBe("same");
  });

  it("--force re-pulls an owned file", async () => {
    await writeFile(resolve(target, "LICENSE"), "local edit");
    expect(await copyTemplateFile(license, opts({ force: true }))).toBe("overwritten");
    expect(await local()).toBe("MIT 2026");
  });

  it("--force leaves a scaffold seam alone; --force-scaffold overwrites it", async () => {
    // The real hazard: a scaffold wrangler.toml carries live Cloudflare bindings.
    const seam = { ...license, policy: "scaffold" } as const;
    await writeFile(resolve(target, "LICENSE"), "local edit");
    expect(await copyTemplateFile(seam, opts({ force: true }))).toBe("kept-scaffold");
    expect(await local()).toBe("local edit");
    expect(await copyTemplateFile(seam, opts({ force: true, forceScaffold: true }))).toBe(
      "overwritten",
    );
    expect(await local()).toBe("MIT 2026");
  });

  it("`overwrite: true` never reaches a scaffold seam without --force-scaffold", async () => {
    await writeFile(resolve(target, "LICENSE"), "local edit");
    expect(
      await copyTemplateFile({ ...license, overwrite: true, policy: "scaffold" }, opts()),
    ).toBe("kept-differs");
    expect(await copyTemplateFile({ ...license, overwrite: true }, opts())).toBe("overwritten");
  });

  it("never overwrites a file listed in webBase.unmanaged, even with --force", async () => {
    await writeFile(resolve(target, "LICENSE"), "local fork");
    const action = await copyTemplateFile(
      license,
      opts({ force: true, unmanaged: new Set(["LICENSE"]) }),
    );
    expect(action).toBe("unmanaged");
    expect(await local()).toBe("local fork");
  });

  it("writes nothing in dry-run mode", async () => {
    expect(await copyTemplateFile(license, opts({ dryRun: true }))).toBe("would-copy");
    await writeFile(resolve(target, "LICENSE"), "local edit");
    expect(await copyTemplateFile(license, opts({ dryRun: true, force: true }))).toBe(
      "would-overwrite",
    );
    expect(await local()).toBe("local edit");
  });

  it("refuses a destination outside the target", async () => {
    await expect(copyTemplateFile({ from: "LICENSE", to: "../escape" }, opts())).rejects.toThrow(
      /is not inside/,
    );
  });

  it("throws a descriptive error when the source file is missing", async () => {
    await expect(copyTemplateFile({ from: "MISSING", to: "MISSING" }, opts())).rejects.toThrow(
      "Template file not found: hygiene/MISSING",
    );
  });
});

describe("compareTemplateFile", () => {
  it("reports missing, identical and differing files", async () => {
    expect(await compareTemplateFile(license, opts())).toEqual({
      status: "missing",
      added: 0,
      removed: 0,
    });
    await writeFile(resolve(target, "LICENSE"), "MIT 2026");
    expect(await compareTemplateFile(license, opts())).toEqual({
      status: "identical",
      added: 0,
      removed: 0,
    });
  });

  it("counts added/removed lines when contents differ", async () => {
    // Template source (canonical): 3 lines; local: 2 lines, one differing.
    await writeText(resolve(templates, "hygiene", "NOTES"), "alpha\nbeta\ngamma");
    await writeFile(resolve(target, "NOTES"), "alpha\nDELTA");
    const result = await compareTemplateFile({ from: "NOTES", to: "NOTES" }, opts());
    // Common: "alpha"; applying the source adds beta+gamma (+2) and drops DELTA (-1).
    expect(result).toEqual({ status: "differs", added: 2, removed: 1 });
  });

  it("treats a CRLF checkout of the same content as identical", async () => {
    await writeText(resolve(templates, "hygiene", "NOTES"), "a\nb\n");
    await writeFile(resolve(target, "NOTES"), "a\r\nb\r\n");
    expect((await compareTemplateFile({ from: "NOTES", to: "NOTES" }, opts())).status).toBe(
      "identical",
    );
  });

  it("returns edits only when asked", async () => {
    await writeFile(resolve(target, "LICENSE"), "MIT 2025");
    expect((await compareTemplateFile(license, opts())).edits).toBeUndefined();
    const { edits } = await compareTemplateFile(license, opts({ withEdits: true }));
    expect(edits).toEqual([
      { op: "delete", line: "MIT 2025" },
      { op: "insert", line: "MIT 2026" },
    ]);
  });
});
