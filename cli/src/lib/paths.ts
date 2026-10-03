import { isAbsolute, normalize, relative, resolve } from "pathe";
import { CliError } from "../exit.ts";

/**
 * Why `rel` is not a safe, canonical relative path, or `undefined` if it is.
 * Manifest `from`/`to` entries must pass this, so a template can never read or
 * write outside its own directory or the target app.
 */
export function relativePathProblem(rel: string): string | undefined {
  if (rel === "") return "is empty";
  if (rel.includes("\\")) return "uses backslashes";
  if (isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) return "is absolute";
  const norm = normalize(rel);
  if (norm === ".." || norm.startsWith("../")) return "escapes its root";
  if (norm !== rel) return `is not normalized (use "${norm}")`;
  return undefined;
}

/** Whether `abs` is `root` or lies below it — lexically; see files/confine.ts for symlinks. */
export function isInside(root: string, abs: string): boolean {
  const back = relative(root, abs);
  return back !== ".." && !back.startsWith("../") && !isAbsolute(back);
}

/** Resolve `rel` under `root`; throw if the result is `root` itself or outside it. */
export function resolveInside(root: string, rel: string): string {
  const abs = resolve(root, rel);
  if (abs === resolve(root) || !isInside(root, abs)) {
    throw new CliError(`Path "${rel}" is not inside ${root}.`);
  }
  return abs;
}

/** Canonical form of a repo-relative path as an app may write it (`./src\x` → `src/x`). */
export function normalizeRepoPath(path: string): string {
  return normalize(path.replaceAll("\\", "/")).replace(/^\.\//, "");
}
