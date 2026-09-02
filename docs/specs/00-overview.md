# 00 — Overview

`daniel-rck/web-base` is a monorepo combining three concerns for personal
web apps (ErinnerMich, HamsterFlight, Hausverwaltung, Minispiele, Pizzateig,
Tankzettel, Tennisturnier, Tonspur, Zeiterfassung):

1. A **CLI** (`cli/`) that copies templates into target app repos — shadcn-style,
   "distribution by copy, not by dependency."
2. A **Claude Code skill** (`skill/`) documenting the conventions and pointing
   at the CLI commands.
3. A **reusable GitHub Actions workflow** (`.github/workflows/web-app-ci.yml`)
   the apps call via `workflow_call`.

All three are kept together so a single PR can update the convention, its
template implementation, and its documentation at once.

## Goals

- **One canonical baseline** across all the web apps. No drift on
  versions, tooling, layout, or conventions unless explicitly intended.
- **Updates flow** from this repo into apps with one command (`web-base update <template>`).
  web-base carries one incrementing version (`cli/src/version.ts`); apps are
  stamped with the version they last pulled (`webBase.version` in their
  `package.json`), so `update` can report whether an app is behind. See `02-cli.md`.
- **New apps** scaffold in seconds (`web-base init`).
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
├── package.json          # bin: web-base → cli/dist/index.js
├── tsconfig.json
├── biome.json
├── .github/
│   └── workflows/
│       ├── web-app-ci.yml      # reusable workflow for apps
│       ├── web-base-check.yml  # reusable drift guard for apps
│       ├── notify-apps.yml     # release → "update available" issue per app
│       └── tools-ci.yml        # CI for this repo
├── cli/
│   ├── src/
│   │   ├── index.ts          # citty entry
│   │   ├── commands/         # init.ts, add.ts, update.ts, check.ts
│   │   └── lib/              # manifest.ts, copy.ts, pkg.ts
│   └── templates/
│       ├── core/             # meta-template: extends the others
│       ├── hygiene/          # LICENSE, CONTRIBUTING, SECURITY, .editorconfig
│       ├── biome/            # biome.json + scripts
│       ├── layout/           # AppShell + theme.css + design tokens
│       ├── storage/          # idb + useLiveQuery
│       ├── pwa/              # injectManifest + sw.ts
│       ├── router/           # react-router-dom 7 scaffold
│       ├── worker/           # Cloudflare Worker /api routing
│       └── sync/             # R2+KV E2E-encrypted sync (extra)
├── skill/
│   ├── SKILL.md
│   └── references/
│       ├── tech-stack.md
│       ├── layout-system.md
│       ├── storage.md
│       ├── pwa.md
│       ├── worker.md
│       ├── sync.md
│       ├── ci.md
│       ├── biome.md
│       ├── router.md
│       └── hygiene.md
└── docs/
    └── specs/
        └── (this directory)
```

## Implementation order

If implementing this repo from scratch, build in this order so each step is
verifiable on its own:

1. **Monorepo scaffolding** → `01-monorepo-structure.md`
   - Root `package.json`, `tsconfig.json`, `biome.json`, `README.md`, `CLAUDE.md`.
   - Verify: `bun install`, `bun run typecheck`, `bun run lint` succeed on an empty CLI.

2. **CLI core** → `02-cli.md`
   - `cli/src/index.ts`, `lib/manifest.ts`, `lib/copy.ts`, `lib/pkg.ts`, `commands/{init,add,update}.ts`.
   - Verify: `bun run build` produces a working `cli/dist/index.js`, `node cli/dist/index.js --help` works.

3. **Templates** → `03-templates.md`
   - One template at a time. Each ships with `manifest.json` + its files.
   - Start with `hygiene` (smallest), then `biome`, then `layout`, then the rest.
   - Verify per template: create a scratch repo, run `bunx . add <template>`, inspect output.

4. **Reusable workflow** → `06-workflows.md`
   - `web-app-ci.yml`. Verify by pushing this repo and watching `tools-ci.yml` pass.

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
