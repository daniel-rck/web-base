import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { consola } from "consola";
import { resolve } from "pathe";
import { CliError, EXIT } from "../exit.ts";
import { applyTemplates } from "../lib/apply.ts";
import { gitInit, gitWorkTreeState } from "../lib/git.ts";
import { loadPins } from "../lib/pins.ts";
import { createPackageJson, savePackageJson } from "../lib/pkg/doc.ts";
import { stampVersion } from "../lib/pkg/webbase.ts";
import { WEB_BASE_VERSION } from "../version.ts";
import { logApplyEvent, logSave, postInstallSteps, printNextSteps } from "./apply-log.ts";
import { defineCliCommand } from "./define.ts";
import { renderPackageJson, validateAppName } from "./init-package.ts";
import {
  cwdArg,
  dryRunArg,
  forceArgs,
  forceFlags,
  loadChainOrList,
  resolveTargetDir,
} from "./shared-args.ts";

/** The template `init` applies to a fresh directory. */
const INIT_TEMPLATE = "core";

async function askName(given: string | undefined): Promise<string> {
  if (given !== undefined) return validateAppName(given);
  // Only prompt when a human is there to answer: in CI (or any non-TTY
  // pipeline) a blocking prompt hangs the job until it times out.
  if (process.stdin.isTTY !== true) {
    throw new CliError("App name is required.", { hint: "Pass --name <app-name>." });
  }
  const answer = await consola.prompt("App name?", { type: "text", placeholder: "my-app" });
  if (typeof answer !== "string") throw new CliError("App name is required.");
  return validateAppName(answer);
}

/**
 * oxlint and oxfmt skip what .gitignore lists, and the drift guard and CI
 * assume a Git repo — so scaffold one, unless the directory already sits
 * inside a work tree (a monorepo must not get a nested `.git`).
 */
function ensureGitRepo(targetDir: string, dryRun: boolean): boolean {
  const state = gitWorkTreeState(targetDir);
  if (state === "inside") return true;
  if (state === "no-git") {
    consola.warn("  git not found — initialize the repo by hand (oxlint/oxfmt and CI assume one).");
    return false;
  }
  if (dryRun) {
    consola.info("  .git — would initialize");
    return true;
  }
  if (gitInit(targetDir)) {
    consola.success("  .git — initialized");
    return true;
  }
  consola.warn("  git init failed — initialize the repo by hand (oxlint/oxfmt and CI assume one).");
  return false;
}

export const initCommand = defineCliCommand({
  meta: { name: "init", description: "Scaffold a new app into an empty directory" },
  args: {
    ...cwdArg,
    name: { type: "string", description: "App name (lowercase, dashes)" },
    ...forceArgs,
    ...dryRunArg,
  },
  async run(args) {
    const targetDir = resolveTargetDir(args.cwd, { mustExist: false });
    const { force, forceScaffold } = forceFlags(args);
    const dryRun = args["dry-run"] === true;
    // Never even with --force: rewriting an existing package.json would delete
    // every dependency and script the app has.
    if (existsSync(resolve(targetDir, "package.json"))) {
      throw new CliError("A package.json already exists in the target directory.", {
        hint: "Use `web-base add core` to bring an existing app onto the base.",
      });
    }
    const name = await askName(args.name);
    const chain = await loadChainOrList(INIT_TEMPLATE);

    if (!existsSync(targetDir)) {
      if (dryRun) consola.info(`  ${targetDir} — would create`);
      else await mkdir(targetDir, { recursive: true });
    }
    const { packageManager } = await loadPins();
    const pkg = createPackageJson(targetDir, renderPackageJson(name, packageManager));
    const result = await applyTemplates({
      targetDir,
      chain,
      pkg,
      force,
      forceScaffold,
      dryRun,
      onEvent: logApplyEvent,
    });
    stampVersion(pkg, WEB_BASE_VERSION);
    logSave(await savePackageJson(pkg, { dryRun }));
    const repo = ensureGitRepo(targetDir, dryRun);

    printNextSteps([
      ...postInstallSteps(result),
      "Fill in the domain content under src/features/",
      "Run: bun install",
      repo
        ? "Commit the scaffold: git add -A && git commit -m 'chore: initial scaffold'"
        : "Initialize Git: git init && git add -A && git commit -m 'chore: initial scaffold'",
    ]);
    return EXIT.ok;
  },
});
