import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { diffTemplateFile, writeTemplateFile } from "../lib/copy.ts";
import { filePolicy, loadManifest, templatesDir } from "../lib/manifest.ts";
import { readWebBaseVersion, stampWebBaseVersion } from "../lib/pkg.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";

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

      const stamped = await readWebBaseVersion(targetDir);
      let atCurrent = false;
      if (!stamped) {
        consola.info(
          `web-base: this app is unstamped (web-base ${WEB_BASE_VERSION}). Run with --apply to start tracking.`,
        );
      } else {
        const cmp = compareVersions(stamped, WEB_BASE_VERSION);
        if (cmp < 0) {
          consola.warn(`web-base: app is behind (${stamped} → ${WEB_BASE_VERSION}).`);
        } else if (cmp > 0) {
          consola.info(`web-base: app is ahead (${stamped} > ${WEB_BASE_VERSION}).`);
        } else {
          atCurrent = true;
          consola.info(`web-base: app is current (${WEB_BASE_VERSION}).`);
        }
      }

      let missing = 0;
      let identical = 0;
      let differs = 0;
      let scaffold = 0;
      const toApply: typeof manifest.files = [];

      for (const spec of manifest.files) {
        const result = await diffTemplateFile(spec, { targetDir, template: args.template });
        const isScaffold = filePolicy(spec) === "scaffold";
        if (result.status === "identical") {
          consola.info(`  ${spec.to} — identical`);
          identical++;
        } else if (isScaffold) {
          // Scaffold files belong to the app: report drift but never overwrite.
          const detail = result.status === "missing" ? "missing" : "differs";
          consola.info(`  ${spec.to} — scaffold, ${detail} (left as-is)`);
          scaffold++;
        } else if (result.status === "missing") {
          consola.warn(`  ${spec.to} — missing`);
          missing++;
          toApply.push(spec);
        } else {
          // An owned file that differs while the app is on the current version
          // means it was hand-edited — flag it, since --apply will revert it.
          const drift = atCurrent ? " [owned file edited locally — will be reverted]" : "";
          consola.warn(`  ${spec.to} — differs (+${result.added} / -${result.removed})${drift}`);
          differs++;
          toApply.push(spec);
        }
      }

      consola.info(
        `Summary: ${identical} identical, ${differs} differs, ${missing} missing, ${scaffold} scaffold left as-is`,
      );

      if (apply) {
        if (toApply.length > 0) {
          const srcDir = resolve(templatesDir(), args.template);
          for (const spec of toApply) {
            await writeTemplateFile(resolve(srcDir, spec.from), resolve(targetDir, spec.to));
            consola.success(`  ${spec.to} — applied`);
          }
        }
        // Stamp even when files were already identical: --apply asserts the app
        // has pulled the current template source.
        await stampWebBaseVersion({ targetDir, version: WEB_BASE_VERSION });
      } else if (toApply.length > 0) {
        consola.info("Run with --apply to overwrite local files with template source.");
      }
    } catch (err) {
      consola.error((err as Error).message);
      process.exitCode = 1;
    }
  },
});
