import type { PackageJsonStyle } from "./doc.ts";

/**
 * Write `webBase.version` into raw package.json text without reformatting the
 * rest of the file. Returns `undefined` when the shape is unexpected, so the
 * caller can fall back to a full re-serialization.
 */
export function spliceStamp(
  raw: string,
  version: string,
  style: PackageJsonStyle,
): string | undefined {
  // Already stamped: replace just the version literal.
  const stamped = /("webBase"\s*:\s*\{[^{}]*?"version"\s*:\s*")([^"]*)(")/;
  if (stamped.test(raw)) return raw.replace(stamped, `$1${version}$3`);
  // A `webBase` key in some other shape — don't guess, re-serialize instead.
  if (/"webBase"\s*:/.test(raw)) return undefined;
  const end = raw.lastIndexOf("}");
  if (end < 0) return undefined;
  const head = raw.slice(0, end).replace(/\s*$/, "");
  if (!head.endsWith("}") && !head.endsWith('"') && !head.endsWith("]")) return undefined;
  const { indent: i, eol } = style;
  return `${head},${eol}${i}"webBase": {${eol}${i}${i}"version": "${version}"${eol}${i}}${eol}${raw.slice(end)}`;
}
