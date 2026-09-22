import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "pathe";
import type { TemplateManifest } from "./manifest.ts";

/** A leftover of a superseded setup, attributed to the template that replaced it. */
export type ObsoleteFinding = {
  template: string;
  kind: "file" | "dependency";
  name: string;
};

type DependencyLists = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/**
 * Find files and package.json entries that a template declares `obsolete`
 * but the app still carries. Read-only: removing them stays a manual step,
 * because a leftover config may still hold per-app overrides worth porting.
 */
export async function findObsolete(
  targetDir: string,
  manifests: TemplateManifest[],
): Promise<ObsoleteFinding[]> {
  const pkg = await readDependencyLists(targetDir);
  const found: ObsoleteFinding[] = [];
  for (const manifest of manifests) {
    const obsolete = manifest.obsolete;
    if (!obsolete) continue;
    for (const file of obsolete.files ?? []) {
      if (existsSync(resolve(targetDir, file))) {
        found.push({ template: manifest.name, kind: "file", name: file });
      }
    }
    const deps = [...(obsolete.dependencies ?? []), ...(obsolete.devDependencies ?? [])];
    for (const dep of new Set(deps)) {
      if (pkg.dependencies?.[dep] !== undefined || pkg.devDependencies?.[dep] !== undefined) {
        found.push({ template: manifest.name, kind: "dependency", name: dep });
      }
    }
  }
  return found;
}

async function readDependencyLists(targetDir: string): Promise<DependencyLists> {
  const pkgPath = resolve(targetDir, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    return JSON.parse(await readFile(pkgPath, "utf8")) as DependencyLists;
  } catch {
    return {};
  }
}
