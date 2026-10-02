import type { PackageJsonDoc, StringMap } from "./doc.ts";

export type Section = "dependencies" | "devDependencies" | "scripts";
export type PackagePatch = Partial<Record<Section, StringMap>>;
export type PatchChange = { section: Section; name: string; from: string | undefined; to: string };

const SECTIONS: Section[] = ["dependencies", "devDependencies", "scripts"];

function otherDependencySection(section: Section): Section | undefined {
  if (section === "dependencies") return "devDependencies";
  if (section === "devDependencies") return "dependencies";
  return undefined;
}

function isSorted(keys: string[]): boolean {
  return keys.every((key, i) => i === 0 || (keys[i - 1] as string) < key);
}

/** Set `name`, keeping its position if present and sorted order if the section is sorted. */
function withEntry(map: StringMap, name: string, value: string, sortable: boolean): StringMap {
  const keys = Object.keys(map);
  if (name in map || !sortable || !isSorted(keys)) return { ...map, [name]: value };
  const next: StringMap = {};
  let inserted = false;
  for (const key of keys) {
    if (!inserted && name < key) {
      next[name] = value;
      inserted = true;
    }
    next[key] = map[key] as string;
  }
  if (!inserted) next[name] = value;
  return next;
}

/**
 * Additively merge a template's dependencies and scripts into the document.
 * A package the app already lists in the *other* dependency section is updated
 * where it is — never duplicated across `dependencies` and `devDependencies`.
 */
export function patchSections(doc: PackageJsonDoc, patch: PackagePatch): PatchChange[] {
  const changes: PatchChange[] = [];
  for (const section of SECTIONS) {
    const input = patch[section];
    if (!input) continue;
    for (const [name, value] of Object.entries(input)) {
      const other = otherDependencySection(section);
      const elsewhere =
        other !== undefined &&
        doc.data[section]?.[name] === undefined &&
        doc.data[other]?.[name] !== undefined;
      const where = elsewhere && other ? other : section;
      const from = doc.data[where]?.[name];
      if (from === value) continue;
      doc.data[where] = withEntry(doc.data[where] ?? {}, name, value, where !== "scripts");
      changes.push({ section: where, name, from, to: value });
    }
  }
  if (changes.length > 0) doc.dirty.add("content");
  return changes;
}
