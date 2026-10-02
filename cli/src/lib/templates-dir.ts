import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "pathe";
import { CliError } from "../exit.ts";

/**
 * The directory holding `<template>/manifest.json`. `WEB_BASE_TEMPLATES_DIR`
 * overrides it (tests point it at fixtures). Otherwise walk up from this module
 * to the first `templates/` that contains `core` — that finds `cli/templates`
 * from the bundle (`cli/dist/index.js`) and from source (`cli/src/lib/…`) alike.
 */
export function templatesDir(): string {
  const override = process.env.WEB_BASE_TEMPLATES_DIR;
  if (override) return override;
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth++) {
    const candidate = resolve(dir, "templates");
    if (existsSync(resolve(candidate, "core", "manifest.json"))) return candidate;
    dir = dirname(dir);
  }
  throw new CliError("Could not locate the web-base templates directory.");
}
