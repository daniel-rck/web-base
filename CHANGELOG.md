# Changelog

All notable changes to `web-base` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version is bumped on every change (driven by the conventional-commit type:
`fix:` → patch, `feat:` → minor, breaking → major). Apps catch up with
`web-base update <template> --apply`; the stamped `webBase.version` in an app's
`package.json` records which base it last pulled.

## [Unreleased]

### Changed

- **Breaking: exit codes are 0 / 1 / 2.** `0` ok, `1` the app does not conform
  (`check` drift or `--strict` findings), `2` the command could not run (bad
  usage, unknown option, malformed `package.json` or manifest, missing target
  directory). Everything failed with `1` before; the reusable workflows only
  test for non-zero, so they are unaffected.
- **Breaking: unknown options are rejected** (exit 2). citty ignored them, so
  `check --strcit` ran as a plain `check` and passed.
- **Breaking: a malformed `package.json` is an error, not "unstamped".** The
  readers swallowed parse errors, so `update` reported the app as unstamped
  and `check` silently ignored `webBase.unmanaged`. A missing file is still
  fine where it was before. `webBase.version` and `webBase.unmanaged` are
  type-checked too; `unmanaged` entries are normalized (`./`, backslashes).
- **Breaking: `update` never writes `webBase.unmanaged` files**, and
  `add --force` doesn't either. `update core --apply` — the command
  `notify-apps.yml` sends every app — would have reverted Hausverwaltung's
  `useLiveQuery` fork.
- **Breaking: expanding a meta-template never adopts a block.** `update core
  --apply` installed every missing owned file, including whole blocks an app
  never used (layout and storage into HamsterFlight). A block with no owned
  file present is now reported as `not adopted`; `update <block> --apply` or
  `add <block>` adopts it.
- **Breaking: `init` never overwrites an existing `package.json`**, not even
  with `--force`, which used to delete every app dependency and script.
- **`--force-scaffold` implies `--force`.** On its own it did nothing.
- **The CLI internals were rebuilt around one `package.json` document** (loaded
  once, saved once) and one install path (`applyTemplates`) shared by `init`
  and `add`; `pkg.ts`, `manifest.ts` and `copy.ts` are split into
  `lib/pkg/`, `lib/manifest/` and `lib/files/`.
- **`web-base-check.yml` runs the CLI at the app's stamped version.** `ref`
  now defaults to `""`, which resolves to `v<webBase.version>` from the app's
  `package.json`, or to `main` with a warning when that tag doesn't exist. A
  change on web-base `main` no longer turns every app red. An explicit `ref:`
  works as before.
- **The reusable workflows take Bun from the app.** `bun-version` defaults to
  `""`, so setup-bun reads `packageManager: "bun@x.y.z"`; a warning appears
  when neither is set.
- **`web-app-ci.yml` caches `~/.bun/install/cache`** (setup-bun only caches the
  binary) and skips the separate typecheck when the build script already runs
  `tsc`.
- **`notify-apps.yml` is called by `release.yml`** instead of listening for
  `release: published`, which never fires for a release created with
  `GITHUB_TOKEN`. The issue lists the update steps pinned to the release tag
  (`check` first, then `update core --apply`, `add <template>` for
  package.json changes), and the previous version's issue is closed as not
  planned ("Ersetzt durch #N").
- **All workflows are hardened.** `permissions: {}` with per-job grants,
  timeouts, `persist-credentials: false`, job-level concurrency, actions pinned
  by commit SHA, and inputs only via `env:`, validated. Callers must leave
  `contents: read` to the called jobs (omit `permissions:` or grant it;
  `permissions: {}` fails at startup). Apps should pin `@vX.Y.Z` and let their
  Dependabot bump it.

### Fixed

- **`init --dry-run` no longer fails** ("No package.json found") and writes
  nothing at all — no directory, no `.git`.
- **`add core` without a `package.json` fails before the first write** instead
  of dying after `hygiene` was copied. Files-only templates still work without one.
- **`check router|pwa|worker|hygiene` pass.** Templates that ship only
  scaffold seams always failed with "not on the base at all".
- **`add` no longer stamps over owned files it kept.** The stamp claimed the
  app had pulled the current version, and `update` then mislabeled those files
  as local edits that `--apply` would revert.
- **Manifests are validated, and template paths can't leave their roots.** A
  `to` of `../x` or `/etc/x`, a `from` outside the template, a name that
  doesn't match its directory, an unknown key or a missing `extends` target is
  an error before anything is written; `add /abs/dir` no longer loads
  `/abs/dir/manifest.json`. One broken manifest no longer hides the template list.
- **Line endings don't count as drift.** A checkout with `core.autocrlf=true`
  made every owned file differ.
- **Patching `package.json` keeps its shape.** A dependency the app lists in the
  other section is updated in place instead of duplicated, sorted sections stay
  sorted, and indentation and CRLF line endings survive.
- **`init` detects an enclosing Git work tree** (no nested `.git` in a
  monorepo), creates a missing target directory, validates the app name (it
  becomes the npm name and the workers.dev label) and names "fill in
  `src/features/`" as a next step.
- **`update --apply` without a `package.json`** writes the files and warns that
  it couldn't stamp, instead of failing after writing.

- **The build no longer needs GNU sed.** The shebang comes from
  `bun build --banner`; `sed -i '1i…'` broke `bun install` (via `prepare`) on
  macOS and stacked a second shebang when run twice. `tools-ci.yml` now fails
  on *untracked* files in `cli/dist` too (`git status --porcelain`).
- **Tests stub `WEB_BASE_TEMPLATES_DIR` with `vi.stubEnv`.** Assigning
  `undefined` to `process.env` stores the string `"undefined"`.
- **`web-base-check.yml` put `inputs.ref` and `inputs.template` straight into
  the shell.** They now go through `env:` and are validated against a pattern.
- **The `strict` input description was wrong.** It fails on drift, blocks not
  adopted, partial adoption and obsolete leftovers.
- **`notify-apps.yml` had no timeout, and its dedupe relied on the lagging
  search index.**
- **The CI docs named tags that don't exist** (`@v0.3.0`, `ref: v0.2.1`) and
  contradicted each other on `@main` versus tags.

### Added

- **`web-base pins`** compares an app's `package.json` against the fleet's pin
  table and exits 1 on any mismatch (`behind` / `ahead` / `different`, and a
  missing `packageManager`); packages the app doesn't use are ignored.
  `--apply` rewrites mismatched ranges in place and adds nothing; `--json`
  for CI. The table moved into `cli/templates/pins.json`, the single source
  that `07-conventions.md`, the skill's `tech-stack.md` (which was missing
  `fake-indexeddb`) and every manifest are now tested against in both
  directions. `workbox-routing`, `-strategies` and `-expiration` join it.
- **`check --diff` and `update --diff`** print a unified diff (local →
  template, `git apply -p1`-compatible) for every differing file; `update`
  includes scaffold seams, so upstream seam changes can be ported by hand.
- **`check --json`** prints a machine-readable result (`schemaVersion: 1`,
  documented in `02-cli.md`) on stdout, keeping warnings on stderr; errors
  become a `{ ok: false, exitCode: 2, error }` envelope.
- **The CI smoke tests run locally.** The shell steps in `tools-ci.yml`
  (`add hygiene`, `check --strict` on a fresh scaffold, the
  `webBase.unmanaged` exemption, a leftover `biome.json`, `update core`
  restoring files, `--force` keeping `wrangler.toml`) are a vitest e2e suite
  against the built bundle, plus checks for the shebang, `--version` and exit
  codes across the process boundary. `bun run test` rebuilds `cli/dist` first.
- **Root `vitest.config.ts`** scopes the repo's tests to `cli/src` and
  `cli/test`, so test files shipped inside templates are never collected here.
- **A `SessionStart` hook** (`.claude/`) installs dependencies in Claude Code
  cloud sessions so the `typecheck`/`lint`/`test` gatekeepers can run.
- **Releases are cut from the version in `package.json`.** `release.yml` runs
  on every push to `main`; when that version has no release yet it tags
  `vX.Y.Z` (lightweight) on the commit and publishes a GitHub release whose
  notes are the version's CHANGELOG section, then notifies the apps. Pushes
  that don't bump are a no-op; a missing CHANGELOG section or a tag that
  already points elsewhere fails the run. `workflow_dispatch` with a `sha`
  backfills an older `main` commit (`06-workflows.md` lists the SHAs for
  0.3.0–0.5.0, which were never tagged).
- **`web-base-check.yml` takes `pins` and `bun-version` inputs.** `pins: true`
  also runs `web-base pins` (needs a ref of v0.6.0 or later). Every check now
  passes `--diff`, so a failing run shows what drifted.
- **Dependabot keeps the pinned actions current:** one grouped `chore(deps)`
  PR a week, for releases at least seven days old.

## [0.5.0] - 2026-09-22

### Added

- **`check` and `update` report leftovers of a superseded setup.** Manifests
  can declare `obsolete` files and packages; the `oxc` template lists
  `biome.json`, `biome.base.json` and `@biomejs/biome`. Both commands warn,
  `check --strict` fails, nothing is deleted automatically — a leftover config
  may still hold overrides that need porting first.
- **`docs.test.ts` guards the version pins in the docs.** `07-conventions.md`
  and the skill's `tech-stack.md` must match the template manifests and each
  other, `01-monorepo-structure.md` must show the current version and root
  pins, and the skill spec's stack line must equal `SKILL.md`'s.

### Fixed

- **The skill's `tech-stack.md` was a round of bumps behind** (jsdom 29 vs 30,
  `@testing-library/jest-dom` 6 vs 7, and most other pins).
  `01-monorepo-structure.md` showed version 0.3.0 and `05-skill.md` TypeScript 6.
- **The 0.4.0 migration note named the wrong command.** `update` never patches
  `package.json`; apps switch to oxlint + oxfmt with `web-base add oxc`.

## [0.4.0] - 2026-09-22

### Changed

- **Biome is replaced by oxlint + oxfmt.** The `biome` template is now `oxc`
  (and `core` extends it). It ships `oxlint.base.json` (owned, shared rules),
  `.oxlintrc.json` (scaffold, `extends` the base and holds per-app
  `overrides`), `.oxfmtrc.json` (owned) and `.prettierignore` (scaffold,
  per-app formatter exclusions — oxfmt has no `extends`). `lint` becomes
  `oxlint && oxfmt --check`, `format` becomes `oxfmt`. The web-base repo itself
  switched too.

  **Decision:** oxlint uses ESLint rule names and ports the `react-hooks`,
  `jsx-a11y`, `unicorn` and `vitest` plugins; oxfmt is Prettier-compatible and
  sorts imports. `sortImports.newlinesBetween: false` keeps Biome's ungrouped
  import order, so switching reformats very little.

  Three rules are off in the base because they misfire on the templates:
  `no-underscore-dangle` (`self.__WB_MANIFEST`),
  `unicorn/require-post-message-target-origin` (`BroadcastChannel` has no
  target origin) and `jsx-a11y/prefer-tag-over-role` (the spinner's
  `role="status"`). `useLiveQuery` suppresses `react/refs` and
  `react/exhaustive-deps` on its latest-ref and forwarded-`deps` lines, and
  listens with `addEventListener` instead of `onmessage`.

  Apps migrate with `web-base add oxc` (copies the new configs, switches the
  scripts, adds the devDeps; `update` only touches files), then: delete `biome.json`
  and `biome.base.json`, drop `@biomejs/biome`, move Biome `overrides` into
  `.oxlintrc.json` (lint) or `.prettierignore` (format), rewrite
  `// biome-ignore` as `// oxlint-disable-next-line <rule> -- <reason>`, and
  run `bunx oxlint --fix && bunx oxfmt && bun run lint`.

## [0.3.1] - 2026-09-02

### Fixed

- **`AppShell` broke `position: sticky` for the whole page.** `<main>` had
  `overflow-y-auto`, which makes it the scroll container — and an overflow
  container captures every descendant sticky element without ever scrolling
  itself, so sticky headers and toolbars anywhere in the page silently stopped
  working. The window is the scroll container now; `min-w-0` also stops wide
  content from stretching the page past the viewport. Promoted from
  Tennisturnier, which had diagnosed and fixed it locally.

- **The shell ignored iOS safe-area insets.** The bottom nav sat under the home
  indicator and the main region's bottom padding didn't account for it.
  Promoted from Pizzateig.

- **`useTheme` crashed where `localStorage` throws.** Safari's private mode and
  "block all cookies" make the accessor itself throw rather than return null,
  which took the whole app down at first paint. Reads and writes are guarded
  now. Promoted from Pizzateig.

- **`check` treated a partially adopted block as drift.** Taking `primitives`
  and `InstallButton` without `AppNav` is the right call for a single-route
  app, and the guard called it a hole. Absence is now never drift — only
  differing content is. An app that has adopted nothing at all still fails, and
  `--strict` remains the opt-in for asserting full adoption.

- **`useLiveQuery` could overwrite fresh data with stale data.** A mutation can
  re-run the query while an earlier run is still awaiting, and IndexedDB gives
  no ordering guarantee between them — so the slower, older query could resolve
  last and win. The hook now tracks a run token and only lets the most recently
  started run commit.

  Found by wiring the drift guard into the apps for the first time: Pizzateig
  had fixed this locally and the divergence showed up as drift. Promoted here
  so every app gets it, which is what the owned/scaffold split is for.

### Changed

- **The Biome config is now two files.** `biome.base.json` carries the shared
  rules and is `owned`; `biome.json` extends it, holds per-app `overrides`, and
  is `scaffold`.

  **Decision: a single owned `biome.json` cannot survive contact with the
  fleet.** Four apps have overrides that are load-bearing and correct —
  Tonspur turns the formatter off for two generated data modules whose
  generator would otherwise re-break lint on every run, HamsterFlight scopes a
  `noRestrictedGlobals` deny-list to `src/sim/**` as the lint half of its
  sim-purity guard, and two apps relax `noNonNullAssertion` in tests. Under one
  owned file each of those reads as permanent drift, which leaves only bad
  options: turn the drift guard off in exactly the repos that need it, or run
  them red forever. Splitting lets `check` guard the shared rules byte-for-byte
  while apps keep their seams. Verified that Biome 2.5.11 resolves a
  relative-path `extends` and layers app `overrides` on top of the inherited
  rules.

  Apps already on 0.3.0 rename their `biome.json` to `biome.base.json` and add
  a thin `biome.json` that extends it.

- **`tsconfig.sw.json` and `tsconfig.worker.json` are `scaffold`.** They carry
  `include` paths, `types` and `tsBuildInfoFile` — Pizzateig's worker needs
  `allowImportingTsExtensions`, Tennisturnier's compiles `functions/**` too.
  The strictness they encode is the point; the file around it is per-app.

- **`public/theme-init.js` and `src/lib/ui/index.ts` are `scaffold`**, for the
  same reason. The theme-init script's own header says an app that persists the
  theme elsewhere adapts the read — Tennisturnier carries a one-time migration
  off its old storage key, Zeiterfassung reads a settings blob — so it was never
  going to be byte-identical. And a barrel lists what the app actually has:
  Tonspur exports `InstallButton` and `primitives` and nothing else, because it
  has nothing else.

- **`src/lib/db/index.ts` is `scaffold`.** The db barrel is the app's own
  public surface: Tonspur exports `getKV`/`setKV` and no `useLiveQuery` because
  it has none, Pizzateig re-exports its recipes module. A shared template cannot
  own a list of what each app happens to contain.

- **`CONTRIBUTING.md` and `.editorconfig` are `scaffold`**, joining `LICENSE`
  and `SECURITY.md` — so every file in the `hygiene` template is now a per-app
  starting point.

  Same reasoning as the Biome split, found the same way. Four of the nine apps
  had rewritten CONTRIBUTING.md substantially, and rightly: it documents the
  app's real quality gates (`bun run verify` in one repo, `lint`/`typecheck`/
  `test` in another) and its architecture warnings. `.editorconfig` likewise
  grows sections for whatever languages a repo actually contains. As `owned`
  files those read as permanent drift, and `check` would demand reverting
  genuinely better content.

## [0.3.0] - 2026-09-02

Fleet-alignment release. The nine app repos had drifted far enough that the
tooling meant to prevent drift could not be used to fix it; this release repairs
that machinery first, then raises the baseline it distributes.

### Fixed

- `update <meta-template>` did nothing. `update` loaded a single manifest and
  never expanded `extends`, so `update core --apply` — the command
  `notify-apps.yml` sends to every app — printed "has no files to update" and
  exited. It now walks the resolved leaf chain, exactly like `add`.
- `update pwa --apply` re-created `vite.snippet.md`, a file the same template's
  `postInstall` tells the app to delete after merging it into `vite.config.ts`.
  The snippet is now a `scaffold` file, so a deleted one stays deleted.
- `add --force` / `init --force` ignored the owned/scaffold policy and
  overwrote per-app seams: `theme.css`, `db.ts`, `routes.ts`, `router.tsx`,
  `sw.ts`, `worker/index.ts`, `wrangler.toml`, `LICENSE`, `SECURITY.md`.
  `--force` now re-pulls owned building blocks only; the new `--force-scaffold`
  opts into clobbering seams.
- `init` blocked on an interactive prompt when `--name` was omitted, hanging any
  non-TTY caller. It now fails with a clear message instead of prompting when
  there is no TTY.
- `init` never created a Git repo despite `02-cli.md` documenting that it does —
  and the `biome.json` it ships sets `vcs.useIgnoreFile: true`, so linting a
  fresh scaffold misbehaved. `init` now runs `git init` when the target is not
  already a repo.
- `update` re-implemented the apply decision inline instead of calling the
  exported, unit-tested `shouldApplyUpdate`. The two could drift; now there is
  one code path.
- The repo declared `license: "MIT"` and required a `LICENSE` in its own file
  checklist without shipping one. Added.

### Added

- **`AppShell` takes an optional `themeToggle` slot.** The built-in toggle is
  labelled in German, so an app with i18n previously had to either drop it from
  the shell or ship a second control elsewhere — Tennisturnier did both.

- **`SectionCard` and `Chip` primitives, and a `Card interactive` prop.**
  Promoted from Pizzateig, which had grown all three locally. A titled section
  wrapper and a selectable pill are needed in every app in the fleet, and
  writing them per repo is how design systems diverge. `Chip` uses
  `text-fg-on-accent` rather than the hard-coded `text-white` it was promoted
  with.

- **The bottom nav marks its active item with a pill behind the icon**, not
  just a tint on icon and label. At that size a tint alone is easy to miss.
  Promoted from Pizzateig; the label keeps the template's `truncate`, which the
  original had dropped.

- `web-base check --strict` fails when an owned base file is *missing*, not only
  when it differs. Without it, an app that has adopted nothing passes the guard;
  the default stays lenient (an absent block can legitimately mean the app does
  not use it) but now warns when nothing at all matched.
  `web-base-check.yml` gained a matching `strict` input.
- `public/theme-init.js` ships with the `layout` template as an owned file, and
  is now the canonical anti-flash mechanism. It replaces the inline `<head>`
  snippet because an app with a Worker CSP otherwise has to pin a `sha256-` hash
  of that snippet — a hash that silently breaks the theme whenever the snippet
  changes. `script-src 'self'` is both simpler and stricter. `themeInitScript`
  remains exported for apps that must inline it.
- `--color-fg-on-accent` in `theme.css`: a foreground token for text on a
  saturated fill. `--color-fg` is near-black in light mode, so it is the wrong
  token for a primary button, which is why apps had been hard-coding
  `text-white` there.
- `erasableSyntaxOnly: true` in `tsconfig.sw.json` and `tsconfig.worker.json` —
  six of the nine apps had already adopted it independently.
- `notify-apps.yml` now covers all nine app repos. It previously named three.

### Changed

- Stack pins raised to the newest coherent set across the fleet: TypeScript
  `^7.0.2`, `@types/node` `^26.4.0`, `@cloudflare/workers-types` `^5.20260706.1`,
  `@biomejs/biome` `^2.5.11`, `wrangler` `^4.127.1`.
- `biome.json` migrated to the Biome 2.5 schema (`rules.recommended: true` →
  `rules.preset: "recommended"`).

### Documented (previously shipped without a changelog entry)

- `web-base check` and `web-base-check.yml`, the CI drift guard.
- The `owned` / `scaffold` file policy in template manifests.
- `notify-apps.yml`, the release-to-issue notifier.

## [0.2.1] - 2026-06-12

### Fixed

- `bunx github:daniel-rck/web-base …` failed with `could not determine
  executable to run`: the `bin` entry `cli/dist/index.js` was gitignored, and
  Bun does not run `prepare` for Git dependencies, so the installed package
  contained no executable. The bundled `cli/dist/index.js` is now committed;
  `tools-ci.yml` fails when it drifts from a fresh build of `cli/src/`.

### Added

- Release process: every version bump gets a `vX.Y.Z` tag on `main` after
  merge, so apps can pin `web-base-check.yml` (and `bunx`) to the version
  recorded in their `webBase.version` stamp.

## [0.2.0] - 2026-05-31

### Added

- Manual theme toggle in the `layout` template: `ThemeToggle` (auto-mounted in
  the header, cycles system → light → dark), the `useTheme` hook, and the
  `themeInitScript` constant for flash-free initialization.
- Base-version stamping: `init`, `add`, and `update --apply` write
  `webBase.version` into the consuming app's `package.json`.
- `web-base update` reports whether an app is current, behind, ahead, or
  unstamped relative to the installed web-base version.
- This `CHANGELOG.md`.

### Changed

- `theme.css` dark mode is now a three-state model (`data-theme` on `<html>`:
  absent = follow the OS, `"dark"`/`"light"` = forced) layered on top of
  `prefers-color-scheme`, plus a `@custom-variant dark` so Tailwind `dark:`
  utilities follow the manual choice.
- The CLI version is now a single source of truth in `cli/src/version.ts`
  (`WEB_BASE_VERSION`), kept in sync with `package.json` by a drift-guard test.

## [0.1.0]

- Initial baseline: CLI (`init`/`add`/`update`), templates (`core`, `hygiene`,
  `biome`, `layout`, `storage`, `pwa`, `router`, `worker`, `sync`), the Claude
  Code skill, and the reusable GitHub Actions workflow.
