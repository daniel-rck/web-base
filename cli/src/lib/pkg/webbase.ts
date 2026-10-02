import { CliError } from "../../exit.ts";
import { normalizeRepoPath, relativePathProblem } from "../paths.ts";
import { isRecord, type PackageJsonDoc } from "./doc.ts";

/** The `webBase` block of an app's package.json, validated. */
export type WebBaseConfig = {
  /** The web-base version the app last pulled, if stamped. */
  version: string | undefined;
  /**
   * Owned files the app deliberately took off the base (`webBase.unmanaged`),
   * normalized to the manifests' `to` form. `check` skips them; `update` and
   * `add --force` never overwrite them.
   */
  unmanaged: Set<string>;
};

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;

export function readWebBase(doc: PackageJsonDoc | undefined): WebBaseConfig {
  const config: WebBaseConfig = { version: undefined, unmanaged: new Set() };
  const block = doc?.data.webBase;
  if (doc === undefined || block === undefined) return config;
  const at = `${doc.path} → webBase`;
  if (!isRecord(block)) throw new CliError(`${at} must be an object.`);
  const { version, unmanaged } = block;
  if (version !== undefined) {
    if (typeof version !== "string" || !VERSION.test(version)) {
      throw new CliError(
        `${at}.version must be a version like "0.6.0", got ${JSON.stringify(version)}.`,
      );
    }
    config.version = version;
  }
  if (unmanaged !== undefined) {
    if (!Array.isArray(unmanaged) || !unmanaged.every((e) => typeof e === "string")) {
      throw new CliError(`${at}.unmanaged must be an array of repo-relative paths.`);
    }
    for (const entry of unmanaged) {
      const path = normalizeRepoPath(entry);
      const problem = relativePathProblem(path);
      if (problem) throw new CliError(`${at}.unmanaged: "${entry}" ${problem}.`);
      config.unmanaged.add(path);
    }
  }
  return config;
}

/**
 * Record which web-base version last wrote files into this app. Additive:
 * other `webBase` fields are preserved. Returns whether anything changed.
 */
export function stampVersion(doc: PackageJsonDoc, version: string): boolean {
  const current = isRecord(doc.data.webBase) ? doc.data.webBase : {};
  if (current.version === version) return false;
  doc.data.webBase = { ...current, version };
  doc.dirty.add("stamp");
  return true;
}
