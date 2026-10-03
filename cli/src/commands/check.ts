import { consola } from "consola";
import type { ExitCode } from "../exit.ts";
import { collectCheck, judgeCheck } from "../lib/check.ts";
import { loadPackageJson } from "../lib/pkg/doc.ts";
import { writeOut } from "../lib/text.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";
import { checkJson } from "./check-json.ts";
import { renderCheck } from "./check-render.ts";
import { defineCliCommand } from "./define.ts";
import { cwdArg, diffArg, jsonArg, loadChainOrList, resolveTargetDir } from "./shared-args.ts";

/** With --json, stdout is reserved for the document: keep consola to warnings/errors (stderr). */
function quietConsola(): () => void {
  const { level } = consola;
  consola.level = 1;
  return () => {
    consola.level = level;
  };
}

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
    ...diffArg,
    ...jsonArg,
  },
  async run(args): Promise<ExitCode> {
    const json = args.json === true;
    const diff = args.diff === true;
    const strict = args.strict === true;
    const restore = json ? quietConsola() : undefined;
    try {
      const targetDir = resolveTargetDir(args.cwd);
      const template = args.template ?? "core";
      const chain = await loadChainOrList(template);
      const pkg = await loadPackageJson(targetDir);
      const report = await collectCheck({ targetDir, template, chain, pkg, withDiff: diff });
      const verdict = judgeCheck(report, { strict });
      if (json) {
        writeOut(JSON.stringify(checkJson(report, verdict, { strict, diff }), null, 2));
        return verdict.exitCode;
      }
      if (report.stamped && compareVersions(report.stamped, WEB_BASE_VERSION) !== 0) {
        consola.warn(
          `web-base: app stamped ${report.stamped}, checking against ${WEB_BASE_VERSION}. Run \`web-base update\` to align.`,
        );
      }
      renderCheck(report, verdict, { diff });
      return verdict.exitCode;
    } finally {
      restore?.();
    }
  },
});
