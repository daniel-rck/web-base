import { existsSync, statSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "pathe";
import { CliError, errorMessage } from "../../exit.ts";
import { resolveInside } from "../paths.ts";
import { templatesDir } from "../templates-dir.ts";
import type { TemplateManifest } from "./types.ts";
import { TEMPLATE_NAME, validateManifest } from "./validate.ts";

/** Reject anything that isn't a bare template name before it touches the filesystem. */
export function assertTemplateName(name: string): void {
  if (!TEMPLATE_NAME.test(name)) {
    throw new CliError(`"${name}" is not a template name (lowercase letters, digits and dashes).`, {
      code: "TEMPLATE_NOT_FOUND",
    });
  }
}

export function templateDir(name: string): string {
  return resolveInside(templatesDir(), name);
}

/**
 * Load, parse and validate `<templates>/<name>/manifest.json`, including that
 * every `from` exists on disk and every `extends` target is a real template.
 */
export async function loadManifest(name: string): Promise<TemplateManifest> {
  assertTemplateName(name);
  const dir = templateDir(name);
  const path = resolve(dir, "manifest.json");
  if (!existsSync(path)) {
    throw new CliError(`Template "${name}" not found.`, { code: "TEMPLATE_NOT_FOUND" });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new CliError(`Malformed manifest.json at ${path}: ${errorMessage(cause)}`, { cause });
  }
  const manifest = validateManifest(raw, name, path);
  for (const spec of manifest.files ?? []) {
    const src = resolveInside(dir, spec.from);
    if (!existsSync(src) || !statSync(src).isFile()) {
      throw new CliError(`Template file not found: ${name}/${spec.from}`);
    }
  }
  for (const parent of manifest.extends ?? []) {
    if (!existsSync(resolve(templatesDir(), parent, "manifest.json"))) {
      throw new CliError(`Template "${name}" extends "${parent}", which does not exist.`);
    }
  }
  return manifest;
}

export type TemplateListing = {
  manifests: TemplateManifest[];
  /** Templates that failed to load, by manifest path — reported, not fatal. */
  errors: { path: string; message: string }[];
};

/** Every template directory, sorted by name. One broken manifest doesn't hide the rest. */
export async function listTemplates(): Promise<TemplateListing> {
  const dir = templatesDir();
  const listing: TemplateListing = { manifests: [], errors: [] };
  if (!existsSync(dir)) return listing;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = resolve(dir, entry.name, "manifest.json");
    if (!existsSync(path)) continue;
    try {
      listing.manifests.push(await loadManifest(entry.name));
    } catch (err) {
      listing.errors.push({ path, message: errorMessage(err) });
    }
  }
  listing.manifests.sort((a, b) => a.name.localeCompare(b.name));
  return listing;
}
