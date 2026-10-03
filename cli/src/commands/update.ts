import { consola } from "consola";
import { EXIT } from "../exit.ts";
import { formatUnifiedDiff } from "../lib/diff/unified.ts";
import { findObsolete } from "../lib/obsolete.ts";
import { loadPackageJson, savePackageJson } from "../lib/pkg/doc.ts";
import { readWebBase, stampVersion } from "../lib/pkg/webbase.ts";
import { writeOut } from "../lib/text.ts";
import { applyUpdate, planUpdate, type UpdateEntry } from "../lib/update-plan.ts";
import { compareVersions, WEB_BASE_VERSION } from "../version.ts";
import { logSave } from "./apply-log.ts";
import { defineCliCommand } from "./define.ts";
import { cwdArg, diffArg, loadChainOrList, resolveTargetDir } from "./shared-args.ts";

/** Report where the app's stamp stands; returns whether it is at this CLI's version. */
function reportStamp(stamped: string | undefined): boolean {
  if (!stamped) {
    consola.info(
      `web-base: this app is unstamped (web-base ${WEB_BASE_VERSION}). Run with --apply to start tracking.`,
    );
    return false;
  }
  const cmp = compareVersions(stamped, WEB_BASE_VERSION);
  if (cmp < 0) consola.warn(`web-base: app is behind (${stamped} → ${WEB_BASE_VERSION}).`);
  else if (cmp > 0) consola.info(`web-base: app is ahead (${stamped} > ${WEB_BASE_VERSION}).`);
  else consola.info(`web-base: app is current (${WEB_BASE_VERSION}).`);
  return cmp === 0;
}

function logEntry(entry: UpdateEntry, atCurrent: boolean): void {
  const { spec, action, comparison } = entry;
  const counts = `+${comparison.added} / -${comparison.removed}`;
  if (action === "identical") consola.info(`  ${spec.to} — identical`);
  else if (action === "unmanaged-skip")
    consola.info(`  ${spec.to} — unmanaged (webBase.unmanaged), skipped`);
  else if (action === "scaffold-left")
    consola.info(`  ${spec.to} — scaffold, ${comparison.status} (left as-is)`);
  else if (action === "not-adopted")
    consola.info(
      `  ${spec.to} — missing, block not adopted (add it with \`web-base add ${entry.template}\`)`,
    );
  else if (comparison.status === "missing") consola.warn(`  ${spec.to} — missing`);
  else {
    // An owned file that differs while the app is on the current version was
    // hand-edited — flag it, since --apply will revert it.
    const drift = atCurrent ? " [owned file edited locally — will be reverted]" : "";
    consola.warn(`  ${spec.to} — differs (${counts})${drift}`);
  }
}

export const updateCommand = defineCliCommand({
  meta: { name: "update", description: "Diff local files against the template source" },
  args: {
    template: { type: "positional", required: true, description: "Template name" },
    ...cwdArg,
    apply: { type: "boolean", description: "Overwrite owned files with the template source" },
    ...diffArg,
  },
  async run(args) {
    const targetDir = resolveTargetDir(args.cwd);
    const chain = await loadChainOrList(args.template);
    if (!chain.some((m) => m.files?.length)) {
      consola.info(`Template "${args.template}" has no files to update.`);
      return EXIT.ok;
    }
    const pkg = await loadPackageJson(targetDir);
    const { version: stamped, unmanaged } = readWebBase(pkg);
    const atCurrent = reportStamp(stamped);
    const diff = args.diff === true;
    const entries = await planUpdate({
      targetDir,
      requested: args.template,
      chain,
      unmanaged,
      withEdits: diff,
    });

    for (const manifest of chain) {
      const block = entries.filter((e) => e.template === manifest.name);
      if (block.length === 0) continue;
      if (chain.length > 1) consola.info(`${manifest.name}:`);
      for (const entry of block) {
        logEntry(entry, atCurrent);
        // Scaffold diffs too: they are how an app ports an upstream seam change by hand.
        const { edits } = entry.comparison;
        if (diff && edits && (entry.action === "apply" || entry.action === "scaffold-left")) {
          writeOut(formatUnifiedDiff(edits, entry.spec.to));
        }
      }
    }
    const count = (action: UpdateEntry["action"]) =>
      entries.filter((e) => e.action === action).length;
    const pending = entries.filter((e) => e.action === "apply");
    consola.info(
      `Summary: ${count("identical")} identical, ${pending.length} to apply, ` +
        `${count("scaffold-left")} scaffold left as-is, ${count("unmanaged-skip")} unmanaged, ` +
        `${count("not-adopted")} in blocks not adopted`,
    );
    // `update` never deletes: a leftover config may still hold overrides the
    // app has to port first. Name them so the migration gets finished.
    for (const item of findObsolete(targetDir, chain, pkg?.data)) {
      consola.warn(
        `  ${item.name} — obsolete ${item.kind}, superseded by ${item.template}; remove it by hand`,
      );
    }

    if (args.apply !== true) {
      if (pending.length > 0)
        consola.info("Run with --apply to overwrite local files with template source.");
      return EXIT.ok;
    }
    for (const path of await applyUpdate(targetDir, entries))
      consola.success(`  ${path} — applied`);
    if (pkg === undefined) {
      consola.warn("No package.json — webBase.version not stamped.");
      return EXIT.ok;
    }
    // Stamp even when files were already identical: --apply asserts the app
    // has pulled the current template source.
    if (stampVersion(pkg, WEB_BASE_VERSION))
      consola.info(`  package.json — webBase.version → ${WEB_BASE_VERSION}`);
    logSave(await savePackageJson(pkg));
    return EXIT.ok;
  },
});
