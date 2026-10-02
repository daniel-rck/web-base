import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "pathe";
import { CliError, errorMessage } from "../exit.ts";
import { compareVersions } from "../version.ts";
import { isRecord, type PackageJson, type PackageJsonDoc, type StringMap } from "./pkg/doc.ts";
import { templatesDir } from "./templates-dir.ts";

export type PinTable = {
  packageManager: string;
  dependencies: StringMap;
  devDependencies: StringMap;
};

export type DependencySection = "dependencies" | "devDependencies";

/**
 * - behind / ahead: same operator, older / newer version than the pin
 * - different: another operator or range syntax (`^` vs `~`, `*`, a URL…)
 * - missing: only for `packageManager`, which every app must declare
 */
export type PinMismatch = {
  name: string;
  /** Where the app has it; `packageManager` for the package-manager pin. */
  section: DependencySection | "packageManager";
  expected: string;
  actual: string | undefined;
  kind: "behind" | "ahead" | "different" | "missing";
};

export type PinReport = { matched: number; mismatches: PinMismatch[]; notes: string[] };

function isStringMap(value: unknown): value is StringMap {
  return isRecord(value) && Object.values(value).every((v) => typeof v === "string");
}

export async function loadPins(): Promise<PinTable> {
  const path = resolve(templatesDir(), "pins.json");
  if (!existsSync(path)) throw new CliError(`Pin table not found at ${path}.`);
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, "utf8"));
  } catch (cause) {
    throw new CliError(`Malformed pin table at ${path}: ${errorMessage(cause)}`, { cause });
  }
  if (
    !isRecord(raw) ||
    typeof raw.packageManager !== "string" ||
    !isStringMap(raw.dependencies) ||
    !isStringMap(raw.devDependencies)
  ) {
    throw new CliError(`Invalid pin table at ${path}.`);
  }
  return {
    packageManager: raw.packageManager,
    dependencies: raw.dependencies,
    devDependencies: raw.devDependencies,
  };
}

const RANGE = /^([~^]?)(\d+\.\d+\.\d+)$/;

function classify(expected: string, actual: string): PinMismatch["kind"] {
  const e = RANGE.exec(expected);
  const a = RANGE.exec(actual);
  if (!e || !a || e[1] !== a[1]) return "different";
  return compareVersions(a[2] as string, e[2] as string) < 0 ? "behind" : "ahead";
}

/**
 * Compare an app's package.json against the pin table. Packages the app
 * doesn't use are not failures — the table is a ceiling for the fleet, not a
 * list every app must install. Ranges must match exactly.
 */
export function comparePins(pkg: PackageJson, pins: PinTable): PinReport {
  const report: PinReport = { matched: 0, mismatches: [], notes: [] };
  const sections: DependencySection[] = ["dependencies", "devDependencies"];
  for (const pinned of sections) {
    for (const [name, expected] of Object.entries(pins[pinned])) {
      const section = sections.find((s) => pkg[s]?.[name] !== undefined);
      const actual = section ? pkg[section]?.[name] : undefined;
      if (section === undefined || actual === undefined) continue;
      if (section !== pinned)
        report.notes.push(`${name} is pinned under ${pinned} but listed in ${section}`);
      if (actual === expected) report.matched++;
      else
        report.mismatches.push({
          name,
          section,
          expected,
          actual,
          kind: classify(expected, actual),
        });
    }
  }
  const actual = pkg.packageManager;
  if (actual === pins.packageManager) report.matched++;
  else {
    report.mismatches.push({
      name: "packageManager",
      section: "packageManager",
      expected: pins.packageManager,
      actual,
      kind: actual === undefined ? "missing" : "different",
    });
  }
  return report;
}

/** Rewrite every mismatched range where the app has it (and `packageManager`). Adds nothing else. */
export function applyPins(doc: PackageJsonDoc, report: PinReport): number {
  for (const m of report.mismatches) {
    if (m.section === "packageManager") doc.data.packageManager = m.expected;
    else doc.data[m.section] = { ...doc.data[m.section], [m.name]: m.expected };
  }
  if (report.mismatches.length > 0) doc.dirty.add("content");
  return report.mismatches.length;
}
