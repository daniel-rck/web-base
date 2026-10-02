import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname } from "pathe";

export type GitState = "inside" | "outside" | "no-git";

/** The nearest existing ancestor of `dir` (itself if it exists). */
function nearestExisting(dir: string): string {
  let current = dir;
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current);
  return current;
}

/**
 * Whether `dir` is inside a Git work tree — including a subdirectory of an
 * existing repo or monorepo, which must not get a nested `.git`.
 */
export function gitWorkTreeState(dir: string): GitState {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd: nearestExisting(dir),
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  if (result.error) return "no-git";
  return result.status === 0 && result.stdout.trim() === "true" ? "inside" : "outside";
}

export function gitInit(dir: string): boolean {
  const result = spawnSync("git", ["init", "--quiet"], { cwd: dir, stdio: "ignore" });
  return result.status === 0;
}
