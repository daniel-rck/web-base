import { existsSync } from "node:fs";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname } from "pathe";
import { filePolicy, type TemplateFileSpec } from "../manifest/types.ts";
import { compareTemplateFile, filePaths } from "./compare.ts";
import { assertWritableInside } from "./confine.ts";

export type CopyAction =
  | "copied"
  | "would-copy"
  | "overwritten"
  | "would-overwrite"
  | "same"
  | "kept-differs"
  | "kept-scaffold"
  | "unmanaged";

export type CopyOptions = {
  targetDir: string;
  template: string;
  force?: boolean;
  /** Also overwrite scaffold seams. Destroys per-app customization — opt in. */
  forceScaffold?: boolean;
  dryRun?: boolean;
  /** Paths the app took off the base (`webBase.unmanaged`): never overwritten. */
  unmanaged?: ReadonlySet<string>;
};

/**
 * Install one template file. An absent file is always installed; an existing
 * one only with `--force` (owned) or `--force-scaffold` (scaffold), and never
 * when the app listed it in `webBase.unmanaged`.
 */
export async function copyTemplateFile(
  spec: TemplateFileSpec,
  options: CopyOptions,
): Promise<CopyAction> {
  const { force = false, forceScaffold = false, dryRun = false } = options;
  const { src, dst } = filePaths(spec, options);
  if (!existsSync(dst)) {
    if (dryRun) return "would-copy";
    await writeTemplateFile(src, dst, options.targetDir);
    return "copied";
  }
  if (options.unmanaged?.has(spec.to)) return "unmanaged";
  const { status } = await compareTemplateFile(spec, options);
  if (status === "identical") return "same";
  // `--force` re-pulls the centrally-managed blocks. Scaffold seams (schema,
  // routes, accent, handlers, LICENSE) hold per-app work, so they survive it
  // unless `--force-scaffold` is passed explicitly.
  const scaffold = filePolicy(spec) === "scaffold";
  const allowOverwrite = scaffold ? force && forceScaffold : force || spec.overwrite === true;
  if (!allowOverwrite) return scaffold && force ? "kept-scaffold" : "kept-differs";
  if (dryRun) return "would-overwrite";
  await writeTemplateFile(src, dst, options.targetDir);
  return "overwritten";
}

/**
 * Copy `src` to `dst` byte for byte, creating parent directories as needed —
 * after checking that `dst` really lies inside `root` (no symlink on the way).
 */
export async function writeTemplateFile(src: string, dst: string, root: string): Promise<void> {
  await assertWritableInside(root, dst);
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
}
