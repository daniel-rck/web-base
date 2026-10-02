import { readdirSync, statSync } from "node:fs";
import { relative, resolve } from "pathe";
import { describe, expect, it } from "vitest";
import { listTemplates } from "./lib/manifest/load.ts";
import { loadChain } from "./lib/manifest/resolve.ts";
import { templatesDir } from "./lib/templates-dir.ts";

const root = templatesDir();
const skillRefs = resolve(root, "../../skill/references");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [relative(resolve(root), path)];
  });
}

const templateDirs = readdirSync(root).filter((name) =>
  statSync(resolve(root, name)).isDirectory(),
);

describe("shipped templates", () => {
  it("every manifest loads and validates (names, paths, from-files, extends)", async () => {
    const { manifests, errors } = await listTemplates();
    expect(errors).toEqual([]);
    expect(manifests.map((m) => m.name).toSorted()).toEqual(templateDirs.toSorted());
  });

  it.each(templateDirs)("%s ships no file its manifest doesn't list", async (name) => {
    const { manifests } = await listTemplates();
    const manifest = manifests.find((m) => m.name === name);
    const listed = new Set([
      `${name}/manifest.json`,
      ...(manifest?.files ?? []).map((f) => `${name}/${f.from}`),
    ]);
    expect(filesUnder(resolve(root, name)).filter((f) => !listed.has(f))).toEqual([]);
  });

  it.each(["core"])("the %s chain writes every destination only once", async (name) => {
    const destinations = (await loadChain(name)).flatMap((m) => (m.files ?? []).map((f) => f.to));
    expect(destinations.filter((to, i) => destinations.indexOf(to) !== i)).toEqual([]);
  });

  it.each(templateDirs.filter((name) => name !== "core"))("%s has a skill reference", (name) => {
    const refs = readdirSync(skillRefs);
    expect(refs.includes(`${name}.md`) || refs.includes(`${name}-system.md`)).toBe(true);
  });
});
