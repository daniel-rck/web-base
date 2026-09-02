import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { diffTemplateFile } from "../lib/copy.ts";
import { filePolicy, loadManifest, resolveTemplate } from "../lib/manifest.ts";
import { readWebBaseVersion } from "../lib/pkg.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";

type LeafResult = { matched: string[]; drifted: string[]; missing: string[] };

export const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Verify owned base files match the template source (fails on drift)",
  },
  args: {
    template: { type: "positional", required: false, description: "Template name (default: core)" },
    cwd: { type: "string", description: "Target directory (default: current)" },
    strict: {
      type: "boolean",
      description: "Also fail when a building block has not been adopted at all",
    },
  },
  async run({ args }) {
    const targetDir = resolve(args.cwd ?? process.cwd());
    const template = args.template ?? "core";
    const strict = args.strict === true;

    try {
      const stamped = await readWebBaseVersion(targetDir);
      if (stamped && compareVersions(stamped, WEB_BASE_VERSION) !== 0) {
        consola.warn(
          `web-base: app stamped ${stamped}, checking against ${WEB_BASE_VERSION}. Run \`web-base update\` to align.`,
        );
      }

      const chain = await resolveTemplate(template);
      const byLeaf = new Map<string, LeafResult>();

      for (const leaf of chain) {
        const manifest = await loadManifest(leaf);
        if (!manifest.files?.length) continue;
        const result: LeafResult = { matched: [], drifted: [], missing: [] };
        for (const spec of manifest.files) {
          // Only owned building blocks are guarded; scaffold seams are the app's.
          if (filePolicy(spec) !== "owned") continue;
          const diff = await diffTemplateFile(spec, { targetDir, template: leaf });
          if (diff.status === "missing") result.missing.push(spec.to);
          else if (diff.status === "differs") {
            result.drifted.push(spec.to);
            consola.warn(`  ${spec.to} — drift (+${diff.added} / -${diff.removed})`);
          } else result.matched.push(spec.to);
        }
        byLeaf.set(leaf, result);
      }

      let matched = 0;
      const drifted: string[] = [];
      const unadopted: string[] = [];

      for (const [leaf, r] of byLeaf) {
        matched += r.matched.length;
        drifted.push(...r.drifted);
        if (r.matched.length + r.drifted.length === 0) {
          // Not one owned file of this block is present: the app doesn't use it.
          // HamsterFlight has no layout/storage/router and never will — that is
          // a decision, not drift.
          if (r.missing.length > 0) {
            unadopted.push(leaf);
            consola.info(`  ${leaf} — not adopted (${r.missing.length} owned files absent)`);
          }
          continue;
        }
        // The block *is* adopted, so a missing owned file is a hole in it.
        for (const file of r.missing) {
          drifted.push(file);
          consola.warn(`  ${file} — missing (template "${leaf}" is otherwise adopted)`);
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
      if (matched === 0) {
        consola.error(
          "web-base check: no owned building blocks found. This app is not on the base at all.",
        );
        process.exitCode = 1;
        return;
      }
      if (strict && unadopted.length > 0) {
        consola.error(
          `web-base check: ${unadopted.length} building block(s) not adopted: ${unadopted.join(", ")}. ` +
            "Run `web-base add <template>`, or drop --strict if the app deliberately does without them.",
        );
        process.exitCode = 1;
        return;
      }
      const skipped = unadopted.length > 0 ? ` (${unadopted.join(", ")} not adopted)` : "";
      consola.success(`web-base check: ${matched} owned files match${skipped}.`);
    } catch (err) {
      consola.error((err as Error).message);
      process.exitCode = 1;
    }
  },
});
