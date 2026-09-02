import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { consola } from "consola";
import { resolve } from "pathe";

export type PatchOptions = {
  targetDir: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  dryRun?: boolean;
};

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  webBase?: { version?: string; [key: string]: unknown };
  [key: string]: unknown;
};

const SECTIONS = ["dependencies", "devDependencies", "scripts"] as const;

export async function patchPackageJson(options: PatchOptions): Promise<void> {
  const { targetDir, dryRun = false } = options;
  const pkgPath = resolve(targetDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json found at ${pkgPath}`);
  }
  const raw = await readFile(pkgPath, "utf8");
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch (cause) {
    throw new Error(`Malformed package.json at ${pkgPath}: ${(cause as Error).message}`);
  }

  let changed = false;
  for (const section of SECTIONS) {
    const input = options[section];
    if (!input) continue;
    const current = (pkg[section] ?? {}) as Record<string, string>;
    for (const [name, value] of Object.entries(input)) {
      if (current[name] !== value) {
        current[name] = value;
        changed = true;
        consola.info(`  ${section}.${name} → ${value}`);
      }
    }
    pkg[section] = current;
  }

  if (!changed) {
    consola.info("  package.json — already up to date");
    return;
  }

  if (dryRun) {
    consola.info("  package.json — would patch");
    return;
  }

  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  consola.success("  package.json — patched");
}

/**
 * Record which web-base version last wrote files into this app, under
 * `package.json` → `webBase.version`. Additive: other `webBase` fields are
 * preserved. Lets `web-base update` tell the app whether it's behind.
 */
export async function stampWebBaseVersion(options: {
  targetDir: string;
  version: string;
  dryRun?: boolean;
}): Promise<void> {
  const { targetDir, version, dryRun = false } = options;
  const pkgPath = resolve(targetDir, "package.json");
  if (!existsSync(pkgPath)) {
    // During `init --dry-run` the package.json hasn't been written yet.
    if (dryRun) {
      consola.info(`  package.json — would stamp webBase.version → ${version}`);
      return;
    }
    throw new Error(`No package.json found at ${pkgPath}`);
  }
  const raw = await readFile(pkgPath, "utf8");
  let pkg: PackageJson;
  try {
    pkg = JSON.parse(raw) as PackageJson;
  } catch (cause) {
    throw new Error(`Malformed package.json at ${pkgPath}: ${(cause as Error).message}`);
  }

  if (pkg.webBase?.version === version) {
    consola.info(`  package.json — webBase.version already ${version}`);
    return;
  }
  if (dryRun) {
    consola.info(`  package.json — would stamp webBase.version → ${version}`);
    return;
  }

  // Prefer a surgical text edit: a JSON round-trip reflows the whole file, and
  // an app's first stamp would then bury its real diff under a reformat of
  // every inline array and key in package.json.
  const spliced = spliceStamp(raw, version);
  const next =
    spliced ?? `${JSON.stringify({ ...pkg, webBase: { ...pkg.webBase, version } }, null, 2)}\n`;
  await writeFile(pkgPath, next, "utf8");
  if (!spliced) {
    consola.warn("  package.json — reformatted (could not splice the stamp in place)");
  }
  consola.success(`  package.json — webBase.version → ${version}`);
}

/**
 * Write `webBase.version` into raw package.json text without reformatting the
 * rest of the file. Returns `undefined` when the shape is unexpected, so the
 * caller can fall back to a full re-serialization.
 */
function spliceStamp(raw: string, version: string): string | undefined {
  // Already stamped: replace just the version literal.
  const stamped = /("webBase"\s*:\s*\{[^{}]*?"version"\s*:\s*")([^"]*)(")/;
  if (stamped.test(raw)) return raw.replace(stamped, `$1${version}$3`);
  // A `webBase` key in some other shape — don't guess, re-serialize instead.
  if (/"webBase"\s*:/.test(raw)) return undefined;
  const end = raw.lastIndexOf("}");
  if (end < 0) return undefined;
  const head = raw.slice(0, end).replace(/\s*$/, "");
  if (!head.endsWith("}") && !head.endsWith('"') && !head.endsWith("]")) return undefined;
  const indent = /\n([ \t]+)"/.exec(raw)?.[1] ?? "  ";
  return `${head},\n${indent}"webBase": {\n${indent}${indent}"version": "${version}"\n${indent}}\n${raw.slice(end)}`;
}

/**
 * Read the stamped web-base version from an app's package.json, or `undefined`
 * if the file or stamp is absent/unreadable. Never throws — used for reporting.
 */
export async function readWebBaseVersion(targetDir: string): Promise<string | undefined> {
  const pkgPath = resolve(targetDir, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as PackageJson;
    return pkg.webBase?.version;
  } catch {
    return undefined;
  }
}
