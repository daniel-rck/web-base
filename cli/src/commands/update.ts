import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { diffTemplateFile, writeTemplateFile } from "../lib/copy.ts";
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
        const result = await diffTemplateFile(spec, { targetDir, template: args.template });
        if (result.status === "missing") {
          consola.warn(`  ${spec.to} — missing`);
          missing++;
          toApply.push(spec);
        } else if (result.status === "identical") {
          consola.info(`  ${spec.to} — identical`);
          identical++;
        } else {
          consola.warn(`  ${spec.to} — differs (+${result.added} / -${result.removed})`);
          differs++;
          toApply.push(spec);
        }
      }

      consola.info(`Summary: ${identical} identical, ${differs} differs, ${missing} missing`);

      if (apply && toApply.length > 0) {
        const srcDir = resolve(templatesDir(), args.template);
        for (const spec of toApply) {
          await writeTemplateFile(resolve(srcDir, spec.from), resolve(targetDir, spec.to));
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
