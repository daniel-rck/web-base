# 07 — Conventions

This spec defines the cross-cutting decisions that apply to every app and every
template. When in doubt, fall back here.

## Stack pins

These are the versions every app targets after migration. The single source
is `cli/templates/pins.json`; the tables below, the skill's `tech-stack.md` and
every template manifest must match it exactly (`cli/src/docs/pins.test.ts`
fails otherwise, including on a package missing from one side). Bump them as a
group through a PR to this repo: edit `pins.json`, then the tables and any
manifest that installs the package.

Apps check themselves against the table with `web-base pins` (exit 1 on any
mismatch; packages the app doesn't use are ignored) and catch up with
`web-base pins --apply`, which rewrites mismatched ranges and `packageManager`
in place and adds nothing. See `02-cli.md`.

### Production dependencies

```json
{
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "react-router-dom": "^7.18.3",
  "idb": "^8.0.3",
  "lucide-react": "^1.39.0"
}
```

### Dev dependencies

```json
{
  "typescript": "~7.0.2",
  "vite": "^8.2.2",
  "@vitejs/plugin-react": "^6.1.1",
  "vite-plugin-pwa": "^1.3.0",
  "workbox-precaching": "^7.4.1",
  "workbox-routing": "^7.4.1",
  "workbox-strategies": "^7.4.1",
  "workbox-expiration": "^7.4.1",
  "workbox-window": "^7.4.1",
  "tailwindcss": "^4.3.3",
  "@tailwindcss/vite": "^4.3.3",
  "oxlint": "^1.85.0",
  "oxfmt": "^0.70.0",
  "vitest": "^4.1.11",
  "@vitest/ui": "^4.1.11",
  "jsdom": "^30.0.1",
  "fake-indexeddb": "^6.2.5",
  "@testing-library/react": "^16.3.3",
  "@testing-library/dom": "^10.4.2",
  "@testing-library/user-event": "^14.6.7",
  "@testing-library/jest-dom": "^7.0.1",
  "wrangler": "^4.128.0",
  "@cloudflare/workers-types": "^5.20260902.1",
  "@types/react": "^19.2.18",
  "@types/react-dom": "^19.2.5",
  "@types/node": "^26.4.1"
}
```

`typescript` keeps a tilde, not a caret: TypeScript minors routinely break
builds, and the fleet has always pinned it that way. Everything else takes a
caret.

`workbox-routing`, `workbox-strategies` and `workbox-expiration` follow
`workbox-precaching`; the table pins them so `web-base pins` covers the apps
that use them.

Domain dependencies stay per-app and out of this table: `chart.js`,
`react-chartjs-2`, `@dnd-kit/*`, `framer-motion`, `qrcode`, `canvas-confetti`,
`jspdf`, `pako`, `zod`, `ulid`, `@formkit/auto-animate`, `pixi.js`,
`@fontsource-variable/*`, `@playwright/test`, `@cloudflare/vitest-pool-workers`,
`@vite-pwa/assets-generator`.

### Package manager

```json
{
  "packageManager": "bun@1.3.11"
}
```

This field is required in every app's `package.json`, and `web-base pins`
fails without it. `oven-sh/setup-bun` reads it in CI; it also documents which
Bun the lockfile was written with. (Bun does not use corepack.)

## package.json template

The `init` command generates this shape for new apps:

```json
{
  "name": "<app-name>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "description": "<one-line German description>",
  "keywords": ["pwa", "privacy", "offline", "react", "vite", "typescript"],
  "author": "<author>",
  "license": "MIT",
  "homepage": "https://<app>.daniel-rck.workers.dev",
  "repository": { "type": "git", "url": "https://github.com/daniel-rck/<App>.git" },
  "bugs": { "url": "https://github.com/daniel-rck/<App>/issues" },
  "packageManager": "bun@1.3.11",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "oxlint && oxfmt --check",
    "format": "oxfmt",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "worker:dev": "wrangler dev",
    "worker:deploy": "wrangler deploy"
  }
}
```

Domain dependencies (chart.js, dnd-kit, framer-motion, qrcode, canvas-confetti,
…) are added per-app via `bun add`, not by the CLI.

## Architecture invariants

These are hard rules. Deviations require explicit decisions documented in the
deviating app's `docs/specs/`.

### 1. Lokal-first

App data lives in the user's browser (IndexedDB via idb). No required account,
no required email, no third-party telemetry. localStorage is for settings only
(theme override, last-opened tab) — not app data.

### 2. DSGVO-konform by construction

Any sync feature uses client-side AES-GCM encryption. The server only sees
ciphertext. No analytics that fingerprint users.

If an app wants usage analytics: server-side aggregate counters only (e.g.
Umami's PostgreSQL-native mode in the SIP Heimdall pattern), no client-side
SDK. This rules out Google Analytics, Plausible-on-cloud, Mixpanel.

### 3. German UI and README

User-facing strings (UI, README.md, error messages shown to users) are German.
Source code (identifiers, comments, commit messages, internal docs) is English.

Mixed-language commits are discouraged: when adding a new feature, the UI
strings go in a single PR with the German content, separate from the English
implementation if the diff would be confusing.

### 4. MIT license

All apps and tools are MIT-licensed. Sub-dependencies must be MIT, Apache-2.0,
BSD, or ISC. AGPL-3.0 and copyleft licenses are excluded.

### 5. One web app, one Cloudflare Worker

No shared backend across apps. Each app's `worker/index.ts` is small (routing
to static assets + optional `/api/*` handlers). Shared infrastructure (the
sync backend pattern) is *copied* between apps via the `sync` template, not
shared as a runtime service.

### 6. Specs in `docs/specs/`

App-specific architecture, module designs, and migration plans live in the
app's `docs/specs/` directory. Living documents, no archiving. Git for history.
The Thanos-lightweight style — see the other repos for examples.

## Anti-patterns

Rejected approaches with the reason and the replacement:

| Rejected | Reason | Replacement |
|---|---|---|
| ESLint + Prettier | Two tools, two configs, slower | oxlint + oxfmt |
| Biome | Own rule names and formatting dialect; ESLint plugin rules (`react-hooks`, `jsx-a11y`, `unicorn`) only partly ported | oxlint + oxfmt (ESLint-compatible rule names, Prettier-compatible output) |
| Dexie | Too magical, IndexedDB abstraction unneeded for these use cases | idb + custom `useLiveQuery` (~90 lines) |
| localStorage for app data | Synchronous, size-limited, no queries | idb |
| generateSW (vite-plugin-pwa) | Can't add message handlers / push handlers / background sync | injectManifest + hand-written sw.ts |
| `skipWaiting()` on install | Open tabs lose their lazy chunks after a deploy | `registerType: "prompt"` + `UpdatePrompt` |
| Skip react-router | Painful to retrofit when a second view appears | Always include the router |
| Per-repo CI duplication | Drift across apps, hard to bump versions everywhere | Reusable workflow from web-base |
| Starter-template GitHub feature for existing apps | Doesn't help with updates after initial copy | The CLI |
| Custom-built monorepo with Turborepo/Nx | Overkill for nine independent apps | Nine app repos, one tooling repo |
| Tailwind config overrides per app | Drift, hard to reason about | Owned `tokens.css`; the `theme.css` seam sets `--accent-h` and adds app tokens |
| `focus-visible:outline-none` + a ring | Forced-colors mode drops box-shadows, so focus disappears | The outline in `cn.ts` (`FOCUS_RING`) |
| `text-white` on a fill, `text-success` on its own tint | Fails 4.5:1 at several accent hues | `text-fg-on-accent`, `text-*-fg` |
| shadcn/ui as a dependency | Brings Radix UI, their token system, implicit decisions | shadcn-style copy (the CLI does this) |
| Adding `clsx` everywhere "just in case" | Tiny lib but creates expectation it's used | String concat until a real need appears |
| `nodejs_compat` by default | Changes the Workers runtime for workers that import no Node built-in | Add the flag only where a worker imports one |
| Security headers only in `_headers` (or only in the Worker) | Cloudflare applies `_headers` to static assets, never to Worker-generated responses | `public/_headers` for the document policy, `worker/base.ts` for Worker responses (`nosniff`, `no-store`) |
| `run_worker_first` patterns next to SPA mode | Every path the list doesn't match gets the SPA fallback — a stale `/assets/*.js` becomes `index.html` with a 200 | SPA mode alone: navigations get `index.html`, other misses reach the Worker |

## German/English language rules

For consistency:

- **UI labels:** German. "Speichern", "Abbrechen", "Mieter hinzufügen".
- **Error messages shown to users:** German.
- **Code identifiers:** English. `function addTenant`, not `function mieterHinzufuegen`.
- **Code comments:** English.
- **Commit messages:** English, conventional commits.
- **README.md (user-facing):** German.
- **CONTRIBUTING.md, SECURITY.md (developer-facing):** English.
- **CHANGELOG.md:** English.
- **`docs/specs/`:** English.

## TypeScript style

- `strict: true` plus `noUncheckedIndexedAccess: true`. Don't disable globally.
- Prefer `type` over `interface` unless you need declaration merging.
- Imports use `.ts` extension explicitly (allowed by `allowImportingTsExtensions`).
- `verbatimModuleSyntax: true` — use `import type` for type-only imports.
- No `any`. Use `unknown` and narrow. oxlint warns on `any`.
- No `!` non-null assertion unless followed by a comment explaining why it's
  safe. oxlint warns on `!`.
- No `console.log` in production code paths. `console.error`/`warn` are fine
  for genuine errors. oxlint warns on `console.log`.

## File organization

```
src/
├── App.tsx                    # root layout route: AppShell around <Outlet /> (router)
├── main.tsx                   # entry: <RouterProvider> + <UpdatePrompt /> (app)
├── index.css                  # imports lib/ui/theme.css (app)
├── lib/                       # shared, app-agnostic
│   ├── ui/                    # from `web-base add layout`
│   ├── db/                    # from `web-base add storage`
│   ├── pwa/                   # useAppUpdate, UpdatePrompt (pwa)
│   ├── routing/               # RouteError, NotFound, RouteFallback, useDocumentTitle (router)
│   ├── router.tsx             # from `web-base add router`
│   ├── routes.ts
│   └── sync/                  # from `web-base add sync` (optional)
├── features/                  # per-domain folders
│   ├── home/HomePage.tsx      # the router template's starting page
│   └── <feature>/
│       ├── <Feature>Page.tsx
│       ├── components/
│       └── db.ts              # feature-specific idb queries
├── test/                      # setup.ts + environment.test.tsx (testing)
└── sw/
    ├── base.ts                # owned SW baseline (pwa)
    └── index.ts               # the app's SW: registerAppShell() + handlers

public/
└── _headers                   # from `web-base add worker` (CSP, HSTS, asset caching)

worker/
├── base.ts                    # from `web-base add worker` (shared router, owned)
└── index.ts                   # from `web-base add worker`
```

This maps onto the file `policy` in the template manifests (`02-cli.md`):

- **owned** building blocks should remain identical across apps — the
  primitives, the layout shell, `tokens.css`, `useLiveQuery` and the DB
  opener, `src/sw/base.ts`, `worker/base.ts`, the routing pages, the sync
  machinery, `oxlint.base.json`, `.oxfmtrc.json`. Drift here is a signal
  something's wrong: either the convention changes (update the template) or
  the app runs `web-base update --apply` to pull the base back.
- **scaffold** seams are expected to differ per app — `theme.css`
  (`--accent-h`), `db.ts` (`AppSchema`, migrations), `routes.ts`/`router.tsx`,
  `src/App.tsx`, `src/sw/index.ts`, `worker/index.ts`, `wrangler.toml`,
  `public/_headers`. `update` reports their drift but never overwrites them.

Machinery that has to evolve lives in an owned file next to a thin seam (the
pattern `oxlint.base.json` + `.oxlintrc.json` started), so a fix reaches every
app through `update`.

Files inside `features/` are per-app and never copied — except
`features/home/HomePage.tsx`, the router template's starting page.

## Versioning of the apps

Apps are private (`"private": true`) and don't use semver. Version stays at
`0.0.0`. The deployed URL is the user-facing identifier.

The CLI (`@daniel-rck/web-base`) uses semver; the rule — including what counts
as breaking during 0.x — is in *Versioning* in `02-cli.md`.
