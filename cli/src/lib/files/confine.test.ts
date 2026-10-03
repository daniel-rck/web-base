import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupScratch, scratchDir, writeText } from "../../test/fixtures.ts";
import { copyTemplateFile } from "./copy.ts";

// resolveInside() is lexical: a symlink in the app could still send a write
// elsewhere. These go through copyTemplateFile, the path every command uses.

let templates: string;
let target: string;
let outside: string;

beforeEach(async () => {
  templates = await scratchDir("web-base-templates-");
  target = await scratchDir("web-base-target-");
  outside = await scratchDir("web-base-outside-");
  await writeText(resolve(templates, "hygiene", "LICENSE"), "MIT 2026");
  vi.stubEnv("WEB_BASE_TEMPLATES_DIR", templates);
});
afterEach(cleanupScratch);

const opts = (extra: Record<string, unknown> = {}) => ({
  targetDir: target,
  template: "hygiene",
  ...extra,
});

describe("template writes stay inside the target, symlinks included", () => {
  it("refuses a destination below a symlinked directory that leaves the target", async () => {
    await symlink(outside, resolve(target, "docs"));
    for (const to of ["docs/LICENSE", "docs/a/b/LICENSE"]) {
      await expect(copyTemplateFile({ from: "LICENSE", to }, opts())).rejects.toThrow(/outside/);
    }
    expect(readdirSync(outside)).toEqual([]);
  });

  it("refuses a destination that is itself a symlink, even with --force", async () => {
    const victim = resolve(outside, "victim");
    await writeFile(victim, "keep me");
    await symlink(victim, resolve(target, "LICENSE"));
    const copy = copyTemplateFile({ from: "LICENSE", to: "LICENSE" }, opts({ force: true }));
    await expect(copy).rejects.toThrow(/symlink/);
    expect(await readFile(victim, "utf8")).toBe("keep me");
  });

  it("refuses a dangling symlink instead of creating its target", async () => {
    await symlink(resolve(outside, "new"), resolve(target, "LICENSE"));
    const copy = copyTemplateFile({ from: "LICENSE", to: "LICENSE" }, opts());
    await expect(copy).rejects.toThrow(/symlink/);
    expect(existsSync(resolve(outside, "new"))).toBe(false);
  });

  it("allows a symlink that stays inside the target, and a symlinked target", async () => {
    await mkdir(resolve(target, "real"));
    await symlink(resolve(target, "real"), resolve(target, "alias"));
    const viaAlias = copyTemplateFile({ from: "LICENSE", to: "alias/LICENSE" }, opts());
    await expect(viaAlias).resolves.toBe("copied");
    expect(await readFile(resolve(target, "real/LICENSE"), "utf8")).toBe("MIT 2026");

    const link = resolve(outside, "app-link");
    await symlink(target, link);
    const viaLink = copyTemplateFile({ from: "LICENSE", to: "LICENSE" }, opts({ targetDir: link }));
    await expect(viaLink).resolves.toBe("copied");
  });
});
