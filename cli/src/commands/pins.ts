import { consola } from "consola";
import { CliError, EXIT, type ExitCode } from "../exit.ts";
import { applyPins, comparePins, loadPins, type PinReport } from "../lib/pins.ts";
import { loadPackageJson, savePackageJson } from "../lib/pkg/doc.ts";
import { writeOut } from "../lib/text.ts";
import { logSave } from "./apply-log.ts";
import { defineCliCommand } from "./define.ts";
import { cwdArg, jsonArg, resolveTargetDir } from "./shared-args.ts";

function render(report: PinReport): void {
  for (const m of report.mismatches) {
    const where = m.section === "packageManager" ? "packageManager" : `${m.section}.${m.name}`;
    consola.warn(`  ${where}: ${m.actual ?? "(not set)"} → ${m.expected} [${m.kind}]`);
  }
  for (const note of report.notes) consola.info(`  ${note}`);
}

export const pinsCommand = defineCliCommand({
  meta: {
    name: "pins",
    description: "Compare package.json against the fleet's version pins (fails on mismatch)",
  },
  args: {
    ...cwdArg,
    apply: {
      type: "boolean",
      description: "Rewrite mismatched ranges and packageManager to the pins",
    },
    ...jsonArg,
  },
  async run(args): Promise<ExitCode> {
    const json = args.json === true;
    const apply = args.apply === true;
    const targetDir = resolveTargetDir(args.cwd);
    const doc = await loadPackageJson(targetDir);
    if (doc === undefined) throw new CliError(`No package.json in ${targetDir}.`);
    const pins = await loadPins();
    const report = comparePins(doc.data, pins);
    const applied = apply ? applyPins(doc, report) : 0;
    if (apply) await savePackageJson(doc);
    const exitCode = report.mismatches.length > 0 && !apply ? EXIT.failed : EXIT.ok;

    if (json) {
      writeOut(
        JSON.stringify(
          { schemaVersion: 1, command: "pins", ok: exitCode === 0, exitCode, applied, ...report },
          null,
          2,
        ),
      );
      return exitCode;
    }
    render(report);
    if (report.mismatches.length === 0) {
      consola.success(`web-base pins: ${report.matched} pinned entries match.`);
    } else if (apply) {
      logSave("written");
      consola.success(
        `web-base pins: ${applied} entr${applied === 1 ? "y" : "ies"} updated. Run: bun install`,
      );
    } else {
      consola.error(
        `web-base pins: ${report.mismatches.length} entr${report.mismatches.length === 1 ? "y differs" : "ies differ"} from the pin table.`,
      );
      consola.info("Run `web-base pins --apply` to rewrite them, then `bun install`.");
    }
    return exitCode;
  },
});
