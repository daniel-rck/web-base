/**
 * Whether a template file is a base building block or an app starting point.
 * - "owned": part of the shared base. The app should not hand-edit it;
 *   `update --apply` overwrites it so upstream fixes flow in cleanly.
 * - "scaffold": a per-app seam (schema, routes, accent, handlers). Copied once
 *   as a starting point; `update` reports drift but never overwrites it.
 */
export type FilePolicy = "owned" | "scaffold";

export type TemplateFileSpec = {
  from: string;
  to: string;
  overwrite?: boolean;
  policy?: FilePolicy;
};

/** A file's effective policy. Files are owned (centrally managed) by default. */
export function filePolicy(spec: TemplateFileSpec): FilePolicy {
  return spec.policy ?? "owned";
}

export type TemplateManifest = {
  name: string;
  description: string;
  extends?: string[];
  files?: TemplateFileSpec[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  postInstall?: string[];
  obsolete?: ObsoleteSpec;
};

/**
 * What a template superseded (e.g. `oxc` replaced Biome). `check` and `update`
 * report leftovers so a half-finished migration doesn't linger unnoticed.
 */
export type ObsoleteSpec = {
  files?: string[];
  dependencies?: string[];
  devDependencies?: string[];
};

/** Whether applying the template edits package.json (so it must exist). */
export function patchesPackageJson(manifest: TemplateManifest): boolean {
  return [manifest.dependencies, manifest.devDependencies, manifest.scripts].some(
    (section) => section !== undefined && Object.keys(section).length > 0,
  );
}

/** A template is "meta" when it only groups others (`core`). */
export function isMetaTemplate(manifest: TemplateManifest): boolean {
  return (manifest.extends?.length ?? 0) > 0 && !manifest.files?.length;
}
