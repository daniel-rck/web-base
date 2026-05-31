import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { copyTemplateFiles } from "../lib/copy.ts";
import { loadManifest, resolveTemplate } from "../lib/manifest.ts";
import { patchPackageJson, stampWebBaseVersion } from "../lib/pkg.ts";
import { WEB_BASE_VERSION } from "../version.ts";

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Scaffold a new app from an empty directory",
  },
  args: {
    cwd: { type: "string", description: "Target directory (default: current)" },
    name: { type: "string", description: "App name" },
    force: { type: "boolean", description: "Overwrite existing files" },
    "dry-run": { type: "boolean", description: "Log actions without writing" },
  },
  async run({ args }) {
    const targetDir = resolve(args.cwd ?? process.cwd());
    const force = args.force === true;
    const dryRun = args["dry-run"] === true;

    try {
      if (existsSync(resolve(targetDir, "package.json")) && !force) {
        consola.error(
          "A package.json already exists in the target directory. Use `web-base add core` to migrate an existing app, or pass --force to overwrite.",
        );
        process.exitCode = 1;
        return;
      }

      const name =
        args.name ?? (await consola.prompt("App name?", { type: "text", placeholder: "my-app" }));
      if (typeof name !== "string" || !name.trim()) {
        consola.error("App name is required.");
        process.exitCode = 1;
        return;
      }

      const pkg = renderPackageJson(name.trim());
      if (dryRun) {
        consola.info(`  package.json — would write (name: ${name})`);
      } else {
        await writeFile(resolve(targetDir, "package.json"), `${pkg}\n`, "utf8");
        consola.success(`  package.json — written (name: ${name})`);
      }

      const chain = await resolveTemplate("core");
      const postInstall: string[] = [];
      for (const leaf of chain) {
        const manifest = await loadManifest(leaf);
        consola.start(`Applying ${manifest.name}`);
        if (manifest.files?.length) {
          await copyTemplateFiles(manifest.files, {
            targetDir,
            template: manifest.name,
            force,
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
        if (manifest.postInstall?.length) postInstall.push(...manifest.postInstall);
      }

      await stampWebBaseVersion({ targetDir, version: WEB_BASE_VERSION, dryRun });

      const nextSteps = [
        ...postInstall,
        "Run: bun install",
        "Initialize Git: git init && git add -A && git commit -m 'chore: initial scaffold'",
      ];
      consola.box(["Next steps:", ...nextSteps.map((s) => `  - ${s}`)].join("\n"));
    } catch (err) {
      consola.error((err as Error).message);
      process.exitCode = 1;
    }
  },
});

function renderPackageJson(name: string): string {
  const pkg = {
    name,
    private: true,
    version: "0.0.0",
    type: "module",
    description: "",
    keywords: ["pwa", "privacy", "offline", "react", "vite", "typescript"],
    author: "",
    license: "MIT",
    homepage: `https://${name}.daniel-rck.workers.dev`,
    repository: {
      type: "git",
      url: `https://github.com/daniel-rck/${name}.git`,
    },
    bugs: { url: `https://github.com/daniel-rck/${name}/issues` },
    packageManager: "bun@1.3.11",
    scripts: {
      dev: "vite",
      build: "tsc -b && vite build",
      preview: "vite preview",
      lint: "biome check .",
      format: "biome format --write .",
      typecheck: "tsc -b --noEmit",
      test: "vitest run",
      "test:watch": "vitest",
      "worker:dev": "wrangler dev",
      "worker:deploy": "wrangler deploy",
    },
  };
  return JSON.stringify(pkg, null, 2);
}
