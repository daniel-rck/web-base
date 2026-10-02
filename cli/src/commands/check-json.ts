import type { CheckReport, CheckVerdict } from "../lib/check.ts";
import { summarize } from "../lib/check.ts";
import { formatUnifiedDiff } from "../lib/diff/unified.ts";
import { WEB_BASE_VERSION } from "../version.ts";

/**
 * `check --json` (schemaVersion 1) — the contract CI consumes. Only stdout
 * carries it; warnings and errors go to stderr. Documented in 02-cli.md.
 */
export function checkJson(
  report: CheckReport,
  verdict: CheckVerdict,
  options: { strict: boolean; diff: boolean },
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    command: "check",
    template: report.template,
    webBaseVersion: WEB_BASE_VERSION,
    stamped: report.stamped ?? null,
    strict: options.strict,
    ok: verdict.exitCode === 0,
    exitCode: verdict.exitCode,
    failures: verdict.failures,
    summary: summarize(report),
    blocks: report.blocks.map((block) => ({
      template: block.template,
      adoption: block.adoption,
      files: block.files.map(({ path, status, added, removed, edits }) => ({
        path,
        status,
        added,
        removed,
        ...(options.diff && edits ? { diff: formatUnifiedDiff(edits, path) } : {}),
      })),
    })),
    obsolete: report.obsolete,
  };
}
