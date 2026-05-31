import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  filePolicy,
  listTemplates,
  resolveTemplate,
  shouldApplyUpdate,
  type TemplateManifest,
} from "./manifest.ts";

let scratch: string;

async function writeManifest(template: string, manifest: TemplateManifest): Promise<void> {
  const dir = resolve(scratch, template);
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

beforeEach(async () => {
  scratch = await mkdtemp(resolve(tmpdir(), "web-base-manifest-"));
  process.env.WEB_BASE_TEMPLATES_DIR = scratch;
});

afterEach(async () => {
  process.env.WEB_BASE_TEMPLATES_DIR = undefined;
  await rm(scratch, { recursive: true, force: true });
});

describe("resolveTemplate", () => {
  it("returns the template itself when there are no extends", async () => {
    await writeManifest("hygiene", {
      name: "hygiene",
      description: "x",
      files: [{ from: "a", to: "a" }],
    });
    expect(await resolveTemplate("hygiene")).toEqual(["hygiene"]);
  });

  it("expands a simple meta-template in extends order", async () => {
    await writeManifest("hygiene", {
      name: "hygiene",
      description: "x",
      files: [{ from: "a", to: "a" }],
    });
    await writeManifest("biome", {
      name: "biome",
      description: "x",
      files: [{ from: "b", to: "b" }],
    });
    await writeManifest("core", {
      name: "core",
      description: "meta",
      extends: ["hygiene", "biome"],
    });
    expect(await resolveTemplate("core")).toEqual(["hygiene", "biome"]);
  });

  it("appends the meta itself when it has its own files", async () => {
    await writeManifest("hygiene", {
      name: "hygiene",
      description: "x",
      files: [{ from: "a", to: "a" }],
    });
    await writeManifest("super", {
      name: "super",
      description: "meta with own files",
      extends: ["hygiene"],
      files: [{ from: "extra", to: "extra" }],
    });
    expect(await resolveTemplate("super")).toEqual(["hygiene", "super"]);
  });

  it("handles a meta extending another meta and deduplicates", async () => {
    await writeManifest("a", {
      name: "a",
      description: "x",
      files: [{ from: "a", to: "a" }],
    });
    await writeManifest("b", {
      name: "b",
      description: "x",
      files: [{ from: "b", to: "b" }],
    });
    await writeManifest("inner", {
      name: "inner",
      description: "inner meta",
      extends: ["a"],
    });
    await writeManifest("outer", {
      name: "outer",
      description: "outer meta",
      extends: ["inner", "a", "b"],
    });
    expect(await resolveTemplate("outer")).toEqual(["a", "b"]);
  });

  it("throws a TEMPLATE_NOT_FOUND error when missing", async () => {
    await expect(resolveTemplate("nonexistent")).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  it("rejects on a direct circular extends instead of hanging", { timeout: 2000 }, async () => {
    await writeManifest("a", { name: "a", description: "x", extends: ["b"] });
    await writeManifest("b", { name: "b", description: "x", extends: ["a"] });
    await expect(resolveTemplate("a")).rejects.toThrow(/Circular extends detected/);
  });

  it("rejects on a self-referential extends", { timeout: 2000 }, async () => {
    await writeManifest("loop", { name: "loop", description: "x", extends: ["loop"] });
    await expect(resolveTemplate("loop")).rejects.toThrow(/Circular extends detected/);
  });

  it("allows two branches to share a leaf without a false cycle", async () => {
    await writeManifest("shared", {
      name: "shared",
      description: "x",
      files: [{ from: "s", to: "s" }],
    });
    await writeManifest("left", { name: "left", description: "x", extends: ["shared"] });
    await writeManifest("right", { name: "right", description: "x", extends: ["shared"] });
    await writeManifest("top", { name: "top", description: "x", extends: ["left", "right"] });
    expect(await resolveTemplate("top")).toEqual(["shared"]);
  });
});

describe("filePolicy", () => {
  it("defaults to owned when no policy is set", () => {
    expect(filePolicy({ from: "a", to: "a" })).toBe("owned");
  });

  it("returns the explicit policy when set", () => {
    expect(filePolicy({ from: "a", to: "a", policy: "scaffold" })).toBe("scaffold");
    expect(filePolicy({ from: "a", to: "a", policy: "owned" })).toBe("owned");
  });
});

describe("shouldApplyUpdate", () => {
  const owned = { from: "a", to: "a" } as const;
  const scaffold = { from: "a", to: "a", policy: "scaffold" } as const;

  it("never applies identical files regardless of policy", () => {
    expect(shouldApplyUpdate(owned, "identical")).toBe(false);
    expect(shouldApplyUpdate(scaffold, "identical")).toBe(false);
  });

  it("applies owned files that differ or are missing", () => {
    expect(shouldApplyUpdate(owned, "differs")).toBe(true);
    expect(shouldApplyUpdate(owned, "missing")).toBe(true);
  });

  it("never overwrites scaffold files even when they differ or are missing", () => {
    expect(shouldApplyUpdate(scaffold, "differs")).toBe(false);
    expect(shouldApplyUpdate(scaffold, "missing")).toBe(false);
  });
});

describe("listTemplates", () => {
  it("reports the file path when a manifest is malformed", async () => {
    const dir = resolve(scratch, "broken");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, "manifest.json"), "{ not valid json", "utf8");
    await expect(listTemplates()).rejects.toThrow(/Malformed manifest\.json at .*broken/);
  });
});
