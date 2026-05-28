import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { consola } from "consola";
import { dirname, resolve } from "pathe";
import { type TemplateFileSpec, templatesDir } from "./manifest.ts";

export type CopyOptions = {
  targetDir: string;
  template: string;
  force?: boolean;
  dryRun?: boolean;
};

export type DiffResult = {
  status: "missing" | "identical" | "differs";
  added: number;
  removed: number;
};

export async function copyTemplateFiles(
  files: TemplateFileSpec[],
  options: CopyOptions,
): Promise<void> {
  const { targetDir, template, force = false, dryRun = false } = options;
  const srcDir = resolve(templatesDir(), template);
  for (const spec of files) {
    const src = resolve(srcDir, spec.from);
    const dst = resolve(targetDir, spec.to);
    if (!existsSync(src)) {
      throw new Error(`Template file not found: ${template}/${spec.from}`);
    }
    const allowOverwrite = force || spec.overwrite === true;
    if (existsSync(dst) && !allowOverwrite) {
      const same = await filesEqual(src, dst);
      if (same) {
        consola.info(`  ${spec.to} — exists (same), skipped`);
      } else {
        consola.warn(`  ${spec.to} — exists (differs), skipped`);
      }
      continue;
    }
    if (dryRun) {
      consola.info(`  ${spec.to} — would copy`);
      continue;
    }
    await writeTemplateFile(src, dst);
    consola.success(`  ${spec.to}`);
  }
}

export async function diffTemplateFile(
  spec: TemplateFileSpec,
  options: { targetDir: string; template: string },
): Promise<DiffResult> {
  const src = resolve(templatesDir(), options.template, spec.from);
  const dst = resolve(options.targetDir, spec.to);
  if (!existsSync(src)) {
    throw new Error(`Template file not found: ${options.template}/${spec.from}`);
  }
  if (!existsSync(dst)) return { status: "missing", added: 0, removed: 0 };
  const [srcBuf, dstBuf] = await Promise.all([readFile(src), readFile(dst)]);
  if (srcBuf.equals(dstBuf)) return { status: "identical", added: 0, removed: 0 };
  // Template source is canonical; report how applying it would change the local
  // file: lines added (in source, not local) and removed (in local, not source).
  const { added, removed } = lineDiff(dstBuf.toString("utf8"), srcBuf.toString("utf8"));
  return { status: "differs", added, removed };
}

/** Copy `src` to `dst`, creating parent directories as needed. */
export async function writeTemplateFile(src: string, dst: string): Promise<void> {
  await mkdir(dirname(dst), { recursive: true });
  await copyFile(src, dst);
}

async function filesEqual(a: string, b: string): Promise<boolean> {
  const [bufA, bufB] = await Promise.all([readFile(a), readFile(b)]);
  return bufA.equals(bufB);
}

/**
 * Count added/removed lines between `before` and `after` via the classic
 * longest-common-subsequence diff. Template files are small, so the quadratic
 * table is fine. Uses a rolling 1D row to keep memory O(m).
 */
function lineDiff(before: string, after: string): { added: number; removed: number } {
  const a = before.split("\n");
  const b = after.split("\n");
  const m = b.length;
  // prev[j] = length of LCS of a[i+1:] and b[j:]; built bottom-up.
  let prev = new Array<number>(m + 1).fill(0);
  for (let i = a.length - 1; i >= 0; i--) {
    const curr = new Array<number>(m + 1).fill(0);
    for (let j = m - 1; j >= 0; j--) {
      curr[j] = a[i] === b[j] ? (prev[j + 1] ?? 0) + 1 : Math.max(prev[j] ?? 0, curr[j + 1] ?? 0);
    }
    prev = curr;
  }
  const common = prev[0] ?? 0;
  return { added: b.length - common, removed: a.length - common };
}
