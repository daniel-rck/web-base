import { CliError } from "../exit.ts";
import { type CopyAction, copyTemplateFile } from "./files/copy.ts";
import {
  filePolicy,
  patchesPackageJson,
  type TemplateFileSpec,
  type TemplateManifest,
} from "./manifest/types.ts";
import type { PackageJsonDoc } from "./pkg/doc.ts";
import { type PatchChange, patchSections } from "./pkg/patch.ts";

export type ApplyEvent =
  | { type: "template"; name: string }
  | { type: "file"; template: string; spec: TemplateFileSpec; action: CopyAction }
  | { type: "package"; template: string; changes: PatchChange[] };

export type ApplyOptions = {
  targetDir: string;
  chain: TemplateManifest[];
  /** The app's package.json, edited in memory; the caller saves it. */
  pkg: PackageJsonDoc | undefined;
  force?: boolean;
  forceScaffold?: boolean;
  dryRun?: boolean;
  unmanaged?: ReadonlySet<string>;
  onEvent?: (event: ApplyEvent) => void;
};

export type ApplyResult = {
  /** Owned files that exist locally, differ, and were kept (no `--force`). */
  keptOwned: string[];
  postInstall: { template: string; steps: string[] }[];
};

/**
 * Apply a resolved template chain: copy files, patch package.json in memory.
 * Shared by `init` and `add` so the two can't drift apart. Fails before the
 * first write when a template needs package.json and the app has none.
 */
export async function applyTemplates(options: ApplyOptions): Promise<ApplyResult> {
  const { chain, pkg, onEvent } = options;
  const needsPkg = chain.filter(patchesPackageJson).map((m) => m.name);
  if (needsPkg.length > 0 && pkg === undefined) {
    throw new CliError(`No package.json in ${options.targetDir}.`, {
      hint: `${needsPkg.join(", ")} add dependencies or scripts. Run this in the app's root, or create a package.json first.`,
    });
  }
  const result: ApplyResult = { keptOwned: [], postInstall: [] };
  for (const manifest of chain) {
    onEvent?.({ type: "template", name: manifest.name });
    for (const spec of manifest.files ?? []) {
      const action = await copyTemplateFile(spec, { ...options, template: manifest.name });
      if (action === "kept-differs" && filePolicy(spec) === "owned") result.keptOwned.push(spec.to);
      onEvent?.({ type: "file", template: manifest.name, spec, action });
    }
    if (pkg && patchesPackageJson(manifest)) {
      const changes = patchSections(pkg, manifest);
      onEvent?.({ type: "package", template: manifest.name, changes });
    }
    if (manifest.postInstall?.length) {
      result.postInstall.push({ template: manifest.name, steps: manifest.postInstall });
    }
  }
  return result;
}
