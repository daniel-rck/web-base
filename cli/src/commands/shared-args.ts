import { existsSync, statSync } from "node:fs";
import { consola } from "consola";
import { resolve } from "pathe";
import { CliError } from "../exit.ts";
import { loadChain } from "../lib/manifest/resolve.ts";
import type { TemplateManifest } from "../lib/manifest/types.ts";
import { printAvailable } from "./list.ts";

export const cwdArg = {
  cwd: { type: "string", description: "Target directory (default: current)" },
} as const;

export const forceArgs = {
  force: { type: "boolean", description: "Overwrite existing owned files" },
  "force-scaffold": {
    type: "boolean",
    description: "Also overwrite scaffold seams (implies --force; destroys per-app customization)",
  },
} as const;

export const dryRunArg = {
  "dry-run": { type: "boolean", description: "Log actions without writing" },
} as const;

export const diffArg = {
  diff: { type: "boolean", description: "Show a unified diff for every file that differs" },
} as const;

export const jsonArg = {
  json: { type: "boolean", description: "Print a machine-readable JSON result on stdout" },
} as const;

/** The absolute target directory; it must exist (only `init` may create it). */
export function resolveTargetDir(cwd: string | undefined, { mustExist = true } = {}): string {
  if (cwd === "") throw new CliError("--cwd needs a directory.");
  const dir = resolve(cwd ?? process.cwd());
  if (mustExist && (!existsSync(dir) || !statSync(dir).isDirectory())) {
    throw new CliError(`Target directory not found: ${dir}`);
  }
  return dir;
}

/** `--force-scaffold` on its own used to do nothing at all; now it implies `--force`. */
export function forceFlags(args: { force?: boolean; "force-scaffold"?: boolean }): {
  force: boolean;
  forceScaffold: boolean;
} {
  const forceScaffold = args["force-scaffold"] === true;
  if (forceScaffold && args.force !== true) consola.info("--force-scaffold implies --force.");
  return { force: args.force === true || forceScaffold, forceScaffold };
}

/** Load a template chain; for an unknown name, list what exists before failing. */
export async function loadChainOrList(name: string): Promise<TemplateManifest[]> {
  try {
    return await loadChain(name);
  } catch (err) {
    if (err instanceof CliError && err.code === "TEMPLATE_NOT_FOUND") await printAvailable();
    throw err;
  }
}
