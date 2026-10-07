# 02 — CLI

The CLI is a small Bun/Node program built with [citty](https://github.com/unjs/citty)
(command parser) and [consola](https://github.com/unjs/consola) (terminal
output). Pathes are resolved with [pathe](https://github.com/unjs/pathe).

## File layout

```
cli/
├── src/
│   ├── index.ts                # process.exitCode = await runCli(argv)
│   ├── cli.ts                  # the citty command tree (main + subcommands)
│   ├── run.ts                  # runCli: help/version/dispatch → exit code
│   ├── exit.ts                 # EXIT codes, CliError
│   ├── version.ts              # WEB_BASE_VERSION (source of truth), compareVersions
│   ├── commands/
│   │   ├── define.ts           # defineCliCommand, unknown-option guard, error → exit 2
│   │   ├── shared-args.ts      # --cwd/--force/--dry-run…, resolveTargetDir, loadChainOrList
│   │   ├── list.ts             # printAvailable (bare `add`)
│   │   ├── apply-log.ts        # how add/init report each file and package.json change
│   │   ├── init.ts             # scaffold a new app
│   │   ├── init-package.ts     # renderPackageJson, validateAppName
│   │   ├── add.ts              # copy a template (or meta-template) into an app
│   │   ├── update.ts           # diff local files vs template source, --apply
│   │   ├── check.ts            # read-only drift guard for CI
│   │   ├── check-render.ts     # check's human-readable output
│   │   ├── check-json.ts       # check --json (schemaVersion 1)
│   │   └── pins.ts             # compare package.json against the pin table
│   ├── lib/
│   │   ├── manifest/           # types, validate (shape + paths), load, resolve (extends)
│   │   ├── files/              # compare (EOL-insensitive), copy (policy-aware), confine (no symlinks)
│   │   ├── pkg/                # doc (load/save package.json), patch, webbase (stamp, unmanaged), splice
│   │   ├── diff/               # lines (LCS line diff, counts), unified (--diff output)
│   │   ├── pins.ts             # loadPins / comparePins / applyPins
│   │   ├── apply.ts            # applyTemplates — the one install path of init and add
│   │   ├── update-plan.ts      # planUpdate / applyUpdate
│   │   ├── check.ts            # collectCheck / judgeCheck
│   │   ├── obsolete.ts         # findObsolete
│   │   ├── paths.ts            # relativePathProblem, isInside, resolveInside, normalizeRepoPath
│   │   ├── templates-dir.ts    # where the templates live
│   │   ├── git.ts              # work-tree detection, git init
│   │   └── text.ts             # normalizeEol, writeOut
│   ├── docs/                   # doc guards: the specs show what the repo does
│   ├── e2e/                    # the built bundle against scratch apps
│   └── test/                   # test helpers: runInProcess, scratch fixtures
└── templates/
    ├── pins.json               # the fleet's version pins (single source)
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
import { runCli } from "./run.ts";

process.exitCode = await runCli(process.argv.slice(2));
```

`cli.ts` holds the citty command tree (`main` with `init`, `add`, `update`,
`check`, `pins`). `runCli` dispatches it itself: no arguments → usage, exit 2;
`--help`/`-h` (also after a subcommand) → usage, exit 0; `--version` alone →
the version, exit 0; an unknown command → usage, exit 2; otherwise
`runCommand(sub, { rawArgs })` and the command's own exit code. An argument
error citty raises before `run` (a missing required positional) prints the
subcommand's usage and exits 2.

**Decision: our own dispatcher instead of citty's `runMain`.** `runMain`
discards a command's return value and exits 1 for every failure, which would
erase the difference between "the app drifted" (1) and "the command could not
run" (2). The cost is relying on `runCommand`/`renderUsage`, citty 0.2.x API;
`run.test.ts` covers the dispatch so a citty upgrade that changes it fails
loudly.

**Decision: usage goes through consola, uncoloured unless on a TTY.** citty
0.2's `showUsage` writes with `console.log` and colours its output even when
piped. `run.ts` renders the usage with `renderUsage` and logs it with
`consola.log`, stripping the colour codes when stdout isn't a TTY or `NO_COLOR`
is set — so usage lands where every other message lands, and `--help | less`
stays readable.

### Exit codes

Modelled on diff(1), defined once in `exit.ts`:

| Code | Meaning |
|---|---|
| `0` | Did what was asked; for `check`, the app conforms |
| `1` | Ran fine, but the app does not conform (`check` drift, `--strict` findings, `pins` mismatch) |
| `2` | Could not run: bad usage, unknown option, malformed `package.json` or manifest, missing target directory, I/O error |

Every command is defined with `defineCliCommand`, whose `run` returns an exit
code. Any error inside a command is caught there, printed (with its `hint` for
a `CliError`) and mapped to `2` — nothing throws out of a command.

### Unknown options

citty ignores options it doesn't know, so `check --strcit` used to run as a
plain `check` and pass. `defineCliCommand` rejects, before the command does
anything, every option that isn't declared (in kebab- or camelCase) and every
positional beyond the declared ones: exit 2, "Unknown option: --strcit".

A string option takes the next token as its value, even one that looks like a
flag: `--cwd --json` sets `cwd` to `"--json"`. `resolveTargetDir` therefore
rejects an empty `--cwd` or one starting with `-` ("--cwd needs a directory.",
exit 2); a directory named `-x` is reached as `./-x`. A repeated string option
keeps its last value.

## Versioning

web-base carries one incrementing version, the single source of truth being
`cli/src/version.ts`:

```typescript
export const WEB_BASE_VERSION = "X.Y.Z";
export function compareVersions(a: string, b: string): -1 | 0 | 1 { /* x.y.z */ }
```

The root `package.json` `version` must match it; `cli/src/version.test.ts`
fails if they drift. (The literal above is deliberately a placeholder — a
copied version number here would be one more thing to fall behind.)

**The version rule.** This is the one place it is stated; the CHANGELOG
header and `07-conventions.md` point here.

- **Until 1.0.0:** a breaking change bumps the **minor** and is marked with
  `!` in the commit and a **Breaking** note in the CHANGELOG; a `feat:` also
  bumps the minor; a `fix:`, or a `refactor:`/`perf:` that changes shipped
  output, bumps the patch.
- **Breaking** means an app has to act: a changed CLI interface (flags,
  output an app's CI parses, exit codes), a changed reusable-workflow input,
  or template output that needs migration (a seam to rewrite, a new required
  file).
- **Only the shipped surface is versioned:** `cli/src` / `cli/dist`,
  `cli/templates`, `web-app-ci.yml` and `web-base-check.yml`. A change that
  only touches specs, the skill, the README, `tools-ci.yml`, `release.yml` or
  `notify-apps.yml` needs no bump and produces no release.
- **From 1.0.0:** standard SemVer — breaking (including template output) →
  major.
- Several changes can share one bump: entries collect under `## [Unreleased]`
  in `CHANGELOG.md`, and the release commit renames it to the new version.
  `release.yml` tags and releases every version that lands on `main`.

**Decision: breaking → minor during 0.x.** That is what the history already
did (0.4.0 replaced Biome and was a minor), and SemVer treats 0.x as
unstable. The earlier specs contradicted each other — "breaking → major" here,
"breaking template output → minor, CLI → major" in 07, "additive → patch" in
03 — which is why the rule now lives only here.

- **Stamping.** `init`, `add`, and `update --apply` write the current version
  into the consuming app's `package.json` under `webBase.version` (via
  `stampVersion`, additive — other `webBase` fields are preserved). The
  stamp means "this app last pulled web-base vX." `add` does **not** stamp
  when it kept owned files that differ from the template (no `--force`): the
  claim would be false, and `update` would then flag those files as local edits.
- **Reporting.** `update` reads the stamp (`readWebBase`) and reports
  `current` / `behind (X → Y)` / `ahead` / `unstamped` so an app knows whether
  to pull. The catch-up path is `web-base update <template> --apply`.
  `web-base-check.yml` runs the CLI at the app's stamped version by default.
- **CHANGELOG.** `CHANGELOG.md` (Keep a Changelog) records what each version
  changed, with a **Migration** section when apps have to act.

`web-base --version` prints `WEB_BASE_VERSION`.

## Manifest format

Every template under `cli/templates/<name>/` has a `manifest.json`. Schema:

```typescript
type TemplateManifest = {
  name: string;           // must equal the template's directory name
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

  // What this template superseded. `check` and `update` report leftovers.
  obsolete?: {
    files?: string[];           // paths relative to the target repo root
    dependencies?: string[];    // package names, looked up in both
    devDependencies?: string[]; // dependencies and devDependencies
  };
};
```

### Manifest validation

`loadManifest` validates every manifest before anything is copied
(`lib/manifest/validate.ts`), collecting all problems into one error (exit 2):

- the manifest is a JSON object with no unknown keys (`$schema`/`$comment`
  allowed); `name` equals the directory name; `description` is a string;
- `extends` is an array of template names (`^[a-z][a-z0-9-]*$`), each of which
  exists;
- every `files[]` entry has string `from`/`to`, an optional boolean `overwrite`
  and an optional `policy` of `"owned"`/`"scaffold"`;
- `from` and `to` are relative, normalized (no `./`, `//`, backslashes) and
  stay inside their root; `from` exists on disk and is not `manifest.json`;
  `to` is unique within the manifest and never `package.json`, `.git/…` or
  `node_modules/…`;
- `dependencies`/`devDependencies`/`scripts` map names to strings,
  `postInstall` is a string array, `obsolete` has the documented shape.

The template name given on the command line must match the same pattern
before it touches the filesystem (`add /abs/dir`, `add ../x` → exit 2). Every
source and destination is additionally resolved through `resolveInside`, which
throws if the path leaves the template directory or the target app.

`resolveInside` is lexical, so every write (template files, the `<app-name>`
fill-in, `package.json`) also goes through `assertWritableInside`
(`lib/files/confine.ts`): the destination must not be a symlink — dangling ones
included — and its parent, symlinks resolved, must lie inside the target,
symlinks resolved. Otherwise the command stops with exit 2 before writing that
file. Symlinks that stay inside the app, and a symlinked app directory, are
fine; reads (`check`, `update --diff`) may follow symlinks. `templates.test.ts`
keeps symlinks out of `cli/templates/`.

**Decision: validate strictly, including paths.** `WEB_BASE_TEMPLATES_DIR` lets
any directory act as the template root, and a manifest with `"to": "../x"` used
to write outside the app. Unknown keys are rejected so a typo (`polcy`) is an
error instead of a silently ignored setting.

**Decision: superseded setups are declared, reported, never deleted.** When a
template replaces a tool (`oxc` replaced Biome), the manifest lists the old
files and packages under `obsolete` (`lib/obsolete.ts`, `findObsolete`). The
CLI never removes them: a leftover `biome.json` can still carry per-app
overrides that have to be ported to `.oxlintrc.json` first. Reporting them is
what keeps nine half-finished migrations from lingering unnoticed.

### File policy: owned vs scaffold

Each file carries a `policy` (default `"owned"`) that decides how `update`
treats it — this is what lets apps stay flexible while still being built from
shared building blocks:

- **`owned`** — a base building block (UI primitives, the layout shell, the
  `idb`/`useLiveQuery` machinery, router/worker plumbing, `oxlint.base.json`, `.oxfmtrc.json`). The app
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

#### The per-app escape hatch: `webBase.unmanaged`

`owned` vs `scaffold` is a property of the *template*, and it is occasionally
wrong for exactly one app. An app can then take a single owned file off the
base by listing its repo-relative path in `package.json`:

```json
"webBase": {
  "version": "0.3.1",
  "unmanaged": ["src/lib/db/useLiveQuery.ts"]
}
```

`check` skips a listed file and reports it as `unmanaged`; `update --apply`
and `add --force` never overwrite it. Entries are repo-relative paths; `./x`
and backslashes are normalized, absolute or escaping paths are an error.

**Decision: `update` respects the opt-out too.** It used to overwrite listed
files, so the one command `notify-apps.yml` sends every app (`update core
--apply`) would have reverted Hausverwaltung's fork. An app that opts out
maintains that file itself; nothing in the CLI writes it.

The current — and only — user is Hausverwaltung's `useLiveQuery`. Six of seven
apps carry the template version byte-for-byte, so demoting it to `scaffold`
would stop guarding a file that genuinely is shared; Hausverwaltung's 85 call
sites predate the template's per-store signature and several query across
stores, which that signature cannot express.

**This is a last resort, not a way to keep a local edit.** The bar is: the
template file is right for the other apps, *and* converging this one would be a
rewrite rather than a re-sync. Prefer, in order: fix the app, promote the app's
version into the template, or split the template file. An entry here is a
standing debt and belongs in `08-app-migrations.md` with the reason.

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
  "extends": ["hygiene", "oxc", "router", "storage", "pwa", "worker", "layout"]
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
4. If the meta-template has its own `files`/`dependencies`/`devDependencies`/
   `scripts`/`postInstall`/`obsolete`, append `name` itself at the end.

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
  if (hasOwnContent(manifest)) resolved.push(template);
  return resolved;
}
```

## Commands

### `web-base init`

Scaffolds a new app from an empty directory.

```
web-base init [--cwd <dir>] [--name <app-name>] [--force] [--force-scaffold] [--dry-run]
```

Behavior:

1. If the target already has a `package.json`, abort (exit 2) and suggest
   `add core` — **also with `--force`**: rewriting it would delete every
   dependency and script the app has.
2. Take the app name from `--name`, or prompt for it (`consola.prompt`) — but
   only when `process.stdin.isTTY`. Without a TTY and without `--name`, fail
   (exit 2) rather than blocking a pipeline on a prompt nobody can answer.
   The name must match `^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`: it becomes the
   npm name, the `<name>.daniel-rck.workers.dev` label and part of the repo URL.
3. Create the target directory if it doesn't exist (`mkdir -p`).
4. Build a fresh `package.json` in memory from the template in
   `07-conventions.md` (`renderPackageJson`, `packageManager` from the pin
   table), apply the `app` template (`core` plus the entry files and Vite/TS
   config, `03-templates.md`) through `applyTemplates` — the same code path
   `add` uses — stamp `webBase.version`, then write `package.json` once.
   Every **scaffold** file this run created gets `<app-name>` replaced with
   the app's name; owned files stay byte-identical to the base.
5. Run `git init` unless the target is already inside a Git work tree
   (`git rev-parse --is-inside-work-tree` — a package in a monorepo must not
   get a nested `.git`). This is not cosmetic: oxlint and oxfmt skip what
   `.gitignore` lists, and the drift guard and CI assume a repo. A missing
   `git` binary is not fatal — the command falls back to telling the user.
   Committing stays a next step.
6. Print next steps: the `app` template's own `postInstall` (the other
   templates' steps are migration steps for existing apps, which a fresh
   scaffold has already done), filling in the domain content under
   `src/features/`, `bun install`, the commit.

`--dry-run` writes nothing at all — no directory, no `package.json`, no `.git`.

### `web-base add <template>`

Copies a single template (or expands a meta-template).

```
web-base add <template> [--cwd <dir>] [--force] [--force-scaffold] [--dry-run]
```

Behavior:

1. Resolve and load the template chain (`loadChain`). An unknown template lists
   the available ones and exits 2.
2. Load the app's `package.json` once. If any template in the chain adds
   dependencies or scripts and there is no `package.json`, fail (exit 2)
   **before the first write** — `add core` used to copy `hygiene` and then die
   half-way. Templates that only copy files (`hygiene`, `sync`) work without one.
3. `applyTemplates` walks the chain:
   a. `copyTemplateFile` per file — skip existing files unless `--force`, log
      every action. **`--force` respects the file policy**: it re-pulls `owned`
      building blocks but leaves `scaffold` seams alone. `--force-scaffold`
      opts into overwriting those too, and implies `--force`. Files listed in
      `webBase.unmanaged` are never overwritten.

      **Decision: `--force` does not mean "overwrite everything".** Scaffold
      seams are where the app's own work lives — and `wrangler.toml` is one of
      them, carrying live Cloudflare R2 and KV binding IDs that the template
      only has placeholders for. A `--force` that replaced those would take
      production sync down on the next deploy, and would look like an app bug
      rather than a tooling one. A file that is simply *absent* is still
      installed regardless of policy; the protection is against clobbering, not
      against installing.
   b. `patchSections(...)` — additive merge of `dependencies`,
      `devDependencies`, `scripts` into the in-memory document (see
      *Package.json document* below).
4. Stamp `webBase.version` — unless owned files that differ were kept (see
   *Versioning*); then warn which command pulls them. Save `package.json` once.
5. Collect and display all `postInstall` messages at the end.

`--dry-run` logs all operations but writes nothing.

Calling `web-base add` with no template lists all available templates with
descriptions, marking meta-templates with `[meta]`.

### `web-base update <template>`

Compares local files in the target repo against the current template source
and reports diffs.

```
web-base update <template> [--cwd <dir>] [--apply] [--diff]
```

Behavior:

1. Resolve the template chain and load every leaf manifest, so `update core`
   covers the same file set `add core` installs. A chain with no files
   anywhere reports "has no files to update" and exits 0.
2. Report the app's base-version status by comparing its stamped
   `webBase.version` against `WEB_BASE_VERSION`: `current` / `behind` / `ahead`
   / `unstamped`.
3. `planUpdate` decides an action for every file:
   - `identical` — nothing to do;
   - `unmanaged-skip` — listed in `webBase.unmanaged`; never written;
   - `scaffold-left` — a scaffold seam that differs or is missing; never written;
   - `apply` — an owned file that differs or is missing. One that differs while
     the app is on the current version is flagged as a local edit `--apply`
     will revert;
   - `not-adopted` — a missing owned file of a block the app never took up.
4. Print a summary, then warn about every `obsolete` leftover of the resolved
   templates (see *Manifest format*), with a hint to remove it by hand.
5. With `--apply`, write every `apply` entry from the template source and stamp
   `webBase.version` (also when everything was identical: `--apply` asserts
   the app pulled current source). Without a `package.json` the files are
   still written and the missing stamp is a warning, not an error.

`--diff` prints a unified diff after every file it reports as differing —
owned files `--apply` would write *and* scaffold seams, because a seam diff is
how an app ports an upstream change by hand. See *Diff output* below.

**Decision: a meta-template never adopts a block.** When `update` expands a
meta-template (`core`), a block of which not one owned file is present stays
unadopted: its missing files are reported as `not-adopted`, not installed.
Otherwise the command `notify-apps.yml` sends every app — `update core --apply`
— would push layout, storage and router files into HamsterFlight, a canvas
game that has none of them. Naming the block (`update layout --apply`) adopts
it, as does `add layout`.

`update` does **not** patch `package.json` dependencies/scripts — only files
(plus the `webBase.version` stamp on `--apply`). Dependency drift is visible
through normal `bun outdated`. A template that changes scripts or adds devDeps
(e.g. the switch to `oxc`) is picked up with `web-base add <template>`, which
skips existing files and patches `package.json`.

### `web-base check <template>`

Read-only drift guard for CI. Verifies that the app's **owned** building blocks
still match the template source; scaffold seams are ignored.

```
web-base check [template] [--cwd <dir>] [--strict] [--diff] [--json]
```

Behavior:

1. Resolve the template (default `core`) including `extends`.
2. For every **owned** file across the resolved templates, record whether it is
   identical, differs, or is missing. Scaffold files are never checked.
3. Then judge **per building block**, not per file (`collectCheck`, then
   `judgeCheck`). A block's adoption is computed over its owned files that are
   not `webBase.unmanaged`:
   - `full` — all present;
   - `partial` — some present. Not drift: taking `primitives` and
     `InstallButton` without `AppNav` is a legitimate choice for a single-route
     app; `--strict` is how an app that means to be fully on the base turns
     that into a failure;
   - `none` — not one present: the app does not use that block. Reported as
     `not adopted`;
   - `nothing-owned` — the block has nothing to guard: only scaffold seams
     (`router`, `pwa`, `worker`, `hygiene`), or every owned file is unmanaged.
4. Files listed in the app's `webBase.unmanaged` are reported as `unmanaged`
   (see *The per-app escape hatch* above) — on success and on failure.
   `obsolete` leftovers of the resolved templates are warned about; they are
   not drift.
5. Exit 1 when any owned file drifted, or when the chain has guardable blocks
   and none of them is adopted ("not on the base at all"). A chain with nothing
   to guard passes. `--strict` additionally fails on `none` blocks, files
   absent from `partial` blocks, and `obsolete` leftovers. `check` also warns
   when the app's stamped `webBase.version` differs from the running CLI's
   version, since the comparison is against the CLI's bundled templates.

With `--diff`, every drifted owned file is followed by its unified diff. With
`--json`, stdout carries only the JSON document below (warnings and errors go
to stderr) and the exit code is unchanged.

**Decision: a missing owned file is never drift; only differing content is.**
Treating absence as drift fails HamsterFlight on every layout, storage and
router file — a pixi.js canvas game will never have them — and fails Tonspur
for taking `primitives` without `AppNav`, which is the right call for a
single-route app. The opposite failure, treating absence as always-fine, let an
app that had adopted nothing pass silently; that is caught separately by
failing when *no* guardable block is adopted. `--strict` is the opt-in for an
app that asserts full `core` adoption; never use it in HamsterFlight.

**Decision: a block with nothing to guard passes.** `check router` (and `pwa`,
`worker`, `hygiene`) used to exit 1 with "not on the base at all" because
those templates ship only scaffold seams, so nothing could ever match.

#### `check --json` (schemaVersion 1)

Normative — `web-base-check.yml` and other CI consumers depend on it; a
breaking change bumps `schemaVersion`.

```json
{
  "schemaVersion": 1,
  "command": "check",
  "template": "core",
  "webBaseVersion": "0.6.0",
  "stamped": "0.5.0",
  "strict": false,
  "ok": false,
  "exitCode": 1,
  "failures": ["1 owned file(s) drifted from the base"],
  "summary": { "identical": 11, "differs": 1, "missing": 0, "unmanaged": 0 },
  "blocks": [
    {
      "template": "layout",
      "adoption": "full",
      "files": [
        { "path": "src/lib/ui/primitives.tsx", "status": "differs", "added": 1, "removed": 0, "diff": "--- local/…" }
      ]
    }
  ],
  "obsolete": [{ "template": "oxc", "kind": "file", "name": "biome.json" }]
}
```

`stamped` is `null` when the app is unstamped; `adoption` is `full` /
`partial` / `none` / `nothing-owned`; file `status` is `identical` / `differs`
/ `missing` / `unmanaged`; `diff` is present only with `--diff`. When the
command cannot run, stdout carries `{ "schemaVersion": 1, "command": "check",
"ok": false, "exitCode": 2, "error": "<message>" }`.

### Diff output

`--diff` renders local → template as a unified diff with three lines of
context, headers `--- local/<path>` and `+++ web-base/<path>`: `-` lines are
what the app has, `+` lines what `--apply` would write, and `git apply -p1` in
the app root applies it. A missing final newline is shown as `\ No newline at
end of file`. Diffs go straight to stdout, interleaved with the report lines.
The line diff (`lib/diff/lines.ts`) trims the common prefix and suffix and runs
an LCS over the rest; for a pathological pair beyond 25M table cells it
reports the middle as replaced wholesale — still correct, just not minimal.

**Decision: no diff dependency.** About 150 lines of our own code cover what
the CLI needs; `jsdiff` would be the bundle's largest dependency.

This is what makes the "owned files stay identical across apps" rule
(`07-conventions.md`) machine-enforceable — see the `web-base-check.yml`
reusable workflow in `06-workflows.md`.

### `web-base pins`

Read-only by default: compares the app's `package.json` against the fleet's
pin table, `cli/templates/pins.json` (the single source of the tables in
`07-conventions.md`).

```
web-base pins [--cwd <dir>] [--json] [--apply]
```

Behavior:

1. Load the app's `package.json` (none → exit 2) and the pin table.
2. For every pinned package the app lists — in either dependency section — the
   range must equal the pin exactly. A mismatch is labelled `behind` / `ahead`
   (same operator, older / newer version) or `different` (another operator or
   syntax). A package pinned under `dependencies` but listed in
   `devDependencies` (or vice versa) is a note, not a failure. Packages the app
   doesn't use are ignored: the table is a ceiling for the fleet, not a list
   every app must install.
3. `packageManager` must equal the pinned one; a missing field is `missing`.
4. Exit 1 on any mismatch, 0 otherwise.
5. `--apply` rewrites every mismatched range where the app has it and sets
   `packageManager`, then saves (keeping the file's indentation and line
   endings) and exits 0 — it never adds or removes packages. Run `bun install`
   afterwards.
6. `--json` prints `{ schemaVersion: 1, command: "pins", ok, exitCode, applied,
   matched, mismatches: [{ name, section, expected, actual, kind }], notes }`.

**Decision: the pin table is a template-directory file, read at runtime.**
Like the manifests, `pins.json` is data the CLI reads from `cli/templates/`,
so bumping a pin needs no rebuild of the bundle, and tests can point
`WEB_BASE_TEMPLATES_DIR` at a fixture. `init` takes its `packageManager` from
it too.

## File copy: behavior contract

`copyTemplateFile(spec, { targetDir, template, force, forceScaffold, dryRun, unmanaged })`
returns what it did (`CopyAction`):

- `src = resolveInside(templatesDir()/template, from)`,
  `dst = resolveInside(targetDir, to)` — both containment-checked, and every
  write first passes `assertWritableInside(targetDir, dst)` (no symlinks).
- `dst` absent → copy (`mkdir -p`, byte-exact `copyFile`): `copied`
  (`would-copy` in dry-run). An absent file is installed regardless of policy.
- `dst` listed in `unmanaged` → `unmanaged`, never written.
- `dst` identical to `src` (modulo line endings) → `same`.
- Otherwise it differs. Overwrite is allowed for an **owned** file with
  `force` or `spec.overwrite`, and for a **scaffold** file only with `force`
  *and* `forceScaffold` (`spec.overwrite` never reaches a seam) →
  `overwritten` / `would-overwrite`. Else `kept-scaffold` (scaffold under
  `--force`) or `kept-differs`.

`compareTemplateFile(spec, { targetDir, template, withEdits? })` →
`missing` / `identical` / `differs` with added/removed line counts (and the
line edits for `--diff`). **Line endings don't count:** a Windows checkout with
`core.autocrlf` used to read as drift on every owned file. Copying stays
byte-exact; only the comparison normalizes `\r\n`.

`templatesDir()` honours `WEB_BASE_TEMPLATES_DIR` (tests point it at fixture
templates); otherwise it walks up from the running module to the first
`templates/` directory that contains `core/manifest.json`. That finds
`cli/templates` both from the bundle (`cli/dist/index.js`) and from source
(`cli/src/lib/templates-dir.ts`).

## Package.json document: behavior contract

Each command loads the app's `package.json` **once** (`loadPackageJson`),
edits it in memory and saves it **once** at the end (`savePackageJson`), so a
run that fails half-way never leaves it half-patched.

- **Loading.** A missing file is `undefined`. A file that exists but is
  malformed JSON, not an object, or has non-string values in
  `dependencies`/`devDependencies`/`scripts` is an error (exit 2) naming the
  path. `readWebBase` validates the `webBase` block the same way: an object;
  `version` a version string; `unmanaged` an array of repo-relative paths.

  **Decision: a malformed `package.json` is an error, never "empty".** The
  readers used to swallow parse errors, so `update` called a broken file
  "unstamped" and `check` silently ignored its `webBase.unmanaged` — CI went
  red with no hint why. A missing file is still legitimately empty.
- **Patching** (`patchSections(doc, { dependencies?, devDependencies?, scripts? })`):
  for each `[name, value]`, set it if it differs. A package the app already
  lists in the *other* dependency section is updated where it is, never
  duplicated. New keys go into sorted position when the section is sorted
  (as Bun writes it); scripts are only appended.
- **Saving.** Nothing is written when nothing changed or in dry-run. A
  stamp-only change is spliced into the original text (`spliceStamp`), keeping
  inline arrays and key order; if the file's shape defeats the splice it falls
  back to a reformat and says so. Any other change re-serializes with the
  file's own indentation, line endings and final newline.

The patcher does NOT remove existing keys — it only adds/updates. Removing old
deps is a manual step listed in the `postInstall` messages of templates that
replace existing setups (e.g. the `oxc` template tells the user which Biome/ESLint
packages to remove).

## Tests

Vitest tests live next to the code in `cli/src/**/*.test.ts`:

- `lib/**`: unit tests per module — manifest validation (table-driven) and
  resolution, path containment, EOL-insensitive comparison, the line diff,
  copy policy (`--force`, `--force-scaffold`, `overwrite`, `unmanaged`,
  dry-run), the package.json document (style detection, splice, reformat
  fallback, malformed input), patching, `webBase` validation, `findObsolete`,
  and `adoptionOf`/`judgeCheck`.
- `commands/*.test.ts`, `run.test.ts`: every command run in-process against
  the real templates in scratch directories (`test/cli.ts` → `runInProcess`
  captures consola and stdout and returns the exit code). Each bug fixed in
  the 0.6.0 rework has a test here.
- `docs/pins.test.ts`: `07-conventions.md` and the skill's `tech-stack.md`
  show exactly the pins in `cli/templates/pins.json` (both directions), and
  every manifest installs the pinned range in the pinned section.
- `docs/specs.test.ts`: `01-monorepo-structure.md` shows the current version
  and root pins; the skill spec and `SKILL.md` describe the same stack.
- `templates.test.ts`: every shipped manifest loads and validates, no template
  ships a file its manifest doesn't list, the `core` chain writes each
  destination once, and every template has a skill reference.
- `e2e/dist.test.ts`: the **built bundle** (`node cli/dist/index.js`, as
  `bunx github:…` runs it) against scratch apps — exactly one shebang, the
  executable bit, `--version`, template resolution from the bundle's layout,
  exit codes 1 and 2 across the process boundary, and the regressions that
  used to be shell steps in `tools-ci.yml` (`add hygiene`, `check core
  --strict` on a fresh scaffold, the `webBase.unmanaged` exemption, a leftover
  `biome.json`, `update core --apply` not being a no-op, `--force` keeping
  `wrangler.toml`). Its `globalSetup` (`e2e/build-dist.ts`) runs `bun run
  build` first, so the suite always tests the current source.

**Decision: smoke tests live in vitest, not in workflow YAML.** As shell steps
they only ran in CI; a contributor (or Claude) could not run them before
pushing. `bun run test` rebuilds `cli/dist` as a side effect — a source change
needs a rebuilt, committed bundle anyway.
- `docs.test.ts`: version pins in `07-conventions.md` and the skill's
  `tech-stack.md` match the template manifests (and each other);
  `01-monorepo-structure.md` shows the current version and root pins; the
  "Stack is …" line of `05-skill.md` equals `SKILL.md`'s.
- `version.test.ts`: `WEB_BASE_VERSION` matches the root `package.json` version
  (drift guard); `compareVersions` ordering.

## Error handling

All of these exit 2 with a message (see *Exit codes*):

- Missing template or a name that isn't a template name → `Template "<name>"
  not found.` and the list of available templates.
- Malformed or invalid `manifest.json` → the path and every problem found.
  `listTemplates` reports a broken manifest by path and still lists the rest.
- Missing source file (a manifest lists a `from` that isn't on disk) →
  `Template file not found: <template>/<from>`.
- Circular `extends` → `Circular extends detected: a -> b -> a`.
- Malformed target `package.json` or `webBase` block → the path and the problem.
- Missing target directory (except for `init`, which creates it).
- Write errors (permissions, full disk) → reported, not recovered from.
