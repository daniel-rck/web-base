import { lstat, realpath } from "node:fs/promises";
import { dirname, join, relative } from "pathe";
import { CliError } from "../../exit.ts";
import { isInside } from "../paths.ts";

/**
 * `path` with every symlink resolved: the real path of its nearest existing
 * ancestor, plus the part that doesn't exist yet.
 */
async function realish(path: string): Promise<string> {
  let existing = path;
  for (;;) {
    try {
      return join(await realpath(existing), relative(existing, path));
    } catch (error) {
      const parent = dirname(existing);
      if (parent === existing || (error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      existing = parent;
    }
  }
}

/**
 * Refuse to write `abs` unless it really lies inside `root`. resolveInside()
 * is lexical, so a symlink in the app (`src/lib -> ~/elsewhere`) or a symlink
 * as the destination itself would still send the write out of the app: the
 * destination must not be a symlink (dangling ones included), and its parent,
 * symlinks resolved, must lie inside `root`, symlinks resolved.
 */
export async function assertWritableInside(root: string, abs: string): Promise<void> {
  const stat = await lstat(abs).catch(() => null);
  if (stat?.isSymbolicLink()) {
    throw new CliError(`Refusing to write ${relative(root, abs)}: it is a symlink.`, {
      hint: "web-base never writes through a symlink; replace it with a regular file.",
    });
  }
  const [realRoot, realParent] = await Promise.all([realish(root), realish(dirname(abs))]);
  if (!isInside(realRoot, realParent)) {
    throw new CliError(
      `Refusing to write ${relative(root, abs)}: a symlink leads outside ${root} (to ${realParent}).`,
      { hint: "web-base only writes inside the app; replace the symlinked directory." },
    );
  }
}
