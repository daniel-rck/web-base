import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { CliError } from "../../exit.ts";
import { countChanges, diffLines, type Edit } from "../diff/lines.ts";
import { templateDir } from "../manifest/load.ts";
import type { TemplateFileSpec } from "../manifest/types.ts";
import { resolveInside } from "../paths.ts";
import { normalizeEol } from "../text.ts";

export type FileStatus = "missing" | "identical" | "differs";

export type FileComparison = {
  status: FileStatus;
  /** Lines `--apply` would add (in the template, not local) / remove (local only). */
  added: number;
  removed: number;
  /** Local → template edits, only when asked for (`--diff`). */
  edits?: Edit[];
};

export type CompareOptions = { targetDir: string; template: string; withEdits?: boolean };

/** Absolute source and destination of a manifest entry, both containment-checked. */
export function filePaths(
  spec: TemplateFileSpec,
  options: { targetDir: string; template: string },
): { src: string; dst: string } {
  const src = resolveInside(templateDir(options.template), spec.from);
  const dst = resolveInside(options.targetDir, spec.to);
  if (!existsSync(src))
    throw new CliError(`Template file not found: ${options.template}/${spec.from}`);
  return { src, dst };
}

/**
 * Compare a target file against its template source. Line endings don't count:
 * a Windows checkout with `core.autocrlf` must not read as drift everywhere.
 */
export async function compareTemplateFile(
  spec: TemplateFileSpec,
  options: CompareOptions,
): Promise<FileComparison> {
  const { src, dst } = filePaths(spec, options);
  if (!existsSync(dst)) return { status: "missing", added: 0, removed: 0 };
  const [srcBuf, dstBuf] = await Promise.all([readFile(src), readFile(dst)]);
  if (srcBuf.equals(dstBuf)) return { status: "identical", added: 0, removed: 0 };
  const local = normalizeEol(dstBuf.toString("utf8"));
  const source = normalizeEol(srcBuf.toString("utf8"));
  if (local === source) return { status: "identical", added: 0, removed: 0 };
  const edits = diffLines(local, source);
  return {
    status: "differs",
    ...countChanges(edits),
    ...(options.withEdits ? { edits } : {}),
  };
}
