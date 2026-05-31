# 02 — CLI

The CLI is a small Bun/Node program built with [citty](https://github.com/unjs/citty)
(command parser) and [consola](https://github.com/unjs/consola) (terminal
output). Pathes are resolved with [pathe](https://github.com/unjs/pathe).

## File layout

```
cli/
├── src/
│   ├── index.ts                # citty entry, registers subcommands
│   ├── version.ts              # WEB_BASE_VERSION (source of truth), compareVersions
│   ├── commands/
│   │   ├── init.ts             # scaffold a new app
│   │   ├── add.ts              # copy a template (or meta-template) into an app
│   │   └── update.ts           # diff local files vs template source
│   └── lib/
│       ├── manifest.ts         # loadManifest, resolveTemplate, types
│       ├── copy.ts             # copyTemplateFiles, diffTemplateFile
│       └── pkg.ts              # patchPackageJson, stampWebBaseVersion, readWebBaseVersion
└── templates/
    └── <template-name>/
        ├── manifest.json
        └── (files to copy)
```

All TypeScript imports inside `cli/src/` use the `.ts` extension explicitly:

```typescript
import { initCommand } from "./commands/init.ts";
```

This works with Bun's runtime and is preserved through `bun build`.

## Entry point

`cli/src/index.ts`:

```typescript
import { defineCommand, runMain } from "citty";
import { initCommand } from "./commands/init.ts";
import { addCommand } from "./commands/add.ts";
import { updateCommand } from "./commands/update.ts";
import { WEB_BASE_VERSION } from "./version.ts";

const main = defineCommand({
  meta: {
    name: "web-base",
    version: WEB_BASE_VERSION,
    description: "Scaffolding CLI for daniel-rck web apps",
  },
  subCommands: {
    init: initCommand,
    add: addCommand,
    update: updateCommand,
  },
});

runMain(main);
```

## Versioning

web-base carries one incrementing version, the single source of truth being
`cli/src/version.ts`:

```typescript
export const WEB_BASE_VERSION = "0.2.0";
export function compareVersions(a: string, b: string): -1 | 0 | 1 { /* x.y.z */ }
```

- **SemVer, driven by conventional commits.** Bump on every change: `fix:` →
  patch, `feat:` → minor, breaking → major. The root `package.json` `version`
  must match `WEB_BASE_VERSION`; `cli/src/version.test.ts` fails if they drift.
- **Stamping.** `init`, `add`, and `update --apply` write the current version
  into the consuming app's `package.json` under `webBase.version` (via
  `stampWebBaseVersion`, additive — other `webBase` fields are preserved). The
  stamp means "this app last pulled web-base vX."
- **Reporting.** `update` reads the stamp (`readWebBaseVersion`, never throws)
  and reports `current` / `behind (X → Y)` / `ahead` / `unstamped` so an app
  knows whether to pull. The catch-up path is `web-base update <template>
  --apply`.
- **CHANGELOG.** `CHANGELOG.md` (Keep a Changelog) records what each version
  changed.

`web-base --version` surfaces `WEB_BASE_VERSION` through citty's `meta.version`.

## Manifest format

Every template under `cli/templates/<name>/` has a `manifest.json`. Schema:

```typescript
type TemplateManifest = {
  name: string;
  description: string;

  // Meta-templates: if present, runs these templates in order before applying
  // this template's own files/deps. Recursive (meta can extend meta).
  extends?: string[];

  // Files to copy from this template's directory to the target repo.
  files?: Array<{
    from: string;           // path inside the template dir
    to: string;             // destination path in the target repo
    overwrite?: boolean;    // default false: skip if exists (on `add`)
    policy?: "owned" | "scaffold"; // default "owned"; see below
  }>;

  // Patched into the target's package.json
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;

  // Shown to the user after install completes
  postInstall?: string[];
};
```

### File policy: owned vs scaffold

Each file carries a `policy` (default `"owned"`) that decides how `update`
treats it — this is what lets apps stay flexible while still being built from
shared building blocks:

- **`owned`** — a base building block (UI primitives, the layout shell, the
  `idb`/`useLiveQuery` machinery, router/worker plumbing, `biome.json`). The app
  should *not* hand-edit it; `update --apply` overwrites it so upstream fixes
  flow in. If an owned file differs while the app is on the current version,
  `update` flags it as a local edit that will be reverted.
- **`scaffold`** — a per-app seam copied once as a starting point: `theme.css`
  (the `--accent-h` accent), `db.ts` (the `AppSchema` + store setup),
  `routes.ts`/`router.tsx` (the route table), `sw.ts`/`worker.ts` (app
  handlers), `wrangler.toml` (app name + bindings), `LICENSE`/`SECURITY.md`.
  `update` reports drift on these but **never** overwrites them, so per-app
  customization survives.

Customization happens by editing the scaffold seams and by composing the owned
blocks from app code in `features/` — not by editing owned files in place.

Example (`hygiene/manifest.json`):

```json
{
  "name": "hygiene",
  "description": "LICENSE, CONTRIBUTING, SECURITY, .editorconfig",
  "files": [
    { "from": "LICENSE", "to": "LICENSE" },
    { "from": "CONTRIBUTING.md", "to": "CONTRIBUTING.md" },
    { "from": "SECURITY.md", "to": "SECURITY.md" },
    { "from": "editorconfig", "to": ".editorconfig" }
  ],
  "postInstall": ["Edit LICENSE to set the current year"]
}
```

Example meta-template (`core/manifest.json`):

```json
{
  "name": "core",
  "description": "Everything every daniel-rck web app shares",
  "extends": ["hygiene", "biome", "router", "storage", "pwa", "worker", "layout"]
}
```

**Decision: meta-templates with `extends`.** An alternative was hard-coding
"core" inside the `init` command. Making it a manifest-driven meta-template
means `add core` works exactly like `add layout` from the caller's perspective,
and new meta-templates (e.g. `add minimal` later) cost only a new directory.

## Resolution algorithm

`resolveTemplate(name)` returns the ordered list of leaf templates to apply:

1. Load `manifest.json` for `name`.
2. If no `extends`, return `[name]`.
3. Otherwise, recursively resolve each entry in `extends` and concatenate,
   deduplicating while preserving first occurrence.
4. If the meta-template has its own `files`/`dependencies`/`scripts`, append
   `name` itself at the end.

A `visited` set tracks the current resolution path so a circular `extends`
(`a` → `b` → `a`) throws `Circular extends detected: …` instead of recursing
forever. Each `extends` branch gets its own copy of the path, so two branches
legitimately sharing a leaf don't trip the guard — only back-edges do.

```typescript
async function resolveTemplate(template: string, visited = new Set<string>()): Promise<string[]> {
  if (visited.has(template)) {
    throw new Error(`Circular extends detected: ${[...visited, template].join(" -> ")}`);
  }
  visited.add(template);

  const manifest = await loadManifest(template);
  if (!manifest.extends?.length) return [template];

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const child of manifest.extends) {
    for (const t of await resolveTemplate(child, new Set(visited))) {
      if (!seen.has(t)) {
        seen.add(t);
        resolved.push(t);
      }
    }
  }
  if (manifest.files?.length || manifest.dependencies || manifest.devDependencies || manifest.scripts) {
    resolved.push(template);
  }
  return resolved;
}
```

## Commands

### `web-base init`

Scaffolds a new app from an empty directory.

```
web-base init [--cwd <dir>] [--name <app-name>] [--force] [--dry-run]
```

Behavior:

1. Prompt for app name if `--name` not given (use `consola.prompt`).
2. Write a fresh `package.json` using the template in `07-conventions.md`,
   substituting the name, description, homepage URL pattern, repo URL pattern.
3. Resolve and apply `core` (calls the same code path as `add core`).
4. Stamp `webBase.version` into the new `package.json`.
5. Initialize a Git repo (`git init && git add -A && git commit -m "chore: initial scaffold"`).
6. Print next steps (set the color accent in `theme.css`, fill in domain content).

If the target already has a `package.json`, `init` aborts and suggests
`add core` instead.

### `web-base add <template>`

Copies a single template (or expands a meta-template).

```
web-base add <template> [--cwd <dir>] [--force] [--dry-run]
```

Behavior:

1. Call `resolveTemplate(template)`.
2. For each leaf in the chain:
   a. `copyTemplateFiles(manifest.files, ...)` — skip existing files unless
      `--force`, log every action.
   b. `patchPackageJson(...)` — additive merge of `dependencies`,
      `devDependencies`, `scripts`. Existing entries are overwritten only if
      the value differs.
3. Stamp `webBase.version` into the app's `package.json` (once, after the chain,
   if a `package.json` exists).
4. Collect and display all `postInstall` messages at the end.

`--dry-run` logs all operations but writes nothing.

Calling `web-base add` with no template lists all available templates with
descriptions, marking meta-templates with `[meta]`.

### `web-base update <template>`

Compares local files in the target repo against the current template source
and reports diffs.

```
web-base update <template> [--cwd <dir>] [--apply]
```

Behavior:

1. Load the manifest (no extends-expansion — `update` operates per-template).
2. Report the app's base-version status by comparing its stamped
   `webBase.version` against `WEB_BASE_VERSION`: `current` / `behind` / `ahead`
   / `unstamped`.
3. For each file in `manifest.files`:
   - If identical: report as `identical`.
   - Else if the file's `policy` is `scaffold`: report `scaffold, differs/missing
     (left as-is)` — never queued for apply.
   - Else (owned): report `missing`, or `differs` with line counts. An owned file
     that differs while the app is on the current version is additionally flagged
     as a local edit that `--apply` will revert.
4. Print a summary (`N identical, N differs, N missing, N scaffold left as-is`).
5. If `--apply` is set, overwrite the queued **owned** files (differing/missing)
   with the template source and stamp `webBase.version` (the stamp updates even
   when all files were already identical, since `--apply` asserts the app pulled
   current source). Scaffold files are never overwritten.

`update` does **not** patch `package.json` dependencies/scripts — only files
(plus the `webBase.version` stamp on `--apply`). Dependency drift is visible
through normal `bun outdated`.

## File copy: behavior contract

`copyTemplateFiles(files, { targetDir, template, force, dryRun })`:

- For each `{ from, to }`:
  - `src = templatesDir() / template / from`
  - `dst = targetDir / to`
  - If `dst` exists and `!force && !spec.overwrite`:
    - If content differs: log "exists (differs)" and skip
    - If content same: log "exists (same)" and skip
  - Otherwise: `mkdir -p $(dirname dst)`, `copyFile(src, dst)`, log result.
- If `dryRun`: log "would copy" instead of writing.

`templatesDir()` resolves the templates directory relative to the running
binary. It must work both for `bun run cli/src/index.ts` (source mode) and
`node cli/dist/index.js` (built mode). Strategy: from `import.meta.url`,
try `../templates` first (built layout: `cli/dist/index.js` →
`cli/templates`), fall back to `../../templates` (source layout: `cli/src/lib/manifest.ts`
→ `cli/templates`).

## Package.json patcher: behavior contract

`patchPackageJson({ targetDir, dependencies?, devDependencies?, scripts?, dryRun? })`:

- Read `${targetDir}/package.json`.
- For each section (`dependencies`, `devDependencies`, `scripts`):
  - For each `[name, value]` in the input: if `pkg[section][name] !== value`,
    set it and log the change.
- If no changes occurred, log "already up to date" and exit early.
- Write back with `JSON.stringify(pkg, null, 2) + "\n"`.
- If `dryRun`: log changes but don't write.

The patcher does NOT remove existing keys — it only adds/updates. Removing old
deps is a manual step listed in the `postInstall` messages of templates that
replace existing setups (e.g. the `biome` template tells the user which ESLint
packages to remove).

## Tests

Vitest tests live in `cli/src/**/*.test.ts`:

- `lib/manifest.test.ts`: `resolveTemplate` returns expected order for a
  simple meta-template, handles missing extends, handles a meta extending
  another meta.
- `lib/copy.test.ts`: skip-existing behavior, force-overwrite behavior,
  dry-run produces no writes.
- `lib/pkg.test.ts`: patch adds missing keys, leaves existing identical keys
  alone, overwrites existing differing keys; `stampWebBaseVersion` adds/updates
  `webBase.version` and preserves other fields; `readWebBaseVersion` reads or
  returns undefined.
- `version.test.ts`: `WEB_BASE_VERSION` matches the root `package.json` version
  (drift guard); `compareVersions` ordering.

Integration test: run `bun build`, then `node cli/dist/index.js add hygiene
--cwd /tmp/scratch-app`, assert files exist. This runs in `tools-ci.yml`.

## Error handling

- Missing template → `consola.error(\`Template "<name>" not found.\`)`, list
  available, `process.exit(1)`.
- Missing `manifest.json` → same as missing template.
- Malformed `manifest.json` → bubble the JSON parse error with the file path
  (both `loadManifest` and `listTemplates` use the same `parseManifest` helper,
  so a single corrupt manifest reports its path instead of crashing the list).
- Missing source file (a manifest lists a `from` that isn't on disk) → throw
  `Template file not found: <template>/<from>`. Applies to both copy and diff.
- Circular `extends` → throw `Circular extends detected: a -> b -> a`.
- Malformed target `package.json` → bubble the JSON parse error with the path.
- Write errors (permissions, full disk) → bubble. Don't try to recover.

All commands return `process.exitCode = 1` on failure (don't throw out of `run`).
