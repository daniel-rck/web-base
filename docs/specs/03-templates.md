# 03 — Templates

Each template under `cli/templates/<name>/` is a folder with a `manifest.json`
and the files it ships. This spec defines what each template installs.

Templates listed below as **leaf** are real files-on-disk templates. **Meta**
templates only have an `extends` array.

## Inventory

| Template | Kind | What it installs |
|---|---|---|
| `core` | meta | hygiene + oxc + router + storage + pwa + worker + layout |
| `hygiene` | leaf | LICENSE, CONTRIBUTING, SECURITY, .editorconfig |
| `oxc` | leaf | oxlint + oxfmt configs + lint/format scripts + devDeps |
| `layout` | leaf | AppShell, AppHeader, AppNav, PageHeader, primitives, InstallButton, theme.css |
| `storage` | leaf | idb wrapper + useLiveQuery hook |
| `pwa` | leaf | sw.ts (injectManifest) + vite config snippet + workbox deps |
| `router` | leaf | router.tsx + react-router-dom dep |
| `worker` | leaf | worker/index.ts + wrangler.toml + Cloudflare types |
| `sync` | leaf (extra) | client + worker handlers for R2+KV E2E-encrypted sync |

`core` is the meta-template every app uses. `sync` is opt-in.

---

## core

`manifest.json`:

```json
{
  "name": "core",
  "description": "Everything every daniel-rck web app shares",
  "extends": ["hygiene", "oxc", "router", "storage", "pwa", "worker", "layout"]
}
```

No files of its own. The order of `extends` matters: layout last because it
imports from storage (for `useLiveQuery` examples) and from router (for
`NavLink` in `AppNav`).

---

## hygiene

Installs repo-hygiene files. See `07-conventions.md` for the exact content.

**Every file here is `scaffold`.** These four are per-repo by nature and the
fleet proves it: the LICENSE carries a holder and year, SECURITY.md a scope,
`.editorconfig` sections for whatever languages the repo actually contains, and
CONTRIBUTING.md the app's real quality gates — `bun run verify` in one repo,
`lint`/`typecheck`/`test` in another — plus its architecture warnings. Four of
the nine apps had rewritten CONTRIBUTING.md substantially, and under an `owned`
policy each of those read as permanent drift that `check` would demand be
reverted, destroying genuinely better guidance.

The template is therefore a starting point that `update` never overwrites, and
the `hygiene` block contributes no guarantees to `web-base check`.

> The app-facing lint config is `cli/templates/oxc/oxlint.base.json`. **Not**
> the repo's own root `.oxlintrc.json` — that one is tuned for a Node CLI and
> copying it into an app silently disables the React and a11y rules.

Files:
- `LICENSE` → `LICENSE` (MIT)
- `CONTRIBUTING.md` → `CONTRIBUTING.md`
- `SECURITY.md` → `SECURITY.md`
- `editorconfig` → `.editorconfig` (the leading dot is in the destination)

No package.json changes.

postInstall:
- "Edit LICENSE to set the current year if needed"
- "Verify SECURITY.md matches your disclosure preferences"

---

## oxc

Replaces ESLint + Prettier (and, since 0.4.0, Biome) with the oxc toolchain:
oxlint lints, oxfmt formats.

Files:
- `oxlint.base.json` → `oxlint.base.json` — the shared lint rules. **owned**
- `oxlintrc.json` → `.oxlintrc.json` — `extends` the base, holds per-app `overrides`. **scaffold**
- `oxfmtrc.json` → `.oxfmtrc.json` — the formatter settings. **owned**
- `prettierignore` → `.prettierignore` — per-app formatter exclusions. **scaffold**

(The leading dots are in the destination only, same as `hygiene`'s
`editorconfig`. Undotted sources also keep oxlint/oxfmt from discovering the
template configs as nested configs when this repo lints itself.)

**Decision: two lint files, not one.** A single owned config cannot survive
contact with the fleet. Several apps have overrides that are load-bearing and
correct — scoping a `no-restricted-globals` deny-list to a purity-guarded
directory, relaxing `no-non-null-assertion` in tests. Under one owned file each
of those reads as permanent drift, leaving only bad options: disable the drift
guard in exactly the repos that need it, or run them red forever. The split
lets `check` guard the shared rules byte-for-byte while apps keep their seams.

**Decision: the formatter config is one owned file plus `.prettierignore`.**
oxfmt has no `extends`, and the one per-app formatter need seen in the fleet is
excluding generated files (Tonspur's data modules). oxfmt reads
`.prettierignore` next to `.gitignore`, so that file is the seam; `*.generated.ts`
is excluded in the owned config already. A JS/TS oxfmt config that imports a
base was rejected — it needs a Node runtime to load and is experimental.

Apps put exceptions in `.oxlintrc.json` / `.prettierignore` and never touch
`oxlint.base.json` or `.oxfmtrc.json` — `update` overwrites them.

devDependencies:
- `oxlint`: `^1.85.0`
- `oxfmt`: `^0.70.0`

scripts:
- `lint`: `oxlint && oxfmt --check`
- `format`: `oxfmt`

postInstall:
- "Remove config files: biome.json, biome.base.json, eslint.config.js, .prettierrc*, .eslintrc*"
- "Remove devDeps: @biomejs/biome, eslint, typescript-eslint, @eslint/js, eslint-plugin-*, prettier"
- "Move per-app Biome overrides: lint rules into .oxlintrc.json's `overrides`, formatter exclusions into .prettierignore — never edit oxlint.base.json or .oxfmtrc.json, they are centrally managed and `update` overwrites them"
- "Rewrite `// biome-ignore` comments as `// oxlint-disable-next-line <rule> -- <reason>`"
- "Run: bun install"
- "Run: bunx oxlint --fix && bunx oxfmt && bun run lint"

`lint` runs both tools so it stays the single gate Biome's `check` was: lint
errors *and* unformatted files fail it. Import sorting is part of oxfmt
(`sortImports`, with `newlinesBetween: false` to match the ungrouped order
Biome produced), so `oxfmt` alone fixes ordering. `sortPackageJson` is off —
the CLI patches `package.json` surgically and a reordering formatter would
fight it.

`oxlint.base.json` enables the `typescript`, `unicorn`, `oxc`, `import`,
`react`, `jsx-a11y` and `vitest` plugins, makes the `correctness` category an
error and `suspicious` a warn, and sets `no-console` (allowing `error`/`warn`),
`typescript/no-explicit-any`, `typescript/no-non-null-assertion` and
`react/exhaustive-deps` to `warn`. Three rules are off because they misfire on
the templates themselves: `no-underscore-dangle` (`self.__WB_MANIFEST`),
`unicorn/require-post-message-target-origin` (`BroadcastChannel.postMessage`
has no target origin) and `jsx-a11y/prefer-tag-over-role` (`role="status"` on
the spinner is correct; `<output>` is for computed results). The full file is
`cli/templates/oxc/oxlint.base.json`.

> Do not copy the web-base repo's **own** root `.oxlintrc.json` into an app. It
> is tuned for a Node CLI (no `react`/`jsx-a11y` plugins, Node env) and
> silently disables the React and a11y rules an app needs.

oxlint does not lint CSS or JSON. oxfmt formats both, and parses the Tailwind 4
directives (`@theme`, `@apply`, `@custom-variant`, `@utility`) in the `layout`
template's `tokens.css` and `theme.css` without extra config.

---

## layout

The shared UI structure. Full spec in `04-layout-system.md`.

Files (all → `src/lib/ui/`, owned unless marked):
- `AppShell.tsx`, `AppHeader.tsx`, `AppNav.tsx`, `PageHeader.tsx`
- `primitives.tsx` (barrel) with one file per primitive: `Button.tsx`,
  `Card.tsx` (`Card`, `SectionCard`), `Chip.tsx`, `Badge.tsx`, `Spinner.tsx`,
  `EmptyState.tsx`, and the internal `cn.ts`
- `InstallButton.tsx` + `useInstallPrompt.ts`
- `ThemeToggle.tsx` + `useTheme.ts`
- `OfflineIndicator.tsx` + `useOnlineStatus.ts`
- `tokens.css` — every design token (owned)
- `theme.css` — **scaffold**: imports `tokens.css`, sets `--accent-h`
- `index.ts` — **scaffold** barrel
- `theme-init.js` → `public/theme-init.js` — **scaffold** anti-flash script

dependencies: `lucide-react`, `react-router-dom` (`AppNav` uses `NavLink`).
Versions come from `cli/templates/pins.json` (see `07-conventions.md`).

postInstall: import `theme.css` from `src/index.css`; render `<AppShell>` as
the router's root layout route; give every page a `<PageHeader>`; set
`--accent-h` from the hue table in `04-layout-system.md`; load
`/theme-init.js` in `<head>`. The exact text is in the manifest.

---

## storage

The idb-based storage layer.

Files:
- `db.ts` → `src/lib/db/db.ts` — wraps `idb`'s `openDB`, defines the schema interface
- `useLiveQuery.ts` → `src/lib/db/useLiveQuery.ts` — React hook for reactive queries
- `index.ts` → `src/lib/db/index.ts`

dependencies:
- `idb`: `^8.0.3`

The `db.ts` ships as a template with placeholders for the app's schema. It
must include:
- An `openDB`-based factory exporting a typed promise (`AppDB`)
- An `upgrade` callback skeleton with comments
- A `clearAll()` helper for tests

`useLiveQuery.ts` ships ~30-50 lines:
- Subscribes to a BroadcastChannel named after the store
- Re-runs the query whenever the channel signals a mutation
- Returns `{ data, loading, error }`
- Mutation helpers (`tx.objectStore(name).put(value)` wrappers) emit on the channel

Full TypeScript signatures in `references/storage.md` of the skill (and so the
template implementation must produce equivalent code).

postInstall:
- "Define your schema in src/lib/db/db.ts (replace the placeholder interface)"
- "Use `useLiveQuery(db.<store>, q => q.getAll())` in components"

---

## pwa

PWA support via `vite-plugin-pwa` with `injectManifest` strategy.

Files:
- `sw.ts` → `src/sw/index.ts` — service worker source with workbox precache
- `vite.snippet.md` → `vite.snippet.md` — short markdown noting the VitePWA config to merge
- `tsconfig.sw.json` → `tsconfig.sw.json` — separate TS config for the SW (different lib: WebWorker)

dependencies (none — vite-plugin-pwa is a devDep):

devDependencies:
- `vite-plugin-pwa`: `^1.3`
- `workbox-precaching`: `^7.4.0`
- `workbox-window`: `^7.4.0`

postInstall:
- "Open vite.snippet.md and merge the VitePWA() config into your vite.config.ts"
- "Delete vite.snippet.md after merging"
- "Add to `tsconfig.json` references: `{ \"path\": \"./tsconfig.sw.json\" }`"

**Decision: injectManifest, not generateSW.** Needed for custom message
handlers (push notifications in ErinnerMich, background sync in
Hausverwaltung). The cost is a hand-written SW file, but the SW skeleton
shipped here is ~40 lines and covers precache + activate + skipWaiting +
clientsClaim.

---

## router

Adds react-router-dom with a typed routes scaffold.

Files:
- `router.tsx` → `src/lib/router.tsx` — a `createBrowserRouter` skeleton
- `routes.ts` → `src/lib/routes.ts` — typed route path constants

dependencies:
- `react-router-dom`: `^7.14.2`

postInstall:
- "Wrap your app in `<RouterProvider router={router} />` in main.tsx"
- "Add routes in src/lib/router.tsx"
- "Define route path constants in src/lib/routes.ts and import them everywhere"

The `routes.ts` pattern centralizes path strings so refactors are typesafe:

```typescript
export const ROUTES = {
  home: "/",
  // add more here
} as const;
```

---

## worker

Cloudflare Worker scaffolding.

Files:
- `worker.ts` → `worker/index.ts`
- `wrangler.toml` → `wrangler.toml`
- `tsconfig.worker.json` → `tsconfig.worker.json`

devDependencies:
- `@cloudflare/workers-types`: `^4.20260504.1`
- `wrangler`: `^4.87.0`

scripts:
- `worker:dev`: `wrangler dev`
- `worker:deploy`: `wrangler deploy`

The worker template ships a 30-40 line `index.ts` that:
- Serves static assets via the `ASSETS` binding (`env.ASSETS.fetch(request)`)
- Routes `/api/*` to a `handleApi(request, env, ctx)` stub
- Falls through to static-asset serving via Workers Assets
- Has a `/healthz` endpoint returning `{ ok: true }`

`wrangler.toml` ships with placeholders for `name` and `compatibility_date`.

postInstall:
- "Edit wrangler.toml: set `name` to your app name"
- "Set compatibility_date to today's date"
- "If using R2/KV: add bindings under [[r2_buckets]] / [[kv_namespaces]] (see sync template)"

---

## sync

The Hausverwaltung-style E2E-encrypted sync. **Extra**, not in `core`.

Files:
- `sync/client.ts` → `src/lib/sync/client.ts` — encryption, pairing, push/pull
- `sync/crypto.ts` → `src/lib/sync/crypto.ts` — AES-GCM key derivation, HKDF
- `sync/types.ts` → `src/lib/sync/types.ts`
- `worker/sync.ts` → `worker/sync.ts` — R2 + KV handlers
- `sync/README.md` → `docs/sync.md` — architecture summary

No dependencies (uses Web Crypto API).

postInstall:
- "Bind R2 bucket as `SYNC` and KV namespace as `SYNC_KV` in wrangler.toml"
- "Mount sync handlers in worker/index.ts at /api/sync/*"
- "Initialize sync via `await syncClient.enable()` (generates a device secret)"

Architecture summary (full text in the file):
- R2 object key: `objects/<sha256(secret).slice(0,16)>/data.json` (Crockford b32)
- Conflict detection: R2 ETag with `If-Match` (upload) / `If-None-Match` (download)
- Pairing: 6-digit OTP code, KV slot with TTL 300s, AES-GCM-wrapped secret transit
- Rate limit: KV token-buckets, 5 pair/min, 10 claim/15min, 60 data-ops/min per IP

---

## Adding a new template

To add a new template (e.g. `notifications`):

1. Create `cli/templates/notifications/`.
2. Add `manifest.json` with name, description, files, deps.
3. Add the actual files referenced by `files[]`.
4. Add a section to this spec.
5. If it should be in `core`, add it to `cli/templates/core/manifest.json`
   `extends` array (consider ordering — see the core section above).
6. Add a `skill/references/notifications.md` if the template embodies
   non-trivial conventions.
7. Bump the CLI's `package.json` version (patch for additive, minor for changes
   to existing templates that affect output).

## Verifying a template

For each template, the smoke test:

```bash
# from web-base root
bun run build
mkdir -p /tmp/scratch && cd /tmp/scratch
echo '{"name": "scratch", "version": "0.0.0"}' > package.json
node /path/to/web-base/cli/dist/index.js add <template>
# inspect output: files present, package.json patched
```

This is automated for `hygiene` in `tools-ci.yml`. Other templates can be
added to the CI matrix as they stabilize.
