import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanupScratch, scratchDir, writeTemplate } from "../../test/fixtures.ts";
import { listTemplates, loadManifest } from "./load.ts";
import { resolveTemplate } from "./resolve.ts";
import { filePolicy } from "./types.ts";
import { validateManifest } from "./validate.ts";

let root: string;

beforeEach(async () => {
  root = await scratchDir("web-base-templates-");
  vi.stubEnv("WEB_BASE_TEMPLATES_DIR", root);
});
afterEach(cleanupScratch);

const leaf = (name: string) =>
  writeTemplate(root, name, { files: [{ from: name, to: name }] }, { [name]: "x" });

describe("resolveTemplate", () => {
  it("returns the template itself when there are no extends", async () => {
    await leaf("hygiene");
    expect(await resolveTemplate("hygiene")).toEqual(["hygiene"]);
  });

  it("expands a meta-template in extends order", async () => {
    await leaf("hygiene");
    await leaf("oxc");
    await writeTemplate(root, "core", { extends: ["hygiene", "oxc"] });
    expect(await resolveTemplate("core")).toEqual(["hygiene", "oxc"]);
  });

  it("appends the meta itself when it has its own content", async () => {
    await leaf("hygiene");
    await writeTemplate(root, "app", { extends: ["hygiene"], postInstall: ["do it"] });
    expect(await resolveTemplate("app")).toEqual(["hygiene", "app"]);
  });

  it("handles a meta extending another meta and deduplicates", async () => {
    await leaf("a");
    await leaf("b");
    await writeTemplate(root, "inner", { extends: ["a"] });
    await writeTemplate(root, "outer", { extends: ["inner", "a", "b"] });
    expect(await resolveTemplate("outer")).toEqual(["a", "b"]);
  });

  it("throws TEMPLATE_NOT_FOUND for a missing template", async () => {
    await expect(resolveTemplate("nonexistent")).rejects.toMatchObject({
      code: "TEMPLATE_NOT_FOUND",
    });
  });

  it("rejects a circular extends instead of hanging", { timeout: 2000 }, async () => {
    await writeTemplate(root, "a", { extends: ["b"] });
    await writeTemplate(root, "b", { extends: ["a"] });
    await expect(resolveTemplate("a")).rejects.toThrow(/Circular extends detected/);
  });

  it("allows two branches to share a leaf without a false cycle", async () => {
    await leaf("shared");
    await writeTemplate(root, "left", { extends: ["shared"] });
    await writeTemplate(root, "right", { extends: ["shared"] });
    await writeTemplate(root, "top", { extends: ["left", "right"] });
    expect(await resolveTemplate("top")).toEqual(["shared"]);
  });
});

describe("loadManifest", () => {
  it.each(["/abs/dir", "../x", "Core", "a/b", ""])("rejects the template name %j", async (name) => {
    await expect(loadManifest(name)).rejects.toMatchObject({ code: "TEMPLATE_NOT_FOUND" });
  });

  it("rejects a manifest whose `from` is missing on disk", async () => {
    await writeTemplate(root, "x", { files: [{ from: "nope", to: "nope" }] });
    await expect(loadManifest("x")).rejects.toThrow("Template file not found: x/nope");
  });

  it("rejects an extends target that doesn't exist", async () => {
    await writeTemplate(root, "core", { extends: ["ghost"] });
    await expect(loadManifest("core")).rejects.toThrow(
      'Template "core" extends "ghost", which does not exist.',
    );
  });
});

describe("validateManifest", () => {
  const valid = {
    name: "x",
    description: "d",
    files: [{ from: "a", to: "src/a.ts", policy: "scaffold" }],
  };

  it("accepts a well-formed manifest", () => {
    expect(validateManifest(valid, "x", "m.json")).toEqual(valid);
  });

  it.each([
    [{ ...valid, name: "y" }, /name must equal its directory name "x"/],
    [{ ...valid, extra: 1 }, /unknown key "extra"/],
    [{ ...valid, extends: "core" }, /extends must be an array of strings/],
    [{ ...valid, files: [{ from: "a", to: "../x" }] }, /files\[0\]\.to "\.\.\/x" escapes its root/],
    [{ ...valid, files: [{ from: "a", to: "/etc/x" }] }, /files\[0\]\.to "\/etc\/x" is absolute/],
    [
      { ...valid, files: [{ from: "../../s", to: "s" }] },
      /files\[0\]\.from "\.\.\/\.\.\/s" escapes its root/,
    ],
    [{ ...valid, files: [{ from: "a", to: "./a" }] }, /is not normalized/],
    [{ ...valid, files: [{ from: "a", to: "package.json" }] }, /is reserved/],
    [
      {
        ...valid,
        files: [
          { from: "a", to: "a" },
          { from: "b", to: "a" },
        ],
      },
      /listed twice/,
    ],
    [
      { ...valid, files: [{ from: "a", to: "a", policy: "scafold" }] },
      /policy must be "owned" or "scaffold"/,
    ],
    [{ ...valid, dependencies: { idb: 8 } }, /dependencies must map names to strings/],
    [{ ...valid, obsolete: { files: "biome.json" } }, /obsolete\.files must be an array/],
  ])("rejects %j", (manifest, message) => {
    expect(() => validateManifest(manifest, "x", "m.json")).toThrow(message);
  });

  it("reports every problem at once", () => {
    expect(() => validateManifest({ name: "y", files: [{ to: 1 }] }, "x", "m.json")).toThrow(
      /name must equal[\s\S]*description must be a string[\s\S]*from must be a string[\s\S]*to must be a string/,
    );
  });
});

describe("listTemplates", () => {
  it("reports a broken manifest by path and still lists the rest", async () => {
    await leaf("good");
    await mkdir(resolve(root, "broken"), { recursive: true });
    await writeFile(resolve(root, "broken", "manifest.json"), "{ not json", "utf8");
    const { manifests, errors } = await listTemplates();
    expect(manifests.map((m) => m.name)).toEqual(["good"]);
    expect(errors).toEqual([
      { path: expect.stringContaining("broken"), message: expect.stringMatching(/Malformed/) },
    ]);
  });
});

describe("filePolicy", () => {
  it("defaults to owned", () => {
    expect(filePolicy({ from: "a", to: "a" })).toBe("owned");
    expect(filePolicy({ from: "a", to: "a", policy: "scaffold" })).toBe("scaffold");
  });
});
