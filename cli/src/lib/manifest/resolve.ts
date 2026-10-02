import { CliError } from "../../exit.ts";
import { loadManifest } from "./load.ts";
import type { TemplateManifest } from "./types.ts";

/** Whether a template contributes anything itself when it also `extends` others. */
function hasOwnContent(manifest: TemplateManifest): boolean {
  return Boolean(
    manifest.files?.length ||
    manifest.dependencies ||
    manifest.devDependencies ||
    manifest.scripts ||
    manifest.postInstall?.length ||
    manifest.obsolete,
  );
}

/**
 * The ordered leaf templates `name` stands for: its `extends`, depth-first and
 * deduplicated (first occurrence wins), then itself if it has its own content.
 */
export async function resolveTemplate(
  template: string,
  visited: Set<string> = new Set(),
): Promise<string[]> {
  if (visited.has(template)) {
    const cycle = [...visited, template].join(" -> ");
    throw new CliError(`Circular extends detected: ${cycle}`);
  }
  visited.add(template);

  const manifest = await loadManifest(template);
  if (!manifest.extends?.length) return [template];

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const child of manifest.extends) {
    // A fresh branch view of `visited` so independent branches that legitimately
    // share a leaf don't trip the cycle guard, while back-edges still do.
    for (const t of await resolveTemplate(child, new Set(visited))) {
      if (!seen.has(t)) {
        seen.add(t);
        resolved.push(t);
      }
    }
  }
  if (hasOwnContent(manifest)) resolved.push(template);
  return resolved;
}

/** Resolve `name` and load every leaf manifest, in apply order. */
export async function loadChain(name: string): Promise<TemplateManifest[]> {
  const leaves = await resolveTemplate(name);
  return Promise.all(leaves.map((leaf) => loadManifest(leaf)));
}
