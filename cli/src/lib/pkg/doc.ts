import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "pathe";
import { CliError, errorMessage } from "../../exit.ts";
import { assertWritableInside } from "../files/confine.ts";
import { spliceStamp } from "./splice.ts";

export type StringMap = Record<string, string>;

export type PackageJson = {
  dependencies?: StringMap;
  devDependencies?: StringMap;
  scripts?: StringMap;
  packageManager?: string;
  webBase?: unknown;
  [key: string]: unknown;
};

/** How the file is laid out, so a rewrite keeps it: indentation, EOL, final newline. */
export type PackageJsonStyle = { indent: string; eol: "\n" | "\r\n"; finalNewline: boolean };

/**
 * An app's package.json, loaded once per command, edited in memory and saved
 * once at the end — so a run that fails half-way never leaves it half-patched.
 */
export type PackageJsonDoc = {
  path: string;
  /** Text as read from disk; `undefined` for a document created in memory. */
  raw: string | undefined;
  data: PackageJson;
  style: PackageJsonStyle;
  /** "stamp" alone is spliced into `raw`; "content" re-serializes the file. */
  dirty: Set<"stamp" | "content">;
};

const DEFAULT_STYLE: PackageJsonStyle = { indent: "  ", eol: "\n", finalNewline: true };
const STRING_SECTIONS = ["dependencies", "devDependencies", "scripts"] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function detectStyle(raw: string): PackageJsonStyle {
  return {
    indent: /\n([ \t]+)\S/.exec(raw)?.[1] ?? DEFAULT_STYLE.indent,
    eol: raw.includes("\r\n") ? "\r\n" : "\n",
    finalNewline: raw.endsWith("\n"),
  };
}

export function serialize(data: PackageJson, style: PackageJsonStyle): string {
  const text = JSON.stringify(data, null, style.indent).replaceAll("\n", style.eol);
  return style.finalNewline ? `${text}${style.eol}` : text;
}

/**
 * Read `<targetDir>/package.json`, or `undefined` if there is none. A file that
 * exists but can't be trusted is an error, never "empty": silently treating it
 * as unstamped would make `check` ignore `webBase.unmanaged` without a hint.
 */
export async function loadPackageJson(targetDir: string): Promise<PackageJsonDoc | undefined> {
  const path = resolve(targetDir, "package.json");
  if (!existsSync(path)) return undefined;
  const raw = await readFile(path, "utf8");
  let data: unknown;
  try {
    data = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (cause) {
    throw new CliError(`Malformed package.json at ${path}: ${errorMessage(cause)}`, { cause });
  }
  if (!isRecord(data)) throw new CliError(`Malformed package.json at ${path}: not a JSON object.`);
  for (const section of STRING_SECTIONS) {
    const value = data[section];
    if (value === undefined) continue;
    if (!isRecord(value) || Object.values(value).some((v) => typeof v !== "string")) {
      throw new CliError(
        `Malformed package.json at ${path}: "${section}" must map names to strings.`,
      );
    }
  }
  return { path, raw, data: data as PackageJson, style: detectStyle(raw), dirty: new Set() };
}

/** A package.json that doesn't exist on disk yet (`init`). */
export function createPackageJson(targetDir: string, data: PackageJson): PackageJsonDoc {
  return {
    path: resolve(targetDir, "package.json"),
    raw: undefined,
    data,
    style: DEFAULT_STYLE,
    dirty: new Set(["content"]),
  };
}

export type SaveResult = "unchanged" | "written" | "reformatted" | "would-write";

/**
 * Write the document back if anything changed. A stamp-only change is spliced
 * into the original text: a JSON round-trip would reflow every inline array and
 * bury an app's first stamp under a reformat of its whole package.json.
 */
export async function savePackageJson(
  doc: PackageJsonDoc,
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<SaveResult> {
  if (doc.dirty.size === 0) return "unchanged";
  if (dryRun) return "would-write";
  let text: string | undefined;
  let reformatted = false;
  if (!doc.dirty.has("content") && doc.raw !== undefined) {
    const version = isRecord(doc.data.webBase) ? doc.data.webBase.version : undefined;
    text = typeof version === "string" ? spliceStamp(doc.raw, version, doc.style) : undefined;
    reformatted = text === undefined;
  }
  text ??= serialize(doc.data, doc.style);
  await assertWritableInside(dirname(doc.path), doc.path);
  await writeFile(doc.path, text, "utf8");
  doc.raw = text;
  doc.dirty.clear();
  return reformatted ? "reformatted" : "written";
}
