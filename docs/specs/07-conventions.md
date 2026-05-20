# 07 — Conventions

This spec defines the cross-cutting decisions that apply to every app and every
template. When in doubt, fall back here.

## Stack pins

These are the versions every app targets after migration. The CLI templates
ship with these. Bump them as a group through a PR to this repo (which then
flows into apps via `web-base update`).

### Production dependencies

```json
{
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "react-router-dom": "^7.14.2",
  "idb": "^8.0.3",
  "lucide-react": "^1.16.0"
}
```

### Dev dependencies

```json
{
  "typescript": "~6.0.2",
  "vite": "^8",
  "@vitejs/plugin-react": "^6",
  "vite-plugin-pwa": "^1.3",
  "workbox-precaching": "^7.4.0",
  "workbox-window": "^7.4.0",
  "tailwindcss": "^4.2.4",
  "@tailwindcss/vite": "^4.2.4",
  "@biomejs/biome": "^1.9.4",
  "vitest": "^4.1.5",
  "@vitest/ui": "^4.1.5",
  "jsdom": "^29.1.0",
  "@testing-library/react": "^16.3.2",
  "@testing-library/user-event": "^14.6.1",
  "@testing-library/jest-dom": "^6.9.1",
  "wrangler": "^4.87.0",
  "@cloudflare/workers-types": "^4.20260504.1",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
  "@types/node": "^25.6.0"
}
```

### Package manager

```json
{
  "packageManager": "bun@1.3.11"
}
```

This field is required in every app's `package.json`. CI uses it; Bun's
`corepack` integration uses it.

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
    "lint": "biome check .",
    "format": "biome format --write .",
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
| ESLint + Prettier | Two tools, two configs, slower | Biome (one tool, one config) |
| Dexie | Too magical, IndexedDB abstraction unneeded for these use cases | idb + custom `useLiveQuery` (~50 lines) |
| localStorage for app data | Synchronous, size-limited, no queries | idb |
| generateSW (vite-plugin-pwa) | Can't add message handlers / push handlers / background sync | injectManifest + hand-written sw.ts |
| Skip react-router | Painful to retrofit when a second view appears | Always include the router |
| Per-repo CI duplication | Drift across apps, hard to bump versions everywhere | Reusable workflow from web-base |
| Starter-template GitHub feature for existing apps | Doesn't help with updates after initial copy | The CLI |
| Custom-built monorepo with Turborepo/Nx | Overkill for three independent apps | Three repos, one tooling repo |
| Tailwind config overrides per app | Drift, hard to reason about | Single `theme.css`, only `--accent-h` changes |
| shadcn/ui as a dependency | Brings Radix UI, their token system, implicit decisions | shadcn-style copy (the CLI does this) |
| Adding `clsx` everywhere "just in case" | Tiny lib but creates expectation it's used | String concat until a real need appears |

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
- No `any`. Use `unknown` and narrow. Biome warns on `any`.
- No `!` non-null assertion unless followed by a comment explaining why it's
  safe. Biome warns on `!`.
- No `console.log` in production code paths. `console.error`/`warn` are fine
  for genuine errors. Biome warns on `console.log`.

## File organization

```
src/
├── App.tsx                    # router setup, theme import
├── main.tsx                   # entry, mounts router
├── index.css                  # imports lib/ui/theme.css
├── lib/                       # shared, app-agnostic
│   ├── ui/                    # from `web-base add layout`
│   ├── db/                    # from `web-base add storage`
│   ├── router.tsx             # from `web-base add router`
│   ├── routes.ts
│   └── sync/                  # from `web-base add sync` (optional)
├── features/                  # per-domain folders
│   └── <feature>/
│       ├── <Feature>Page.tsx
│       ├── components/
│       └── db.ts              # feature-specific idb queries
└── sw/index.ts                # from `web-base add pwa`

worker/
└── index.ts                   # from `web-base add worker`
```

Files inside `lib/` (other than feature-specific extensions) should remain
identical across apps. Diff drift in `lib/ui/` or `lib/db/` is a signal
something's wrong — either the convention needs to change (update the
template) or the app should run `web-base update`.

Files inside `features/` are per-app, never copied.

## Versioning of the apps

Apps are private (`"private": true`) and don't use semver. Version stays at
`0.0.0`. The deployed URL is the user-facing identifier.

The CLI (`@daniel-rck/web-base`) uses semver. Breaking changes to template
output bump the minor; breaking changes to the CLI interface bump the major.
