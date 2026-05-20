---
name: daniel-rck-web-app
description: Conventions and patterns for the personal web apps under daniel-rck (Hausverwaltung, Tennisturnier, ErinnerMich, and future apps). Stack is React 19 + Vite 8 + Tailwind 4 + TypeScript 6 + Bun + Cloudflare Workers + idb + injectManifest PWA + react-router-dom 7 + Biome. Use this skill whenever working in any of these repos, scaffolding a new app in the same style, migrating an existing app to the shared baseline, or whenever the user mentions "my web apps", "Hausverwaltung", "Tennisturnier", "ErinnerMich", or similar personal browser-based PWAs. Also use whenever the @daniel-rck/web-base CLI is mentioned or when copy-pasting shared layout, storage, PWA, worker, or sync code between these repos.
---

# daniel-rck Web App Conventions

This skill documents the conventions for a small family of personal web apps.
They share one design language, one stack, and one CLI for scaffolding. The
goal is no drift: a fix in one app's foundations should land in all of them
through `@daniel-rck/web-base`.

## The apps in scope

| App | Domain | Hosted at |
|---|---|---|
| Hausverwaltung | Mieter-, Objekt- und Abrechnungsverwaltung | `hausverwaltung.daniel-rck.workers.dev` |
| Tennisturnier | Turnierplanung, Spielpläne, Ergebnisse | `tennisturnier.daniel-rck.workers.dev` |
| ErinnerMich | Erinnerungen, Push-Benachrichtigungen | `erinnermich.daniel-rck.workers.dev` |

Future apps follow the same shape unless the deviation is documented in their
own `docs/specs/`.

## The baseline stack

- React 19, Vite 8, Tailwind 4
- TypeScript 6, strict + `noUncheckedIndexedAccess`
- Bun as runtime + package manager (no npm/yarn/pnpm lockfiles)
- Cloudflare Workers + Workers Assets (one Worker per app)
- IndexedDB via `idb` + a small `useLiveQuery` hook
- PWA via `vite-plugin-pwa` with `injectManifest`
- `react-router-dom` 7 with typed route constants
- Biome (replaces ESLint + Prettier)
- Optional: R2 + KV E2E-encrypted sync (see `sync` template)

Exact version pins live in `references/tech-stack.md`.

## The CLI

`@daniel-rck/web-base` is a shadcn-style CLI: it copies templates *into* the
app repo. When working in any of these web app repos, prefer running the CLI
over hand-copying snippets. The CLI is the source of truth; this skill
documents the why and when.

```bash
bunx github:daniel-rck/web-base init           # scaffold a new app
bunx github:daniel-rck/web-base add core       # all shared pieces
bunx github:daniel-rck/web-base add sync       # extras only some apps have
bunx github:daniel-rck/web-base update layout  # diff local against template
```

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
   history.

## When to consult which reference

Each reference matches a CLI template under `cli/templates/<name>/`, so the
convention and its template stay aligned. Don't read all references upfront —
pick what's relevant to the current task.

| Working on… | Reference |
|---|---|
| Dependency versions, package.json template, vite config | `tech-stack.md` |
| Biome config (linter rules, formatter settings) | `biome.md` |
| LICENSE, CONTRIBUTING, SECURITY, .editorconfig | `hygiene.md` |
| AppShell, design tokens, per-app accent | `layout-system.md` |
| idb patterns, useLiveQuery, migration recipes | `storage.md` |
| injectManifest, sw.ts skeleton, Workbox precache | `pwa.md` |
| react-router-dom 7 setup, typed route constants | `router.md` |
| /api/* routing, R2/KV bindings, wrangler local dev | `worker.md` |
| Hausverwaltung-style E2E-encrypted sync | `sync.md` |
| Reusable workflow caller pattern | `ci.md` |

## Anti-patterns

- **ESLint + Prettier** → Biome (one tool, faster, one config).
- **Dexie** → idb (lighter, less magic, our `useLiveQuery` is ~50 lines).
- **localStorage for app data** → idb (synchronous, no queries, size-limited).
- **generateSW** → injectManifest (custom message handlers needed).
- **Skipping react-router** → always include it (cheap to add, painful to
  retrofit).
- **Per-repo CI duplication** → reusable workflow from web-base.
- **Starter template repo for existing apps** → the CLI handles updates too.
- **Custom monorepo (Turborepo, Nx)** → three repos, one tooling repo is
  enough.
- **Per-app Tailwind config overrides** → single `theme.css`, only
  `--accent-h` changes.
- **shadcn/ui as a dependency** → shadcn-style *copy*, no Radix UI.

## When this skill is wrong

Explicit deviations are fine but must be documented in the deviating app's
`docs/specs/`. Drift without documentation is a bug.
