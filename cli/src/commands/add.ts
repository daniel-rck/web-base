import { existsSync } from "node:fs";
import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { copyTemplateFiles } from "../lib/copy.ts";
import { listTemplates, loadManifest, resolveTemplate } from "../lib/manifest.ts";
import { patchPackageJson, stampWebBaseVersion } from "../lib/pkg.ts";
import { WEB_BASE_VERSION } from "../version.ts";

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Copy a template (or expand a meta-template) into the target repo",
  },
  args: {
    template: { type: "positional", required: false, description: "Template name" },
    cwd: { type: "string", description: "Target directory (default: current)" },
    force: { type: "boolean", description: "Overwrite existing owned files" },
    "force-scaffold": {
      type: "boolean",
      description: "With --force, also overwrite scaffold seams (destroys per-app customization)",
    },
    "dry-run": { type: "boolean", description: "Log actions without writing" },
  },
  async run({ args }) {
    if (!args.template) {
      await printAvailable();
      return;
    }

    const targetDir = resolve(args.cwd ?? process.cwd());
    const force = args.force === true;
    const forceScaffold = args["force-scaffold"] === true;
    const dryRun = args["dry-run"] === true;

    try {
      const chain = await resolveTemplate(args.template);
      const postInstall: string[] = [];

      for (const leaf of chain) {
        const manifest = await loadManifest(leaf);
        consola.start(`Applying ${manifest.name}`);
        if (manifest.files?.length) {
          await copyTemplateFiles(manifest.files, {
            targetDir,
            template: manifest.name,
            force,
            forceScaffold,
            dryRun,
          });
        }
        if (manifest.dependencies || manifest.devDependencies || manifest.scripts) {
          await patchPackageJson({
            targetDir,
            dependencies: manifest.dependencies,
            devDependencies: manifest.devDependencies,
            scripts: manifest.scripts,
            dryRun,
          });
        }
        if (manifest.postInstall?.length) {
          postInstall.push(...manifest.postInstall);
        }
      }

      if (existsSync(resolve(targetDir, "package.json"))) {
        await stampWebBaseVersion({ targetDir, version: WEB_BASE_VERSION, dryRun });
      }

      if (postInstall.length) {
        consola.box(["Next steps:", ...postInstall.map((s) => `  - ${s}`)].join("\n"));
      }
    } catch (err) {
      consola.error((err as Error).message);
      if ((err as { code?: string }).code === "TEMPLATE_NOT_FOUND") {
        await printAvailable();
      }
      process.exitCode = 1;
    }
  },
});

async function printAvailable(): Promise<void> {
  const templates = await listTemplates();
  if (!templates.length) {
    consola.warn("No templates available.");
    return;
  }
  consola.info("Available templates:");
  for (const t of templates) {
    const isMeta = (t.extends?.length ?? 0) > 0 && !t.files?.length;
    const tag = isMeta ? " [meta]" : "";
    consola.log(`  ${t.name}${tag} — ${t.description}`);
  }
}
