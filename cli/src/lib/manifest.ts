import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "pathe";

export type TemplateFileSpec = {
  from: string;
  to: string;
  overwrite?: boolean;
};

export type TemplateManifest = {
  name: string;
  description: string;
  extends?: string[];
  files?: TemplateFileSpec[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  postInstall?: string[];
};

export function templatesDir(): string {
  if (process.env.WEB_BASE_TEMPLATES_DIR) return process.env.WEB_BASE_TEMPLATES_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  // Built layout: cli/dist/index.js → ../templates
  const built = resolve(here, "../templates");
  if (existsSync(built)) return built;
  // Source layout: cli/src/lib/manifest.ts → ../../templates
  return resolve(here, "../../templates");
}

function parseManifest(raw: string, path: string): TemplateManifest {
  try {
    return JSON.parse(raw) as TemplateManifest;
  } catch (cause) {
    throw new Error(`Malformed manifest.json at ${path}: ${(cause as Error).message}`);
  }
}

export async function loadManifest(template: string): Promise<TemplateManifest> {
  const manifestPath = resolve(templatesDir(), template, "manifest.json");
  if (!existsSync(manifestPath)) {
    const err = new Error(`Template "${template}" not found.`) as Error & { code?: string };
    err.code = "TEMPLATE_NOT_FOUND";
    throw err;
  }
  const raw = await readFile(manifestPath, "utf8");
  return parseManifest(raw, manifestPath);
}

export async function resolveTemplate(
  template: string,
  visited: Set<string> = new Set(),
): Promise<string[]> {
  if (visited.has(template)) {
    const cycle = [...visited, template].join(" -> ");
    throw new Error(`Circular extends detected: ${cycle}`);
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
  if (
    manifest.files?.length ||
    manifest.dependencies ||
    manifest.devDependencies ||
    manifest.scripts
  ) {
    resolved.push(template);
  }
  return resolved;
}

export async function listTemplates(): Promise<TemplateManifest[]> {
  const { readdir } = await import("node:fs/promises");
  const dir = templatesDir();
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const manifests: TemplateManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = resolve(dir, entry.name, "manifest.json");
    if (!existsSync(path)) continue;
    const raw = await readFile(path, "utf8");
    manifests.push(parseManifest(raw, path));
  }
  return manifests.sort((a, b) => a.name.localeCompare(b.name));
}
