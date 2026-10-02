import { CliError } from "../../exit.ts";
import { relativePathProblem } from "../paths.ts";
import type { TemplateManifest } from "./types.ts";

export const TEMPLATE_NAME = /^[a-z][a-z0-9-]*$/;

const MANIFEST_KEYS = new Set([
  "$schema",
  "$comment",
  "name",
  "description",
  "extends",
  "files",
  "dependencies",
  "devDependencies",
  "scripts",
  "postInstall",
  "obsolete",
]);
const FILE_KEYS = new Set(["from", "to", "overwrite", "policy"]);
const OBSOLETE_KEYS = new Set(["files", "dependencies", "devDependencies"]);
/** Destinations a template must never write: the CLI owns package.json edits. */
const FORBIDDEN_TO = [/^package\.json$/, /^\.git(\/|$)/, /^node_modules(\/|$)/];

type Issues = string[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkKeys(value: Record<string, unknown>, known: Set<string>, at: string, out: Issues) {
  for (const key of Object.keys(value)) {
    if (!known.has(key)) out.push(`${at}: unknown key "${key}"`);
  }
}

function checkStringRecord(value: unknown, at: string, out: Issues): void {
  if (value === undefined) return;
  if (!isRecord(value) || Object.values(value).some((v) => typeof v !== "string")) {
    out.push(`${at} must map names to strings`);
  }
}

function checkStringArray(value: unknown, at: string, out: Issues): value is string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return true;
  out.push(`${at} must be an array of strings`);
  return false;
}

function checkFiles(files: unknown, out: Issues): void {
  if (!Array.isArray(files)) {
    out.push("files must be an array");
    return;
  }
  const seen = new Set<string>();
  files.forEach((file: unknown, i) => {
    const at = `files[${i}]`;
    if (!isRecord(file)) {
      out.push(`${at} must be an object`);
      return;
    }
    checkKeys(file, FILE_KEYS, at, out);
    const { from, to, overwrite, policy } = file;
    if (typeof from !== "string") out.push(`${at}.from must be a string`);
    else {
      const problem = relativePathProblem(from);
      if (problem) out.push(`${at}.from "${from}" ${problem}`);
      else if (from === "manifest.json") out.push(`${at}.from must not be manifest.json`);
    }
    if (typeof to !== "string") out.push(`${at}.to must be a string`);
    else {
      const problem = relativePathProblem(to);
      if (problem) out.push(`${at}.to "${to}" ${problem}`);
      else if (FORBIDDEN_TO.some((re) => re.test(to))) out.push(`${at}.to "${to}" is reserved`);
      else if (seen.has(to)) out.push(`${at}.to "${to}" is listed twice`);
      seen.add(to);
    }
    if (overwrite !== undefined && typeof overwrite !== "boolean") {
      out.push(`${at}.overwrite must be a boolean`);
    }
    if (policy !== undefined && policy !== "owned" && policy !== "scaffold") {
      out.push(`${at}.policy must be "owned" or "scaffold"`);
    }
  });
}

/**
 * Check a parsed manifest's shape and every path in it, collecting all
 * problems at once. Templates can come from `WEB_BASE_TEMPLATES_DIR`, so a
 * `to` of `../x` or `/etc/x` must be rejected here, before anything is written.
 */
export function validateManifest(raw: unknown, dirName: string, path: string): TemplateManifest {
  const out: Issues = [];
  if (!isRecord(raw)) throw new CliError(`Invalid manifest at ${path}: not a JSON object.`);
  checkKeys(raw, MANIFEST_KEYS, "manifest", out);
  if (raw.name !== dirName) {
    out.push(`name must equal its directory name "${dirName}" (got ${JSON.stringify(raw.name)})`);
  }
  if (typeof raw.description !== "string") out.push("description must be a string");
  if (raw.extends !== undefined && checkStringArray(raw.extends, "extends", out)) {
    for (const name of raw.extends) {
      if (!TEMPLATE_NAME.test(name)) out.push(`extends: "${name}" is not a template name`);
    }
  }
  if (raw.files !== undefined) checkFiles(raw.files, out);
  for (const section of ["dependencies", "devDependencies", "scripts"] as const) {
    checkStringRecord(raw[section], section, out);
  }
  if (raw.postInstall !== undefined) checkStringArray(raw.postInstall, "postInstall", out);
  if (raw.obsolete !== undefined) {
    if (!isRecord(raw.obsolete)) out.push("obsolete must be an object");
    else {
      checkKeys(raw.obsolete, OBSOLETE_KEYS, "obsolete", out);
      for (const [key, value] of Object.entries(raw.obsolete)) {
        checkStringArray(value, `obsolete.${key}`, out);
      }
    }
  }
  if (out.length > 0) {
    throw new CliError(`Invalid manifest at ${path}:\n  - ${out.join("\n  - ")}`);
  }
  return raw as TemplateManifest;
}
