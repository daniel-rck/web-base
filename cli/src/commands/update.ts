import { copyFile, mkdir } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import { dirname, resolve } from "pathe";
import { diffTemplateFile } from "../lib/copy.ts";
import { loadManifest, templatesDir } from "../lib/manifest.ts";

export const updateCommand = defineCommand({
  meta: {
    name: "update",
    description: "Diff local files against the template source",
  },
  args: {
    template: { type: "positional", required: true, description: "Template name" },
    cwd: { type: "string", description: "Target directory (default: current)" },
    apply: { type: "boolean", description: "Overwrite local files with template source" },
  },
  async run({ args }) {
    const targetDir = resolve(args.cwd ?? process.cwd());
    const apply = args.apply === true;

    try {
      const manifest = await loadManifest(args.template);
      if (!manifest.files?.length) {
        consola.info(`Template "${args.template}" has no files to update.`);
        return;
      }

      let missing = 0;
      let identical = 0;
      let differs = 0;
      const toApply: typeof manifest.files = [];

      for (const spec of manifest.files) {
        const status = await diffTemplateFile(spec, { targetDir, template: args.template });
        if (status === "missing") {
          consola.warn(`  ${spec.to} — missing`);
          missing++;
          toApply.push(spec);
        } else if (status === "identical") {
          consola.info(`  ${spec.to} — identical`);
          identical++;
        } else {
          consola.warn(`  ${spec.to} — differs`);
          differs++;
          toApply.push(spec);
        }
      }

      consola.info(`Summary: ${identical} identical, ${differs} differs, ${missing} missing`);

      if (apply && toApply.length > 0) {
        const srcDir = resolve(templatesDir(), args.template);
        for (const spec of toApply) {
          const src = resolve(srcDir, spec.from);
          const dst = resolve(targetDir, spec.to);
          await mkdir(dirname(dst), { recursive: true });
          await copyFile(src, dst);
          consola.success(`  ${spec.to} — applied`);
        }
      } else if (toApply.length > 0) {
        consola.info("Run with --apply to overwrite local files with template source.");
      }
    } catch (err) {
      consola.error((err as Error).message);
      process.exitCode = 1;
    }
  },
});
