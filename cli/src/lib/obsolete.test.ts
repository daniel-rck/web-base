import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "pathe";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TemplateManifest } from "./manifest.ts";
import { findObsolete } from "./obsolete.ts";

let scratch: string;

const oxc: TemplateManifest = {
  name: "oxc",
  description: "test",
  obsolete: { files: ["biome.json", "biome.base.json"], devDependencies: ["@biomejs/biome"] },
};

async function writePkg(content: Record<string, unknown>): Promise<void> {
  await writeFile(resolve(scratch, "package.json"), JSON.stringify(content, null, 2), "utf8");
}

beforeEach(async () => {
  scratch = await mkdtemp(resolve(tmpdir(), "web-base-obsolete-"));
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe("findObsolete", () => {
  it("reports nothing on a clean app", async () => {
    await writePkg({ name: "scratch", devDependencies: { oxlint: "^1.85.0" } });
    expect(await findObsolete(scratch, [oxc])).toEqual([]);
  });

  it("reports leftover files and dependencies", async () => {
    await writePkg({ name: "scratch", devDependencies: { "@biomejs/biome": "^2.5.11" } });
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(await findObsolete(scratch, [oxc])).toEqual([
      { template: "oxc", kind: "file", name: "biome.json" },
      { template: "oxc", kind: "dependency", name: "@biomejs/biome" },
    ]);
  });

  it("finds a dependency declared obsolete in either section", async () => {
    await writePkg({ name: "scratch", dependencies: { "@biomejs/biome": "^2.5.11" } });
    expect(await findObsolete(scratch, [oxc])).toEqual([
      { template: "oxc", kind: "dependency", name: "@biomejs/biome" },
    ]);
  });

  it("ignores manifests without an obsolete list", async () => {
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(await findObsolete(scratch, [{ name: "layout", description: "test" }])).toEqual([]);
  });

  it("tolerates a missing or malformed package.json", async () => {
    await writeFile(resolve(scratch, "biome.json"), "{}", "utf8");
    expect(await findObsolete(scratch, [oxc])).toHaveLength(1);
    await writeFile(resolve(scratch, "package.json"), "{ not json", "utf8");
    expect(await findObsolete(scratch, [oxc])).toHaveLength(1);
  });
});
