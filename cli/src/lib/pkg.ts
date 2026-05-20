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
  const pkg = JSON.parse(raw) as PackageJson;

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
