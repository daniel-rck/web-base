---
name: daniel-rck-web-app
description: Conventions and patterns for the personal web apps under daniel-rck (ErinnerMich, HamsterFlight, Hausverwaltung, Minispiele, Pizzateig, Tankzettel, Tennisturnier, Tonspur, Zeiterfassung, and future apps). Stack is React 19 + Vite 8 + Tailwind 4 + TypeScript 7 + Bun + Cloudflare Workers + idb + injectManifest PWA + react-router-dom 7 + oxlint + oxfmt. Use this skill whenever working in any of these repos, scaffolding a new app in the same style, migrating an existing app to the shared baseline, or whenever the user mentions "my web apps", "Hausverwaltung", "Tennisturnier", "ErinnerMich", "Minispiele", "Tankzettel", "Zeiterfassung", "Pizzateig", "Tonspur", "HamsterFlight", or similar personal browser-based PWAs. Also use whenever the @daniel-rck/web-base CLI is mentioned or when copy-pasting shared layout, storage, PWA, worker, or sync code between these repos.
---

# daniel-rck Web App Conventions

This skill documents the conventions for a small family of personal web apps.
They share one design language, one stack, and one CLI for scaffolding. The
goal is no drift: a fix in one app's foundations should land in all of them
through `@daniel-rck/web-base`.

## The apps in scope

| App | Domain | Hosted at |
|---|---|---|
| ErinnerMich | Erinnerungen, Habits, Mood | `erinnermich.daniel-rck.workers.dev` |
| Hausverwaltung | Mieter-, Objekt- und Abrechnungsverwaltung | `hausverwaltung.daniel-rck.workers.dev` |
| Minispiele | Browser-Minispiele | `minispiele.daniel-rck.workers.dev` |
| Pizzateig | Teigrechner nach Bäcker-Prozent | `pizzateig.daniel-rck.workers.dev` |
| Tankzettel | Tankbelege erfassen und auswerten | `tankzettel.daniel-rck.workers.dev` |
| Tennisturnier | Turnierplanung, Spielpläne, Ergebnisse | `tennisturnier.daniel-rck.workers.dev` |
| Tonspur | Titelmelodie-Ratespiel | `tonspur.daniel-rck.workers.dev` |
| Zeiterfassung | Timer, Projekte, Reports, Rechnungen | `zeiterfassung.daniel-rck.workers.dev` |
| HamsterFlight | pixi.js-Portierung eines Flash-Spiels | `hamsterflight.daniel-rck.workers.dev` |

**HamsterFlight is the deliberate exception**: a pixi.js canvas game with no
React, no Tailwind, no router, no `src/lib/ui` and no PWA. It shares the
tooling baseline (Bun, oxlint + oxfmt, CI, hygiene) and nothing else. Don't "align" its
rendering code, and never run `web-base check --strict` there — see
[`08-app-migrations.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/08-app-migrations.md).

Future apps follow the same shape unless the deviation is documented in their
own `docs/specs/`.

## The baseline stack

- React 19, Vite 8, Tailwind 4
- TypeScript 7, strict + `noUncheckedIndexedAccess`
- Bun as runtime + package manager (no npm/yarn/pnpm lockfiles)
- Cloudflare Workers + Workers Assets (one Worker per app)
- IndexedDB via `idb` + a small `useLiveQuery` hook
- PWA via `vite-plugin-pwa` with `injectManifest`
- `react-router-dom` 7 with typed route constants
- oxlint + oxfmt (replace ESLint + Prettier and Biome)
- Optional extras: R2 end-to-end-encrypted sync with QR/link pairing (`sync`),
  JSON backup / restore / wipe (`backup`)

Exact version pins live in `references/tech-stack.md`.

## The CLI

`@daniel-rck/web-base` is a shadcn-style CLI: it copies templates *into* the
app repo. When working in any of these web app repos, prefer running the CLI
over hand-copying snippets. The CLI is the source of truth; this skill
documents the why and when. Pin it to a release (`#vX.Y.Z`) so the templates
match the app's stamp.

```bash
bunx github:daniel-rck/web-base#vX.Y.Z init --name <app>   # a new app that builds (the `app` template)
bunx github:daniel-rck/web-base#vX.Y.Z add core            # all shared pieces; also patches package.json
bunx github:daniel-rck/web-base#vX.Y.Z add backup          # extras: backup, sync
bunx github:daniel-rck/web-base#vX.Y.Z check               # fail on drift in owned files (--strict, --diff, --json)
bunx github:daniel-rck/web-base#vX.Y.Z update core --diff  # what update would change
bunx github:daniel-rck/web-base#vX.Y.Z update core --apply # pull the owned files of the blocks the app uses
bunx github:daniel-rck/web-base#vX.Y.Z pins                # dependency versions vs. the fleet's pins (--apply)
```

- **Files are `owned` or `scaffold`.** Owned building blocks (UI primitives,
  `tokens.css`, `useLiveQuery`, `src/sw/base.ts`, `worker/base.ts`, the sync
  machinery, `oxlint.base.json`) are never edited in an app — `update --apply`
  overwrites them. Scaffold seams (`theme.css`, `db.ts`, routes, `src/App.tsx`,
  `worker/index.ts`, `wrangler.toml`, `public/_headers`) are the app's.
- **`update` changes files only, never `package.json`.** New dependencies or
  scripts arrive with `add <template>`, which skips existing files. Expanding
  `core`, `update` never installs a block the app doesn't use.
- **`--force`** re-pulls owned files on `add`; **`--force-scaffold`** also
  overwrites seams (it implies `--force`) and destroys per-app work. `--dry-run`
  writes nothing.
- **`webBase.unmanaged`** in `package.json` takes single owned files off the
  base (Hausverwaltung's `useLiveQuery`): `check` skips them, `update` and
  `add --force` never write them. A last resort, recorded in 08.
- **`check --strict`** also fails on blocks not (fully) adopted and on
  leftovers of a replaced setup — only for apps on the full template, never in
  HamsterFlight.
- **Exit codes:** `0` ok, `1` the app doesn't conform (drift, `pins` mismatch),
  `2` the command couldn't run (bad usage, unknown option, malformed
  `package.json`).

**`check` is the authority on conformance, not the `webBase.version` stamp.**
The stamp records which base an app last pulled from — provenance, not proof.
Apps wire `web-base-check.yml` into CI, which runs the CLI at the app's stamped
version.

## Architecture invariants

1. **Lokal-first.** App data in IndexedDB. No required account, no email, no
   third-party telemetry. `localStorage` is for settings only.
2. **DSGVO-konform by construction.** Any sync uses client-side AES-GCM
   encryption; the server only sees ciphertext.
3. **German UI + README, English source.** UI strings and `README.md` are
   German. Identifiers, comments, commit messages, and `docs/specs/` are
   English.
4. **MIT license.** Sub-dependencies must be MIT, Apache-2.0, BSD, or ISC.
   AGPL-3.0 is excluded.
5. **One web app, one Cloudflare Worker.** No shared backend across apps;
   shared infrastructure is *copied* via the CLI, not deployed as a runtime
   service.
6. **Specs in `docs/specs/`.** Living documents, no archiving. Git for
   history. web-base's own specs are at
   [`daniel-rck/web-base/docs/specs`](https://github.com/daniel-rck/web-base/blob/main/docs/specs).

## When to consult which reference

Each reference matches a CLI template under `cli/templates/<name>/`, so the
convention and its template stay aligned. Don't read all references upfront —
pick what's relevant to the current task.

| Working on… | Reference |
|---|---|
| Dependency versions, package.json template, tsconfig | `tech-stack.md` |
| A brand-new app (`init`, entry files, vite.config.ts) | `app.md` |
| oxlint + oxfmt config (linter rules, formatter settings) | `oxc.md` |
| LICENSE, CONTRIBUTING, SECURITY, .editorconfig | `hygiene.md` |
| AppShell, design tokens, per-app accent, a11y rules | `layout-system.md` |
| idb patterns, useLiveQuery, migrations, connection lifecycle | `storage.md` |
| Vitest setup, fake-indexeddb, component tests | `testing.md` |
| injectManifest, the service worker, update prompt | `pwa.md` |
| react-router-dom 7, layout route, error pages | `router.md` |
| /api/* routing, security headers, R2 bindings, wrangler | `worker.md` |
| Export / import / wipe of the app's data | `backup.md` |
| E2E-encrypted device sync, QR pairing | `sync.md` |
| Reusable workflows (CI, drift guard), release pinning | `ci.md` |

## Anti-patterns

- **ESLint + Prettier, Biome** → oxlint + oxfmt (ESLint-compatible rules, Prettier-compatible output, one shared base config).
- **Dexie** → idb (lighter, less magic, our `useLiveQuery` is ~80 lines).
- **localStorage for app data** → idb (synchronous, no queries, size-limited).
- **generateSW, or `skipWaiting()` on install** → injectManifest with a
  prompt-based update (open tabs would lose their lazy chunks after a deploy).
- **Skipping react-router** → always include it (cheap to add, painful to
  retrofit).
- **Per-repo CI duplication** → reusable workflows from web-base.
- **Starter template repo for existing apps** → the CLI handles updates too.
- **Custom monorepo (Turborepo, Nx)** → nine repos and one tooling repo are
  enough.
- **Editing an owned file in one app** → change the template (and spec), or,
  as a documented last resort, `webBase.unmanaged`.
- **Per-app Tailwind config overrides, or editing `tokens.css`** → the
  `theme.css` seam: `--accent-h` and app-specific tokens.
- **shadcn/ui as a dependency** → shadcn-style *copy*, no Radix UI.

## When this skill is wrong

Explicit deviations are fine but must be documented in the deviating app's
`docs/specs/`. Drift without documentation is a bug.
