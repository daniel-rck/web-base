import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "pathe";

/** The repo root (this file lives in cli/src/docs/). */
export const repoRoot = resolve(fileURLToPath(import.meta.url), "../../../..");

export function read(path: string): string {
  return readFileSync(resolve(repoRoot, path), "utf8");
}

export function readJsonFile<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(read(path)) as T;
}

/** The text under a Markdown heading (any level), up to the next heading of the same or a higher level. */
export function section(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex(
    (line) => /^#{1,6} /.test(line) && line.replace(/^#+ /, "") === heading,
  );
  if (start < 0) throw new Error(`No heading "${heading}"`);
  const level = /^#+/.exec(lines[start] as string)?.[0].length ?? 1;
  const end = lines.findIndex(
    (line, i) => i > start && /^#{1,6} /.test(line) && (/^#+/.exec(line)?.[0].length ?? 7) <= level,
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

/** The contents of every fenced block of the given language. */
export function codeBlocks(markdown: string, lang: string): string[] {
  return [...markdown.matchAll(new RegExp("```" + lang + "\\n([\\s\\S]*?)```", "g"))].map(
    (m) => m[1] ?? "",
  );
}

/** The first ```json block under a heading, parsed. */
export function jsonUnder(markdown: string, heading: string): unknown {
  const [block] = codeBlocks(section(markdown, heading), "json");
  if (block === undefined) throw new Error(`No json block under "${heading}"`);
  return JSON.parse(block);
}
