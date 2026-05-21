import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveTemplate, type TemplateManifest } from "./manifest.ts";

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
});
