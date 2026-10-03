import { consola } from "consola";
import type { ApplyEvent, ApplyResult } from "../lib/apply.ts";
import type { CopyAction } from "../lib/files/copy.ts";
import type { SaveResult } from "../lib/pkg/doc.ts";

const FILE_MESSAGES: Record<CopyAction, [level: "success" | "info" | "warn", text: string]> = {
  copied: ["success", ""],
  "would-copy": ["info", " — would copy"],
  overwritten: ["success", " — overwritten"],
  "would-overwrite": ["info", " — would overwrite"],
  same: ["info", " — exists (same), skipped"],
  "kept-differs": ["warn", " — exists (differs), skipped"],
  "kept-scaffold": ["warn", " — exists (differs), scaffold kept (use --force-scaffold)"],
  unmanaged: ["info", " — unmanaged (webBase.unmanaged), left as-is"],
};

export function logApplyEvent(event: ApplyEvent): void {
  if (event.type === "template") {
    consola.start(`Applying ${event.name}`);
  } else if (event.type === "file") {
    const [level, text] = FILE_MESSAGES[event.action];
    consola[level](`  ${event.spec.to}${text}`);
  } else if (event.changes.length === 0) {
    consola.info("  package.json — already up to date");
  } else {
    for (const { section, name, from, to } of event.changes) {
      consola.info(`  ${section}.${name} → ${to}${from === undefined ? "" : ` (was ${from})`}`);
    }
  }
}

export function logSave(result: SaveResult): void {
  if (result === "written") consola.success("  package.json — saved");
  else if (result === "would-write") consola.info("  package.json — would write");
  else if (result === "reformatted") {
    consola.warn("  package.json — reformatted (could not splice the stamp in place)");
  }
}

export function printNextSteps(steps: string[]): void {
  const unique = [...new Set(steps)];
  if (unique.length === 0) return;
  consola.box(["Next steps:", ...unique.map((s) => `  - ${s}`)].join("\n"));
}

export function postInstallSteps(result: ApplyResult): string[] {
  return result.postInstall.flatMap((p) => p.steps);
}
