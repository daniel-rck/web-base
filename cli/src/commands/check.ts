import { consola } from "consola";
import type { ExitCode } from "../exit.ts";
import { collectCheck, judgeCheck } from "../lib/check.ts";
import { loadPackageJson } from "../lib/pkg/doc.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";
import { renderCheck } from "./check-render.ts";
import { defineCliCommand } from "./define.ts";
import { cwdArg, loadChainOrList, resolveTargetDir } from "./shared-args.ts";

export const checkCommand = defineCliCommand({
  meta: {
    name: "check",
    description: "Verify owned base files match the template source (fails on drift)",
  },
  args: {
    template: { type: "positional", required: false, description: "Template name (default: core)" },
    ...cwdArg,
    strict: {
      type: "boolean",
      description:
        "Also fail when a block is not (fully) adopted or a superseded setup is left over",
    },
  },
  async run(args): Promise<ExitCode> {
    const targetDir = resolveTargetDir(args.cwd);
    const template = args.template ?? "core";
    const chain = await loadChainOrList(template);
    const pkg = await loadPackageJson(targetDir);
    const report = await collectCheck({ targetDir, template, chain, pkg });
    if (report.stamped && compareVersions(report.stamped, WEB_BASE_VERSION) !== 0) {
      consola.warn(
        `web-base: app stamped ${report.stamped}, checking against ${WEB_BASE_VERSION}. Run \`web-base update\` to align.`,
      );
    }
    const verdict = judgeCheck(report, { strict: args.strict === true });
    renderCheck(report, verdict);
    return verdict.exitCode;
  },
});
