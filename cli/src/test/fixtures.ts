import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, relative, resolve } from "pathe";

const created: string[] = [];

/** A fresh temp directory, removed by `cleanupScratch`. */
export async function scratchDir(prefix = "web-base-"): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export async function cleanupScratch(): Promise<void> {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

export async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

export async function readJson(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

/**
 * An app directory like the CI smoke tests used: a git repo (oxfmt reads
 * .gitignore) with a minimal package.json, unless `pkg: false`.
 */
export async function scratchApp(
  options: { pkg?: Record<string, unknown> | false; git?: boolean } = {},
) {
  const dir = await scratchDir("web-base-app-");
  if (options.git !== false) {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    await writeText(resolve(dir, ".gitignore"), "");
  }
  if (options.pkg !== false) {
    await writeJson(
      resolve(dir, "package.json"),
      options.pkg ?? { name: "scratch", version: "0.0.0" },
    );
  }
  return dir;
}

/** Every file under `dir` (relative path → size + mtime), to prove nothing was written. */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = resolve(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else {
        const stat = statSync(path);
        out[relative(dir, path)] = `${stat.size}:${stat.mtimeMs}`;
      }
    }
  };
  walk(dir);
  return out;
}

/** Write a fixture template under `templatesRoot/<name>/`. */
export async function writeTemplate(
  templatesRoot: string,
  name: string,
  manifest: Record<string, unknown>,
  files: Record<string, string> = {},
): Promise<void> {
  await writeJson(resolve(templatesRoot, name, "manifest.json"), {
    name,
    description: name,
    ...manifest,
  });
  for (const [path, content] of Object.entries(files)) {
    await writeText(resolve(templatesRoot, name, path), content);
  }
}
