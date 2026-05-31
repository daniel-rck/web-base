import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { diffTemplateFile } from "../lib/copy.ts";
import { filePolicy, loadManifest, resolveTemplate } from "../lib/manifest.ts";
import { readWebBaseVersion } from "../lib/pkg.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Verify owned base files match the template source (fails on drift)",
  },
  args: {
    template: { type: "positional", required: false, description: "Template name (default: core)" },
    cwd: { type: "string", description: "Target directory (default: current)" },
  },
  async run({ args }) {
    const targetDir = resolve(args.cwd ?? process.cwd());
    const template = args.template ?? "core";

    try {
      const stamped = await readWebBaseVersion(targetDir);
      if (stamped && compareVersions(stamped, WEB_BASE_VERSION) !== 0) {
        consola.warn(
          `web-base: app stamped ${stamped}, checking against ${WEB_BASE_VERSION}. Run \`web-base update\` to align.`,
        );
      }

      const chain = await resolveTemplate(template);
      let matched = 0;
      let absent = 0;
      const drifted: string[] = [];

      for (const leaf of chain) {
        const manifest = await loadManifest(leaf);
        if (!manifest.files?.length) continue;
        for (const spec of manifest.files) {
          // Only owned building blocks are guarded; scaffold seams are the app's.
          if (filePolicy(spec) !== "owned") continue;
          const result = await diffTemplateFile(spec, { targetDir, template: leaf });
          if (result.status === "missing") {
            // The app simply doesn't use this block — not drift.
            absent++;
          } else if (result.status === "differs") {
            drifted.push(spec.to);
            consola.warn(`  ${spec.to} — drift (+${result.added} / -${result.removed})`);
          } else {
            matched++;
          }
        }
      }

      if (drifted.length > 0) {
        consola.error(
          `web-base check: ${drifted.length} owned file(s) drifted from the base. ` +
            "Run `web-base update <template> --apply` to restore, or promote the change into the template.",
        );
        process.exitCode = 1;
        return;
      }
      consola.success(`web-base check: ${matched} owned files match (${absent} absent, skipped).`);
    } catch (err) {
      consola.error((err as Error).message);
      process.exitCode = 1;
    }
  },
});
