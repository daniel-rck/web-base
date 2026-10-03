import { resolve } from "pathe";
import { compareTemplateFile, type FileComparison } from "./files/compare.ts";
import { writeTemplateFile } from "./files/copy.ts";
import { templateDir } from "./manifest/load.ts";
import { filePolicy, type TemplateFileSpec, type TemplateManifest } from "./manifest/types.ts";
import { resolveInside } from "./paths.ts";

/**
 * - identical: nothing to do
 * - apply: owned, differs or missing — `--apply` writes the template source
 * - scaffold-left: a per-app seam that differs; reported, never written
 * - unmanaged-skip: listed in `webBase.unmanaged`; the app maintains it
 * - not-adopted: an owned file of a block the app never took up (see planUpdate)
 */
export type UpdateAction =
  | "identical"
  | "apply"
  | "scaffold-left"
  | "unmanaged-skip"
  | "not-adopted";

export type UpdateEntry = {
  template: string;
  spec: TemplateFileSpec;
  action: UpdateAction;
  comparison: FileComparison;
};

function initialAction(
  spec: TemplateFileSpec,
  comparison: FileComparison,
  unmanaged: ReadonlySet<string>,
): UpdateAction {
  if (unmanaged.has(spec.to)) return "unmanaged-skip";
  if (comparison.status === "identical") return "identical";
  if (filePolicy(spec) === "scaffold") return "scaffold-left";
  return "apply";
}

/**
 * Decide what `update` does with every file of the chain. Expanding a
 * meta-template (`update core`) never adopts a block: if not one owned file
 * of a block is present, its missing files stay missing — otherwise the
 * command notify-apps sends every app would push layout and storage into
 * HamsterFlight. Naming the block itself (`update layout`) adopts it.
 */
export async function planUpdate(options: {
  targetDir: string;
  requested: string;
  chain: TemplateManifest[];
  unmanaged: ReadonlySet<string>;
  withEdits?: boolean;
}): Promise<UpdateEntry[]> {
  const { targetDir, chain, unmanaged } = options;
  const namedLeaf = chain.length === 1 && chain[0]?.name === options.requested;
  const entries: UpdateEntry[] = [];
  for (const manifest of chain) {
    const block: UpdateEntry[] = [];
    for (const spec of manifest.files ?? []) {
      const comparison = await compareTemplateFile(spec, {
        targetDir,
        template: manifest.name,
        withEdits: options.withEdits,
      });
      block.push({
        template: manifest.name,
        spec,
        comparison,
        action: initialAction(spec, comparison, unmanaged),
      });
    }
    const adopted = block.some(
      (e) => filePolicy(e.spec) === "owned" && e.comparison.status !== "missing",
    );
    if (!namedLeaf && !adopted) {
      for (const entry of block) if (entry.action === "apply") entry.action = "not-adopted";
    }
    entries.push(...block);
  }
  return entries;
}

/** Write every `apply` entry's template source over the local file. */
export async function applyUpdate(targetDir: string, entries: UpdateEntry[]): Promise<string[]> {
  const written: string[] = [];
  for (const entry of entries) {
    if (entry.action !== "apply") continue;
    const src = resolve(templateDir(entry.template), entry.spec.from);
    await writeTemplateFile(src, resolveInside(targetDir, entry.spec.to), targetDir);
    written.push(entry.spec.to);
  }
  return written;
}
