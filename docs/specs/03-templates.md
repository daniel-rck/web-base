# 03 — Templates

Each template under `cli/templates/<name>/` is a folder with a `manifest.json`
and the files it ships. This spec defines what each template installs.

Templates listed below as **leaf** are real files-on-disk templates. **Meta**
templates only have an `extends` array.

## Inventory

| Template | Kind | What it installs |
|---|---|---|
| `core` | meta | hygiene + biome + router + storage + pwa + worker + layout |
| `hygiene` | leaf | LICENSE, CONTRIBUTING, SECURITY, .editorconfig |
| `biome` | leaf | biome.json + lint/format scripts + biome devDep |
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
  "extends": ["hygiene", "biome", "router", "storage", "pwa", "worker", "layout"]
}
```

No files of its own. The order of `extends` matters: layout last because it
imports from storage (for `useLiveQuery` examples) and from router (for
`NavLink` in `AppNav`).

---

## hygiene

Installs repo-hygiene files. See `07-conventions.md` for the exact content.

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

## biome

Replaces ESLint + Prettier with Biome.

Files:
- `biome.json` → `biome.json` (the per-app config, slightly less strict than the web-base repo's)

devDependencies:
- `@biomejs/biome`: `^2.4.15`

scripts:
- `lint`: `biome check .`
- `format`: `biome format --write .`

postInstall:
- "Remove config files: eslint.config.js, .prettierrc*, .eslintrc*"
- "Remove devDeps: eslint, typescript-eslint, @eslint/js, eslint-plugin-*, prettier"
- "Run: bun install"
- "Run: bun run format && bun run lint"

The per-app biome.json includes warnings for `noConsoleLog` and
`noExplicitAny` — see `04-layout-system.md` for the full config.

---

## layout

The shared UI structure. Full spec in `04-layout-system.md`.

Files:
- `AppShell.tsx` → `src/lib/ui/AppShell.tsx`
- `AppHeader.tsx` → `src/lib/ui/AppHeader.tsx`
- `AppNav.tsx` → `src/lib/ui/AppNav.tsx`
- `PageHeader.tsx` → `src/lib/ui/PageHeader.tsx`
- `primitives.tsx` → `src/lib/ui/primitives.tsx`
- `InstallButton.tsx` → `src/lib/ui/InstallButton.tsx`
- `useInstallPrompt.ts` → `src/lib/ui/useInstallPrompt.ts`
- `theme.css` → `src/lib/ui/theme.css`
- `index.ts` → `src/lib/ui/index.ts` (barrel)

dependencies:
- `lucide-react`: `^1.16.0`

postInstall:
- "Import theme: add `@import \"./lib/ui/theme.css\";` to your `src/index.css`"
- "Wrap your app in `<AppShell>...</AppShell>`"
- "Set the color accent: edit the `--accent-h` value in `theme.css`"
- "Suggested accents: Hausverwaltung→250 (Slate-Blau), Tennisturnier→155 (Emerald), ErinnerMich→285 (Indigo)"

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
- Imports `manifest` from `__STATIC_CONTENT_MANIFEST` (Workers Static Assets)
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
