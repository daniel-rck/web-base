import { existsSync } from "node:fs";
import { resolve } from "pathe";
import type { TemplateManifest } from "./manifest/types.ts";
import type { PackageJson } from "./pkg/doc.ts";

/** A leftover of a superseded setup, attributed to the template that replaced it. */
export type ObsoleteFinding = {
  template: string;
  kind: "file" | "dependency";
  name: string;
};

/**
 * Find files and package.json entries that a template declares `obsolete`
 * but the app still carries. Read-only: removing them stays a manual step,
 * because a leftover config may still hold per-app overrides worth porting.
 */
export function findObsolete(
  targetDir: string,
  manifests: TemplateManifest[],
  pkg: PackageJson | undefined,
): ObsoleteFinding[] {
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
      if (pkg?.dependencies?.[dep] !== undefined || pkg?.devDependencies?.[dep] !== undefined) {
        found.push({ template: manifest.name, kind: "dependency", name: dep });
      }
    }
  }
  return found;
}
