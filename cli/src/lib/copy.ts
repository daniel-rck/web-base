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

export type CopyResult = "copied" | "skipped-same" | "skipped-differs" | "would-copy";

export async function copyTemplateFiles(
  files: TemplateFileSpec[],
  options: CopyOptions,
): Promise<void> {
  const { targetDir, template, force = false, dryRun = false } = options;
  const srcDir = resolve(templatesDir(), template);
  for (const spec of files) {
    const src = resolve(srcDir, spec.from);
    const dst = resolve(targetDir, spec.to);
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
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(src, dst);
    consola.success(`  ${spec.to}`);
  }
}

export async function diffTemplateFile(
  spec: TemplateFileSpec,
  options: { targetDir: string; template: string },
): Promise<"missing" | "identical" | "differs"> {
  const src = resolve(templatesDir(), options.template, spec.from);
  const dst = resolve(options.targetDir, spec.to);
  if (!existsSync(dst)) return "missing";
  const same = await filesEqual(src, dst);
  return same ? "identical" : "differs";
}

async function filesEqual(a: string, b: string): Promise<boolean> {
  const [bufA, bufB] = await Promise.all([readFile(a), readFile(b)]);
  return bufA.equals(bufB);
}
