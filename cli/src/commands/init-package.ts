import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "pathe";
import { CliError } from "../exit.ts";
import type { PackageJson } from "../lib/pkg/doc.ts";

/**
 * The app name becomes the npm name, the `<name>.daniel-rck.workers.dev` label
 * and part of the repo URL, so it has to be valid as all three.
 */
const APP_NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function validateAppName(name: string): string {
  const trimmed = name.trim();
  if (!APP_NAME.test(trimmed)) {
    throw new CliError(`"${trimmed}" is not a valid app name.`, {
      hint: "Use lowercase letters, digits and dashes (it becomes the npm name and the workers.dev subdomain).",
    });
  }
  return trimmed;
}

/** The fresh package.json `init` writes (see `07-conventions.md`). */
export function renderPackageJson(name: string, packageManager: string): PackageJson {
  return {
    name,
    private: true,
    version: "0.0.0",
    type: "module",
    description: "",
    keywords: ["pwa", "privacy", "offline", "react", "vite", "typescript"],
    author: "",
    license: "MIT",
    homepage: `https://${name}.daniel-rck.workers.dev`,
    repository: {
      type: "git",
      url: `https://github.com/daniel-rck/${name}.git`,
    },
    bugs: { url: `https://github.com/daniel-rck/${name}/issues` },
    packageManager,
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
      lint: "oxlint && oxfmt --check",
      format: "oxfmt",
      typecheck: "tsc -b --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
      "worker:dev": "wrangler dev",
      "worker:deploy": "wrangler deploy",
    },
  };
}

/** The placeholder scaffold files carry for the app name (wrangler.toml, index.html, …). */
export const APP_NAME_PLACEHOLDER = "<app-name>";

/** Put the app name into the seams `init` just created. */
export async function fillPlaceholders(
  targetDir: string,
  files: string[],
  name: string,
): Promise<void> {
  for (const file of files) {
    const path = resolve(targetDir, file);
    const text = await readFile(path, "utf8");
    if (text.includes(APP_NAME_PLACEHOLDER)) {
      await writeFile(path, text.replaceAll(APP_NAME_PLACEHOLDER, name), "utf8");
    }
  }
}
