import { consola } from "consola";
import type { CheckReport, CheckVerdict } from "../lib/check.ts";

/** Human-readable `check` output; the JSON form lives in check-json.ts. */
export function renderCheck(report: CheckReport, verdict: CheckVerdict): void {
  for (const block of report.blocks) {
    for (const file of block.files) {
      if (file.status === "differs")
        consola.warn(`  ${file.path} — drift (+${file.added} / -${file.removed})`);
    }
    const absent = block.files.filter((f) => f.status === "missing").length;
    if (block.adoption === "none") {
      // Not one owned file of this block is present: the app doesn't use it.
      // HamsterFlight has no layout/storage/router and never will.
      consola.info(`  ${block.template} — not adopted (${absent} owned files absent)`);
    } else if (block.adoption === "partial") {
      // Partial adoption is legitimate, not a hole: Tonspur takes primitives
      // without AppNav. `--strict` decides whether that should fail.
      consola.info(`  ${block.template} — partially adopted (${absent} owned files absent)`);
    }
  }
  for (const item of report.obsolete) {
    consola.warn(`  ${item.name} — obsolete ${item.kind}, superseded by ${item.template}`);
  }
  const unmanaged = report.blocks.flatMap((b) => b.files).filter((f) => f.status === "unmanaged");
  for (const file of unmanaged)
    consola.info(`  ${file.path} — unmanaged (opted out in package.json)`);

  if (verdict.exitCode !== 0) {
    consola.error(`web-base check: ${verdict.failures.join("; ")}.`);
    consola.info(
      "Restore drift with `web-base update <template> --apply` (or promote the change into the template); " +
        "adopt blocks with `web-base add <template>`; remove obsolete leftovers by hand.",
    );
    return;
  }
  if (report.blocks.every((b) => b.adoption === "nothing-owned")) {
    consola.success(
      `web-base check: nothing to guard in ${report.template} (no managed owned files).`,
    );
    return;
  }
  const matched = report.blocks
    .flatMap((b) => b.files)
    .filter((f) => f.status === "identical").length;
  const notes = [
    ...report.blocks.filter((b) => b.adoption === "none").map((b) => `${b.template} not adopted`),
    unmanaged.length > 0 ? `${unmanaged.length} unmanaged` : "",
    report.obsolete.length > 0 ? `${report.obsolete.length} obsolete leftover(s)` : "",
  ].filter(Boolean);
  consola.success(
    `web-base check: ${matched} owned files match${notes.length ? ` (${notes.join("; ")})` : ""}.`,
  );
}
