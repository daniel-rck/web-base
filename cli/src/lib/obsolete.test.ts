import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TemplateManifest } from "./manifest/types.ts";
import { findObsolete } from "./obsolete.ts";
import type { PackageJson } from "./pkg/doc.ts";

let scratch: string;

const oxc: TemplateManifest = {
  name: "oxc",
  description: "test",
  obsolete: { files: ["biome.json", "biome.base.json"], devDependencies: ["@biomejs/biome"] },
};

beforeEach(async () => {
  scratch = await mkdtemp(resolve(tmpdir(), "web-base-obsolete-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("findObsolete", () => {
  it("reports nothing on a clean app", async () => {
    const pkg: PackageJson = { name: "scratch", devDependencies: { oxlint: "^1.85.0" } };
    expect(findObsolete(scratch, [oxc], pkg)).toEqual([]);
  });

  it("reports leftover files and dependencies", async () => {
    const pkg: PackageJson = { name: "scratch", devDependencies: { "@biomejs/biome": "^2.5.11" } };
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(findObsolete(scratch, [oxc], pkg)).toEqual([
      { template: "oxc", kind: "file", name: "biome.json" },
      { template: "oxc", kind: "dependency", name: "@biomejs/biome" },
    ]);
  });

  it("finds a dependency declared obsolete in either section", async () => {
    const pkg: PackageJson = { name: "scratch", dependencies: { "@biomejs/biome": "^2.5.11" } };
    expect(findObsolete(scratch, [oxc], pkg)).toEqual([
      { template: "oxc", kind: "dependency", name: "@biomejs/biome" },
    ]);
  });

  it("ignores manifests without an obsolete list", async () => {
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(findObsolete(scratch, [{ name: "layout", description: "test" }], undefined)).toEqual([]);
  });

  it("reports files when the app has no package.json", async () => {
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(findObsolete(scratch, [oxc], undefined)).toHaveLength(1);
  });
});
