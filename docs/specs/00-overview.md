# 00 — Overview

`daniel-rck/web-base` is a monorepo combining three concerns for personal
web apps (ErinnerMich, HamsterFlight, Hausverwaltung, Minispiele, Pizzateig,
Tankzettel, Tennisturnier, Tonspur, Zeiterfassung):

1. A **CLI** (`cli/`) that copies templates into target app repos — shadcn-style,
   "distribution by copy, not by dependency."
2. A **Claude Code skill** (`skill/`) documenting the conventions and pointing
   at the CLI commands.
3. **Reusable GitHub Actions workflows** the apps call via `workflow_call`:
   `web-app-ci.yml` (lint, typecheck, test, build) and `web-base-check.yml`
   (the drift guard).

All three are kept together so a single PR can update the convention, its
template implementation, and its documentation at once.

## Goals

- **One canonical baseline** across all the web apps. No drift on
  versions, tooling, layout, or conventions unless explicitly intended.
- **Updates flow** from this repo into apps with one command (`web-base update <template>`).
  web-base carries one incrementing version (`cli/src/version.ts`); apps are
  stamped with the version they last pulled (`webBase.version` in their
  `package.json`), so `update` can report whether an app is behind. See `02-cli.md`.
- **New apps** scaffold in seconds (`web-base init` — an app that installs,
  typechecks, tests and builds; CI proves it on every change).
- **Cross-cutting changes** (e.g. bumping React, switching linters) happen once
  here, propagate to apps via `update`.
- **Flexible, but built from shared blocks.** Each template file is either an
  `owned` building block (centrally managed, `update` overwrites it) or a
  `scaffold` seam (per-app starting point, `update` never touches it). Apps
  customize by editing the seams (`theme.css` accent, `db.ts` schema, routes,
  handlers) and composing the owned blocks from `features/` — so upstream fixes
  flow into the machinery without clobbering app-specific code. See `02-cli.md`.

## Non-goals

- Not a UI library published on npm. Code lives in the apps after copying.
- Not a starter template repo. It's a CLI; running `init` produces the same
  result, but updates are first-class.
- Not a shared backend or shared service. Each app has its own Worker.

## What goes where in this repo

```
web-base/
├── README.md
├── CLAUDE.md
├── CHANGELOG.md
├── package.json          # bin: web-base → cli/dist/index.js
├── tsconfig.json
├── tsconfig.templates.json  # typechecks the sync client template
├── vitest.config.ts
├── .oxlintrc.json
├── .oxfmtrc.json
├── .claude/              # SessionStart hook for cloud sessions
├── .github/
│   ├── dependabot.yml    # keeps the pinned actions current
│   └── workflows/
│       ├── web-app-ci.yml      # reusable workflow for apps
│       ├── web-base-check.yml  # reusable drift guard for apps
│       ├── release.yml         # tag + GitHub release per version, then notify
│       ├── notify-apps.yml     # "update available" issue per app
│       └── tools-ci.yml        # CI for this repo (incl. a scaffolded app)
├── cli/
│   ├── src/
│   │   ├── index.ts          # → run.ts (dispatch, exit codes)
│   │   ├── commands/         # init, add, update, check, pins (+ shared helpers)
│   │   ├── lib/              # manifest/, files/, pkg/, diff/, apply, check, …
│   │   ├── docs/             # doc guards: specs show what the repo does
│   │   └── e2e/              # the built bundle against scratch apps
│   ├── dist/index.js         # the committed bundle
│   ├── test/sync/            # tests of the sync template (pure TS)
│   ├── template-tests/       # React/IDB template tests, run in a scaffolded app
│   └── templates/
│       ├── pins.json         # the fleet's version pins (single source)
│       ├── app/              # core + entry files (what `init` applies)
│       ├── core/             # meta-template: extends the others
│       ├── hygiene/          # LICENSE, CONTRIBUTING, SECURITY, .editorconfig
│       ├── oxc/              # oxlint + oxfmt configs + scripts
│       ├── testing/          # Vitest + jsdom + fake-indexeddb setup
│       ├── layout/           # AppShell, primitives, tokens.css + theme.css
│       ├── storage/          # idb opener + useLiveQuery
│       ├── pwa/              # injectManifest SW + update prompt
│       ├── router/           # react-router-dom 7, layout route, error pages
│       ├── worker/           # Cloudflare Worker /api routing, _headers
│       ├── backup/           # JSON export/import/wipe (extra)
│       └── sync/             # R2 E2E-encrypted sync, QR pairing (extra)
├── skill/
│   ├── SKILL.md
│   └── references/           # one per template, plus tech-stack.md and ci.md
└── docs/
    └── specs/
        └── (this directory)
```

## Implementation order

If implementing this repo from scratch, build in this order so each step is
verifiable on its own:

1. **Monorepo scaffolding** → `01-monorepo-structure.md`
   - Root `package.json`, `tsconfig.json`, `.oxlintrc.json`, `.oxfmtrc.json`, `README.md`, `CLAUDE.md`.
   - Verify: `bun install`, `bun run typecheck`, `bun run lint` succeed on an empty CLI.

2. **CLI core** → `02-cli.md`
   - `cli/src/{index,cli,run,exit}.ts`, `lib/` (manifest, files, pkg, apply, check, …), `commands/{init,add,update,check,pins}.ts`.
   - Verify: `bun run build` produces a working `cli/dist/index.js`, `node cli/dist/index.js --help` works.

3. **Templates** → `03-templates.md`
   - One template at a time. Each ships with `manifest.json` + its files.
   - Start with `hygiene` (smallest), then `oxc`, then `layout`, then the rest.
   - Verify per template: `bun run test` (manifest validation, doc guards), then
     `node cli/dist/index.js add <template> --cwd <scratch>` and inspect the output;
     the `scaffold` job in `tools-ci.yml` builds and tests a whole app.

4. **Workflows** → `06-workflows.md`
   - `web-app-ci.yml`, `web-base-check.yml`, `release.yml`, `notify-apps.yml`, `tools-ci.yml`.
     Verify with actionlint and zizmor locally, then by watching `tools-ci.yml` pass.

5. **Skill** → `05-skill.md`
   - `SKILL.md` + `references/*.md`. Mostly documentation, no execution to verify.

6. **App migrations** → `08-app-migrations.md`
   - One app at a time, smallest changes first. That spec records the actual
     state of all nine apps and the deviations each has earned.

## Cross-cutting docs

These describe *what* the apps should look like — they apply across the CLI
templates and the skill references:

- `04-layout-system.md` — the shared UI structure and design tokens
- `07-conventions.md` — stack pins, anti-patterns, lokal-first rules

## Conventions for these specs

- One topic per file, named `NN-topic.md` with a numeric prefix for sort order.
- Each spec is a complete description of its topic, not a diff against
  something else. Diffs live in `08-app-migrations.md`.
- Code examples are normative: they show the exact shape the implementation
  should take. Identifiers and file paths are not flexible unless marked
  "example" or "illustrative."
- When a decision is intentional but might surprise, prefix the paragraph with
  **Decision:** and explain the alternative that was rejected.
