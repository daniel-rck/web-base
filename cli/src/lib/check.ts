import type { Edit } from "./diff/lines.ts";
import { compareTemplateFile } from "./files/compare.ts";
import { filePolicy, type TemplateManifest } from "./manifest/types.ts";
import { findObsolete, type ObsoleteFinding } from "./obsolete.ts";
import type { PackageJsonDoc } from "./pkg/doc.ts";
import { readWebBase } from "./pkg/webbase.ts";

export type OwnedFileStatus = "identical" | "differs" | "missing" | "unmanaged";

export type FileCheck = {
  path: string;
  status: OwnedFileStatus;
  added: number;
  removed: number;
  edits?: Edit[];
};

/**
 * How far an app took up one building block, judged on its owned files:
 * all present, some, none — or the block has nothing to guard (only scaffold
 * seams, or every owned file is `webBase.unmanaged`).
 */
export type Adoption = "full" | "partial" | "none" | "nothing-owned";

export type BlockCheck = { template: string; adoption: Adoption; files: FileCheck[] };

export type CheckReport = {
  template: string;
  stamped: string | undefined;
  blocks: BlockCheck[];
  obsolete: ObsoleteFinding[];
};

export function adoptionOf(files: FileCheck[]): Adoption {
  const managed = files.filter((f) => f.status !== "unmanaged");
  if (managed.length === 0) return "nothing-owned";
  const present = managed.filter((f) => f.status !== "missing").length;
  if (present === 0) return "none";
  return present < managed.length ? "partial" : "full";
}

/** Compare every owned file of the chain against the app. Logs nothing. */
export async function collectCheck(options: {
  targetDir: string;
  template: string;
  chain: TemplateManifest[];
  pkg: PackageJsonDoc | undefined;
  withDiff?: boolean;
}): Promise<CheckReport> {
  const { targetDir, chain, pkg } = options;
  const { version, unmanaged } = readWebBase(pkg);
  const blocks: BlockCheck[] = [];
  for (const manifest of chain) {
    const files: FileCheck[] = [];
    for (const spec of manifest.files ?? []) {
      // Only owned building blocks are guarded; scaffold seams are the app's.
      if (filePolicy(spec) !== "owned") continue;
      if (unmanaged.has(spec.to)) {
        files.push({ path: spec.to, status: "unmanaged", added: 0, removed: 0 });
        continue;
      }
      const result = await compareTemplateFile(spec, {
        targetDir,
        template: manifest.name,
        withEdits: options.withDiff,
      });
      files.push({ path: spec.to, ...result });
    }
    blocks.push({ template: manifest.name, adoption: adoptionOf(files), files });
  }
  return {
    template: options.template,
    stamped: version,
    blocks,
    obsolete: findObsolete(targetDir, chain, pkg?.data),
  };
}

export type CheckVerdict = { exitCode: 0 | 1; failures: string[] };

/**
 * Drift always fails. So does an app that has adopted *nothing* guardable — but
 * a chain with nothing to guard (`check router`: scaffold seams only) passes.
 * `--strict` also fails on unadopted blocks, partial adoption and leftovers.
 */
export function judgeCheck(report: CheckReport, { strict }: { strict: boolean }): CheckVerdict {
  const files = report.blocks.flatMap((b) => b.files);
  const failures: string[] = [];
  const drifted = files.filter((f) => f.status === "differs").length;
  if (drifted > 0) failures.push(`${drifted} owned file(s) drifted from the base`);
  const guardable = report.blocks.filter((b) => b.adoption !== "nothing-owned");
  if (guardable.length > 0 && guardable.every((b) => b.adoption === "none")) {
    failures.push("no owned building blocks found — this app is not on the base at all");
  }
  if (strict) {
    const unadopted = guardable.filter((b) => b.adoption === "none").length;
    const absent = report.blocks
      .filter((b) => b.adoption === "partial")
      .flatMap((b) => b.files)
      .filter((f) => f.status === "missing").length;
    if (unadopted > 0) failures.push(`${unadopted} block(s) not adopted`);
    if (absent > 0) failures.push(`${absent} owned file(s) absent`);
    if (report.obsolete.length > 0) {
      failures.push(`${report.obsolete.length} obsolete leftover(s)`);
    }
  }
  return { exitCode: failures.length > 0 ? 1 : 0, failures };
}

export function summarize(report: CheckReport): Record<OwnedFileStatus, number> {
  const summary = { identical: 0, differs: 0, missing: 0, unmanaged: 0 };
  for (const file of report.blocks.flatMap((b) => b.files)) summary[file.status]++;
  return summary;
}
