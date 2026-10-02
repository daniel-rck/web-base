import { consola } from "consola";
import { EXIT } from "../exit.ts";
import { applyTemplates } from "../lib/apply.ts";
import { loadPackageJson, savePackageJson } from "../lib/pkg/doc.ts";
import { readWebBase, stampVersion } from "../lib/pkg/webbase.ts";
import { WEB_BASE_VERSION } from "../version.ts";
import { logApplyEvent, logSave, postInstallSteps, printNextSteps } from "./apply-log.ts";
import { defineCliCommand } from "./define.ts";
import { printAvailable } from "./list.ts";
import {
  cwdArg,
  dryRunArg,
  forceArgs,
  forceFlags,
  loadChainOrList,
  resolveTargetDir,
} from "./shared-args.ts";

export const addCommand = defineCliCommand({
  meta: {
    name: "add",
    description: "Copy a template (or expand a meta-template) into the target repo",
  },
  args: {
    template: { type: "positional", required: false, description: "Template name (omit to list)" },
    ...cwdArg,
    ...forceArgs,
    ...dryRunArg,
  },
  async run(args) {
    if (!args.template) {
      await printAvailable();
      return EXIT.ok;
    }
    const targetDir = resolveTargetDir(args.cwd);
    const { force, forceScaffold } = forceFlags(args);
    const dryRun = args["dry-run"] === true;

    const chain = await loadChainOrList(args.template);
    const pkg = await loadPackageJson(targetDir);
    const { unmanaged } = readWebBase(pkg);
    const result = await applyTemplates({
      targetDir,
      chain,
      pkg,
      force,
      forceScaffold,
      dryRun,
      unmanaged,
      onEvent: logApplyEvent,
    });

    if (pkg === undefined) {
      consola.info("No package.json — webBase.version not stamped.");
    } else {
      // The stamp claims "this app pulled vX". Owned files that differ and were
      // kept make that untrue, and `update` would then call them local edits.
      if (result.keptOwned.length > 0) {
        consola.warn(
          `webBase.version not stamped: ${result.keptOwned.length} owned file(s) differ from ` +
            `web-base ${WEB_BASE_VERSION} and were kept. Pull them with ` +
            `\`web-base update ${args.template} --apply\` (or re-run with --force).`,
        );
      } else if (stampVersion(pkg, WEB_BASE_VERSION)) {
        consola.info(`  package.json — webBase.version → ${WEB_BASE_VERSION}`);
      }
      logSave(await savePackageJson(pkg, { dryRun }));
    }
    printNextSteps(postInstallSteps(result));
    return EXIT.ok;
  },
});
