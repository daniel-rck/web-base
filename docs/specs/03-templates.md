# 03 — Templates

Each template under `cli/templates/<name>/` is a folder with a `manifest.json`
and the files it ships. This spec defines what each template installs.
Dependency **versions** are not repeated here: they all come from
`cli/templates/pins.json`, shown in `07-conventions.md`.

Templates listed below as **leaf** are real files-on-disk templates. **Meta**
templates only have an `extends` array.

## Inventory

| Template | Kind | What it installs |
|---|---|---|
| `app` | leaf + extends `core` | everything in `core`, plus `index.html`, `vite.config.ts`, the tsconfigs, `src/main.tsx`, `src/index.css`, `.gitignore` — what `init` applies |
| `core` | meta | hygiene + oxc + testing + router + storage + pwa + worker + layout |
| `hygiene` | leaf | LICENSE, CONTRIBUTING, SECURITY, .editorconfig |
| `oxc` | leaf | oxlint + oxfmt configs + lint/format scripts + devDeps |
| `testing` | leaf | vitest.config.ts (merges vite.config.ts) + src/test/setup.ts + an environment test + Vitest/jsdom/Testing Library/fake-indexeddb devDeps |
| `layout` | leaf | AppShell, AppHeader, AppNav, PageHeader, primitives, InstallButton, ThemeToggle, OfflineIndicator, tokens.css + theme.css |
| `storage` | leaf | idb connection lifecycle, mutation channels, useLiveQuery hook |
| `pwa` | leaf | service worker (injectManifest: precache, offline navigation, prompt-based updates) + `useAppUpdate`/`UpdatePrompt` |
| `router` | leaf | router.tsx with the root layout route (`src/App.tsx`), error/404 pages, a starter `HomePage` |
| `worker` | leaf | shared router (SPA fallback, /api error boundary, headers) + worker/index.ts + wrangler.toml + public/_headers |
| `backup` | leaf (extra) | JSON export/import of the whole IndexedDB, persistent storage, „Alle Daten löschen" (`BackupCard`) |
| `sync` | leaf (extra) | client + worker for R2 end-to-end encrypted sync with QR/link pairing |

`core` is the meta-template every app uses; `app` is `core` plus the entry
files a brand-new app needs (`init`). `backup` and `sync` are opt-in.

---

## core

`manifest.json`:

```json
{
  "name": "core",
  "description": "Everything every daniel-rck web app shares",
  "extends": ["hygiene", "oxc", "testing", "router", "storage", "pwa", "worker", "layout"]
}
```

No files of its own. The order of `extends` only decides the order of the log
and of the `postInstall` steps; the templates' code depends on each other like
this: `layout` → react-router-dom (`NavLink` in `AppNav`); `router` → `layout`
(`App.tsx` renders `AppShell`; the error pages use the primitives); `pwa`'s
`UpdatePrompt` → `layout` (`useAppUpdate` itself has no dependency). `testing`
sits with the tooling: its setup imports from no other template.

---

## app

What `web-base init` applies: `extends: ["core"]` plus the files a brand-new
app needs to build. All of them are **scaffold** — they are the app's own
from the first commit.

Files:
- `index.html` — `lang="de"`, `viewport-fit=cover` (without it
  `env(safe-area-inset-*)` is 0 on iOS), `theme-color`, `<title>`, and
  `<script src="/theme-init.js">` before the stylesheet
- `vite.config.ts` — `react()`, `tailwindcss()`, the VitePWA block
  (`injectManifest`, `registerType: "prompt"`, a German manifest with
  `lang`, `id`, `scope`); a plain object so `vitest.config.ts` can merge it
- `tsconfig.json` (references app/node/sw/worker), `tsconfig.app.json`
  (`include: ["src"]`, `exclude: ["src/sw"]`, `types: ["vite/client"]`),
  `tsconfig.node.json` (`vite.config.ts`, `vitest.config.ts`)
- `main.tsx` → `src/main.tsx` — `<RouterProvider>` + `<UpdatePrompt />`
- `index.css` → `src/index.css` — `@import "./lib/ui/theme.css";`
- `gitignore` → `.gitignore`

dependencies: `react`, `react-dom`; devDependencies: `typescript`, `vite`,
`@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `@types/react`,
`@types/react-dom`, `@types/node` — all from the pin table. No scripts: the
scripts are `init`'s `package.json` template (`07-conventions.md`), so
`add app` never overwrites an app's build script.

`init` replaces `<app-name>` with the app's name in every scaffold file it
creates (`wrangler.toml`, `index.html`, `vite.config.ts`, …); owned files stay
byte-identical to the base. `tools-ci.yml`'s `scaffold` job runs `init`, then
`bun install`, lint, typecheck, test and build on the result — the proof that
a new app builds end to end.

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

devDependencies: `oxlint`, `oxfmt` (versions from `cli/templates/pins.json`).

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

## testing

Vitest with jsdom, Testing Library and fake-indexeddb, run through the app's
own Vite config. Part of `core`.

Files:
- `vitest.config.ts` → `vitest.config.ts` — merges `vite.config.ts` with the test settings. **scaffold**
- `setup.ts` → `src/test/setup.ts` — the shared test environment. **owned**
- `environment-test.tsx` → `src/test/environment.test.tsx` — guards that environment. **owned**

(The source has no `.test.` in its name — like `editorconfig` in `hygiene`,
only the destination carries the real name — so this repo's own Vitest never
discovers the template's test and tries to run it without jsdom.)

devDependencies: `vitest`, `jsdom`, `fake-indexeddb`, `@testing-library/react`,
`@testing-library/dom`, `@testing-library/jest-dom`,
`@testing-library/user-event`.

`@testing-library/dom` is listed explicitly: it is a peer dependency of
Testing Library React 16, jest-dom 7 and user-event, so the fleet pins it
rather than taking whatever the peer resolution picks.

`vitest.config.ts` is `mergeConfig(viteConfig, defineConfig({ test: { … } }))`
with `environment: "jsdom"`, `setupFiles: ["./src/test/setup.ts"]`,
`include: ["src/**/*.test.{ts,tsx}"]` and `restoreMocks: true`. Merging the Vite
config means plugins (React, Tailwind, PWA), aliases and virtual modules
resolve in tests exactly as in the build. It imports `./vite.config.ts`, so
`tsconfig.node.json` must include `vitest.config.ts`, and a `vite.config.ts`
that exports a function has to be called before merging.

`setup.ts`:
- `import "fake-indexeddb/auto"` — an in-memory IndexedDB (`indexedDB`,
  `IDBKeyRange`, …) as globals, so the `storage` machinery runs unmodified.
- `import "@testing-library/jest-dom/vitest"` — the DOM matchers and their types.
- `afterEach(cleanup)` — Testing Library only unmounts by itself when
  `afterEach` is a global (vitest's `globals: true`, which the template
  doesn't turn on).
- A `matchMedia` stub, installed only where `window.matchMedia` is missing
  (jsdom has none): every query reports `matches: false`, and listener
  methods (including the legacy `addListener`/`removeListener`) are no-ops.
  Tests override it with `vi.spyOn(window, "matchMedia")`.
- No BroadcastChannel polyfill: in the jsdom environment the global is Node's
  built-in, which delivers between instances, so `notifyMutation` →
  `useLiveQuery` works in tests as in the browser.

`environment.test.tsx` asserts that IndexedDB opens, that two
`BroadcastChannel` instances deliver to each other, that `matchMedia` exists
and that a jest-dom matcher works. It guards `setup.ts` — a broken piece of the
environment fails here with an obvious name instead of in every test that
uses it — and makes `vitest run` on a fresh scaffold non-empty: vitest exits 1
when it finds no test files.

No `scripts`: `init` already writes `test` (`vitest run`) and `test:watch`
(`vitest`), and `add` would overwrite an app's differing scripts (several apps
run Vitest projects or extra flags).

**Decision: testing is part of `core`.** The pin table always listed Vitest,
jsdom and Testing Library, but no template installed or configured them: every
app that tests wired its own setup, and a fresh `init` scaffold's `bun run
test` failed for want of a single test file. Every app has IndexedDB data and
reactive hooks; testing
those needs the same three pieces everywhere (fake IndexedDB, a matchMedia
stub, cleanup). Owned `setup.ts`, per-app `vitest.config.ts`: an app with its
own Vitest config keeps it and lists `./src/test/setup.ts` in `setupFiles`.
App-specific setup goes in its own file, listed next to it.

postInstall:
- "vitest.config.ts merges your vite.config.ts — if vite.config.ts exports a function, call it with the mode and merge the result"
- "Include vitest.config.ts in tsconfig.node.json (next to vite.config.ts)"
- "If the app already had a vitest config, keep it and add `./src/test/setup.ts` to its `setupFiles` instead"
- "Apps created before the testing template: add the scripts by hand — `"test": "vitest run"`, `"test:watch": "vitest"`"
- "Never edit src/test/setup.ts or src/test/environment.test.tsx — `update` overwrites them; put app-specific setup in its own file and list it in `setupFiles`"

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

The idb-based storage layer: a connection that survives the IndexedDB
lifecycle, a naming contract for mutation broadcasts, and a reactive query hook.

Files:
- `open.ts` → `src/lib/db/open.ts` — `createDBOpener()`: one cached connection and its lifecycle. **owned**
- `mutations.ts` → `src/lib/db/mutations.ts` — `mutationChannel()`, `notifyMutation()`, `clearStores()`. **owned**
- `useLiveQuery.ts` → `src/lib/db/useLiveQuery.ts` — React hook for reactive queries. **owned**
- `db.ts` → `src/lib/db/db.ts` — the app's schema, database name and migration ladder. **scaffold**
- `index.ts` → `src/lib/db/index.ts` — barrel. **scaffold**

dependencies: `idb`.

`db.ts` is the per-app seam and stays thin. A fix in a scaffold file only
reaches *new* apps, so everything that has to be right in every app lives in
the owned siblings, where `update` delivers it. `db.ts` ships:
- `AppSchema extends DBSchema` with a commented example store and an index
  signature the app deletes once real stores exist — while it is there, any
  string typechecks as a store name and every value is `unknown`.
- `getDB = createDBOpener<AppSchema>({ name: "<app-name>", version: 1, upgrade })`.
  The name must be unique per app: in local dev every app shares the
  `localhost` origin, so two apps called `"app"` would share — and upgrade —
  one database.
- The migration ladder in `upgrade(db, oldVersion)`: one `if (oldVersion < N)`
  step per version. `oldVersion` is 0 on a fresh install, so a new user runs
  every step and an existing one only those they're missing. A step that has
  shipped is never edited; a schema change bumps `version` and adds a step.
- `clearAll()` = `clearStores(await getDB())`, for tests and a "delete all
  data" action, and a re-export of `notifyMutation`, so the barrel's exports
  (`AppSchema`, `clearAll`, `getDB`, `notifyMutation`) stay as they were.

`open.ts` — `createDBOpener<S>({ name, version, upgrade, onVersionChange? })`
returns a `getDB()` that caches the `openDB()` promise (`pending ??= …`) and
wires the callbacks IndexedDB leaves to the app:
- `blocking` (another tab opened a newer version): close this connection,
  forget it, then call `onVersionChange` — default `location.reload()`.
- `terminated` (the browser dropped the connection — Safari does): forget it;
  the next call reopens.
- a rejected open (`VersionError` after a downgrade, quota, private mode):
  forget it; the next call retries instead of replaying the cached rejection.
- `blocked` (this tab's upgrade waits for another tab): `console.warn`.

`mutations.ts`:
- `mutationChannel(store)` → `"db:<store>"`, with `"*"` standing for every
  store — the naming contract between writers and `useLiveQuery`.
- `notifyMutation(store)` posts once on that channel and closes it; a no-op
  where `BroadcastChannel` doesn't exist.
- `clearStores(db)` empties every store in one `readwrite` transaction, then
  calls `notifyMutation("*")`. A database with no stores is a no-op, because
  `transaction([])` throws.

`useLiveQuery.ts` (~90 lines) — `useLiveQuery<T>(storeName, query, deps = [])`
returns `{ data, loading, error }`:
- Runs `query` on mount, when `[storeName, ...deps]` changes, and on every
  message on `mutationChannel(storeName)` or `mutationChannel("*")` (deduped,
  so passing `"*"` opens one channel; listens via `addEventListener`). There
  are no write wrappers — writers call `notifyMutation` after their transaction.
- Reads the newest `query` through `useEffectEvent` (stable in React 19.2), so
  the effect re-subscribes only when the key changes and nothing writes a ref
  during render. The one lint suppression left is `react/exhaustive-deps` on
  the `[storeName, ...deps]` line, which forwards the caller's list.
- Latest-wins: a run overtaken by a newer one never commits.
- The returned object keeps its identity between renders until the result
  changes.

**Decision: a newer schema in another tab closes the connection and reloads.**
An IndexedDB upgrade waits until every other connection to the database is
closed. A tab that keeps its old connection blocks the upgrade in the new tab
indefinitely: the new code's `openDB` never settles and the app never loads.
Closing in `blocking` unblocks it. The closed tab is now running code built for
the old schema against a database it can no longer open (`VersionError`), so
the default is to reload into the new build. An app with unsaved input at stake
passes `onVersionChange` to prompt instead ("Neue Version verfügbar — bitte neu
laden"); until the reload, `getDB()` rejects, and retries on every call.

**Decision: `useLiveQuery` resets when its key changes and keeps the last data
on error.** The hook stores each settled result together with the key it was
computed for. While that key differs from the current `[storeName, ...deps]`,
it returns a module constant `{ data: undefined, loading: true, error:
undefined }` — derived during render rather than set in the effect — so a
detail view switching from tenant A to tenant B never shows A's data as B's,
not even for one frame. A re-run for the *same* key (after a mutation) keeps
the current data with `loading: false`: re-queries follow every write, and a
spinner flash on each would be worse than data that is about to be replaced.
A failed run keeps the last good data for that key and sets `error` (non-`Error`
throws are wrapped), so a transient failure doesn't blank the screen; the
component decides what to show. Hausverwaltung keeps its own cross-store hook
through `webBase.unmanaged` (see `02-cli.md`).

Full TypeScript signatures in `references/storage.md` of the skill (and so the
template implementation must produce equivalent code).

postInstall:
- "Give the database a unique name in src/lib/db/db.ts (in local dev every app shares the localhost origin)"
- "Define your stores in AppSchema, then delete its index signature"
- "Schema changes: bump `version` and add one `if (oldVersion < N)` step per version — never edit a step that has shipped"
- "Read in components: `useLiveQuery("<store>", async () => (await getDB()).getAll("<store>"))`"
- "After every write call `notifyMutation("<store>")` so live queries re-run"
- "Never edit open.ts, mutations.ts or useLiveQuery.ts — `update` overwrites them"

---

## pwa

PWA support via `vite-plugin-pwa` with the `injectManifest` strategy.

Files:
- `sw-base.ts` → `src/sw/base.ts` (owned) — `registerAppShell()`: precache the
  build (`precacheAndRoute`, `cleanupOutdatedCaches`), serve `index.html` for
  every navigation (`NavigationRoute`, denylist `/api`, `/healthz`), activate a
  waiting worker only on a `SKIP_WAITING` message, `clients.claim()` on
  activate
- `sw.ts` → `src/sw/index.ts` (scaffold) — calls `registerAppShell()`; app
  handlers (push, background sync, runtime caching) go below it
- `useAppUpdate.ts` → `src/lib/pwa/useAppUpdate.ts` (owned) —
  `useRegisterSW` from `virtual:pwa-register/react`, returns `{ needRefresh,
  offlineReady, reload, dismiss }`, re-checks for an update hourly while the
  tab is visible and online
- `UpdatePrompt.tsx` → `src/lib/pwa/UpdatePrompt.tsx` (owned) — the German
  toast („Update verfügbar – neu laden …", „Die App ist jetzt auch offline
  verfügbar."), mounted once next to `<RouterProvider>`
- `tsconfig.sw.json` → `tsconfig.sw.json` (scaffold) — WebWorker lib,
  `allowImportingTsExtensions`

devDependencies: `vite-plugin-pwa`, `workbox-precaching`, `workbox-routing`,
`workbox-window` (a peer of vite-plugin-pwa's register code).

`obsolete`: `vite.snippet.md` — the template used to ship the VitePWA block as
a file to merge by hand; the full `vite.config.ts` now comes with the `app`
template and is shown in the skill's `pwa.md`.

The VitePWA config (`strategies: "injectManifest"`, `srcDir: "src/sw"`,
`filename: "index.ts"`, `registerType: "prompt"`) builds the worker to
`dist/index.js`. `tsconfig.app.json` excludes `src/sw` — the worker's
`/// <reference lib="webworker" />` would otherwise pull WebWorker types into
the DOM program.

**Decision: injectManifest, not generateSW.** Needed for custom message
handlers (push notifications in ErinnerMich, background sync in
Hausverwaltung). The cost is a hand-written SW file; the owned `base.ts` keeps
the baseline in one place and the per-app `index.ts` small.

**Decision: a new version waits for the user (`registerType: "prompt"`).**
The worker used to `skipWaiting()` on install and claim every client. Workers
Assets only serves the current deploy, so a new worker activating under an
open page evicted the old precache while that page still needed its lazy
route chunks — the next navigation failed. Now the new worker waits;
`UpdatePrompt` offers „Neu laden", which posts `SKIP_WAITING` and reloads every
tab together. `useAppUpdate` uses the plugin's `useRegisterSW` rather than
`workbox-window` directly because the plugin injects the correct worker URL,
scope and type.

**Decision: offline deep links.** `precacheAndRoute` only answers precached
URLs, so a reload of `/mieter/123` offline failed. The `NavigationRoute`
serves the precached `index.html` for every navigation outside the denylist.

**Decision: `UpdatePrompt` lives in `pwa`, not `layout`.** The layout must
build without the PWA plugin (its `useInstallPrompt` already works without
one). An app with its own design system uses `useAppUpdate()` and can list
`src/lib/pwa/UpdatePrompt.tsx` in `webBase.unmanaged`.

---

## router

react-router-dom 7 with the root layout route, typed route constants, and the
error and not-found pages.

Files:
- `router.tsx` → `src/lib/router.tsx` (scaffold) — `createBrowserRouter`: the
  root route renders `App` with `ErrorBoundary: RouteError` and
  `HydrateFallback: RouteFallback`; a pathless child with its own
  `ErrorBoundary` (so page errors render inside the shell) holds the lazy
  `HomePage` index route and the `*` route (`NotFound`)
- `routes.ts` → `src/lib/routes.ts` (scaffold) — typed route path constants
- `App.tsx` → `src/App.tsx` (scaffold) — the root layout route:
  `<AppShell title navItems><Outlet /><ScrollRestoration /></AppShell>`
- `HomePage.tsx` → `src/features/home/HomePage.tsx` (scaffold) — a starting
  page (`PageHeader` + `EmptyState`), so the lazy import `router.tsx` always
  had resolves
- `routing/RouteError.tsx` → `src/lib/routing/RouteError.tsx` (owned) — a
  German error page: a 404 response renders `NotFound`; a failed lazy chunk
  („Importing a module script failed" & co.) offers „Neu laden"; anything else
  says the data is safe and offers reload and „Zur Startseite". Logs the error;
  shows the stack only in development
- `routing/NotFound.tsx` (owned) — „Seite nicht gefunden" with the path and a
  link to `/`
- `routing/RouteFallback.tsx` (owned) — a centred spinner while the first
  route loads
- `routing/useDocumentTitle.ts` (owned) — `<Seite> · <App>` as the document
  title while a page is mounted (the app part is `index.html`'s `<title>`)

dependencies: `react-router-dom`, `lucide-react` (the starter nav icon).

**Decision: the shell is a layout route.** `AppNav`'s links are `NavLink`s,
so `AppShell` must render inside the router; the old postInstall said both
"wrap your app in `<AppShell>`" and "wrap your app in `<RouterProvider>`",
and the first reading throws. `main.tsx` renders `<RouterProvider>` alone.

**Decision: our own error pages.** Without an `errorElement`, React Router
shows its English developer screen — and after a deploy a missing lazy chunk
is the most common error a user sees. The owned pages link to `/` by literal,
because owned code can't import an app's `routes.ts`.

**Decision: `useDocumentTitle`, not React 19's `<title>` element.** The static
`<title>` in `index.html` comes first in the document and wins over a
rendered one.

The `routes.ts` pattern centralizes path strings so refactors are typesafe:

```typescript
export const ROUTES = {
  home: "/",
  // add more here
} as const;
```

---

## worker

Cloudflare Worker scaffolding: a shared router that owns the SPA, header and
error-boundary plumbing, and a thin per-app seam for `/api`.

Files:
- `base.ts` → `worker/base.ts` — `routeRequest()` and `json()`. **owned**
- `worker.ts` → `worker/index.ts` — `Env`, the default export, `handleApi()`. **scaffold**
- `wrangler.toml` → `wrangler.toml`. **scaffold**
- `headers` → `public/_headers` — security and caching headers for static assets. **scaffold**
- `tsconfig.worker.json` → `tsconfig.worker.json`. **scaffold**

devDependencies: `@cloudflare/workers-types`, `wrangler`.

scripts:
- `worker:dev`: `wrangler dev`
- `worker:deploy`: `wrangler deploy`

`base.ts` — `routeRequest(request, env, ctx, handleApi)`:
- `/healthz` → `{ ok: true }`
- `/api` and `/api/*` → `handleApi`, inside an error boundary: a throw is
  logged as `[api] <message>` (the message only — no stack, no request data)
  and answered with `500 { error: "internal" }`.
- `/assets/*` → plain 404. The Worker only sees such a request when no asset
  matched: a hashed file an older `index.html` still references. Passing it on
  would hit the SPA fallback, and the browser would get `index.html` with a 200
  where it expects JavaScript.
- everything else → `env.ASSETS.fetch(request)`, SPA fallback included.
- `json(data, status = 200)` for handlers. Every response the Worker generates
  itself (healthz, API, the assets 404) gets `X-Content-Type-Options: nosniff`
  and `Cache-Control: no-store` unless the handler set them; a `101` WebSocket
  upgrade passes through untouched.

`worker/index.ts` is ~20 lines: `export interface Env { ASSETS: Fetcher }`,
`export default { fetch: (r, e, c) => routeRequest(r, e, c, handleApi) }
satisfies ExportedHandler<Env>`, and a `handleApi` stub that answers
`404 { error: "not_found" }`, with a comment showing where `/api/<feature>` is
routed. The app never edits `base.ts`.

`wrangler.toml` ships `name = "<app-name>"`, a real `compatibility_date`
(`2026-09-30` — the newest date the minimum pinned wrangler, 4.145.0, supports;
a placeholder breaks `wrangler dev` and `--dry-run`), no `compatibility_flags`,
and `[assets]` with `directory = "./dist"`, `binding = "ASSETS"` and
`not_found_handling = "single-page-application"`. R2/KV bindings are the `sync`
template's business; the file only points at its `docs/sync.md`.

`public/_headers` (Vite copies `public/` into `dist/`) sets, for `/*`, a CSP of
`default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:
blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src
'self'; object-src 'none'; base-uri 'self'; form-action 'self';
frame-ancestors 'none'`, HSTS (`max-age=31536000; includeSubDomains`),
`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy:
strict-origin-when-cross-origin`, a `Permissions-Policy` denying camera,
microphone, geolocation, payment, usb and browsing-topics, and
`Cross-Origin-Opener-Policy: same-origin`; and `Cache-Control: public,
max-age=31536000, immutable` for Vite's content-hashed `/assets/*`. The CSP
needs no hashes or `'unsafe-inline'`: `theme-init.js` (layout) is an external
file, Vite's module scripts and vite-plugin-pwa's `registerSW.js` are
same-origin, and React `style` props go through the CSSOM, which `style-src`
doesn't restrict. There is no `upgrade-insecure-requests` — it breaks
`wrangler dev` on `http://localhost`. CSP and Permissions-Policy are per app.

`tsconfig.worker.json` adds `allowImportingTsExtensions` (index.ts imports
`./base.ts`), `noUnusedLocals`, `noUnusedParameters`, `moduleDetection:
"force"` and a `tsBuildInfoFile` under `node_modules/.tmp/` to the strict base.

**Decision: SPA mode, without `run_worker_first`.** Without
`not_found_handling = "single-page-application"`, reloading a client route such
as `/mieter/123` is a 404. With it and a `compatibility_date` ≥ 2025-04-01
(`assets_navigation_prefers_asset_serving`), a *navigation* that matches no
file gets `index.html` without invoking the Worker, while every other unmatched
request — `fetch("/api/…")`, a monitor on `/healthz`, a stale `/assets/*.js` —
still runs it. `run_worker_first = ["/api/*", "/healthz"]` was considered and
rejected: once any `run_worker_first` patterns exist, the assets layer applies
the SPA fallback to *every* path the list doesn't match (workers-shared
`asset-worker` `canFetch`: `has_static_routing` keeps `not_found_handling` for
all requests), so the Worker never sees a stale `/assets/*.js`; it would get
`index.html` with a 200 — and `_headers`' immutable cache rule. Verified with
`wrangler dev` 4.147. The price of leaving it out: a browser *navigating* to
`/api/…` or `/healthz` gets `index.html`. API calls are `fetch()`es and monitors
send no `Sec-Fetch-Mode`, so nothing in the fleet navigates there; an app that
needs it (an OAuth callback, a download link) adds `run_worker_first =
["/api/*"]` and accepts the stale-asset trade-off.

**Decision: headers split between `_headers` and the Worker.** Cloudflare
applies `_headers` to static-asset responses only — also when the Worker
returns `env.ASSETS.fetch()` unmodified — never to responses the Worker
generates ([Workers docs: Headers](https://developers.cloudflare.com/workers/static-assets/headers/)).
So the document-level policy (CSP, HSTS, framing, permissions) lives in
`_headers`, where it covers `index.html` and its SPA fallback, and `base.ts`
gives its own JSON and 404 responses `nosniff` + `no-store`. A per-app seam for
the policy, an owned file for the plumbing.

**Decision: no `nodejs_compat` by default.** It was set in the template — and
in five of nine apps — without any worker importing a Node built-in. The flag
changes the runtime (polyfills, globals), so it is added only where a worker
needs it. Existing apps drop or keep it one app at a time, with a deploy check
(`08-app-migrations.md`).

postInstall:
- "Edit wrangler.toml: set `name` to your app name and `compatibility_date` to today (keep it >= 2025-04-01 — SPA navigation serving needs it)"
- "Review public/_headers: the CSP and Permissions-Policy are per app — widen them only for what the app really uses"
- "Add `compatibility_flags = ["nodejs_compat"]` only if the worker imports a Node built-in"
- "Route `/api/<feature>` in handleApi() in worker/index.ts; never edit worker/base.ts — `update` overwrites it"
- "If using R2/KV: see the sync template's docs/sync.md"

---

## backup

An extra for apps with real user data: a way out for the data, and a way to
delete it. Needs `storage` (`src/lib/db/mutations.ts`) and `layout`.

Files (→ `src/lib/backup/`, owned unless marked):
- `codec.ts` — `encodeValue`/`decodeValue`: JSON with tagged objects for
  `Date`, `Map`, `Set`, `Blob`/`File`, `ArrayBuffer`/typed arrays, `undefined`,
  `NaN`/`±Infinity`, `bigint`; a real `$wb` key is escaped
- `format.ts` — the `BackupFile` envelope (`format: "web-base-backup"`,
  `formatVersion: 1`, `app` = the IndexedDB name, `dbVersion`, `exportedAt`,
  per-store `keyPath`/`autoIncrement`/`records`), `parseBackupFile`,
  `checkCompatibility`, `BackupError` (German messages)
- `backup.ts` — `exportBackup`, `restoreBackup` (atomic), `importBackup`,
  `wipeAllData`
- `persistence.ts` — `getStorageStatus`, `requestPersistentStorage`,
  `formatBytes` (de-DE), `useStorageStatus`
- `BackupCard.tsx` — „Daten & Sicherung": export, import, persistent
  storage, „Alle Daten löschen"; props `getDB`, `beforeWipe`, `migrate`
- `index.ts` — **scaffold** barrel

No dependencies (idb comes from `storage`, the primitives from `layout`).

**Decision: restore replaces, atomically.** Every value is decoded before the
transaction opens (only IndexedDB requests may be awaited inside one, or it
commits early); then one readwrite transaction clears and refills every store.
A failing record aborts it, so a bad file never leaves half a database.

**Decision: plain JSON is not a backup format.** `JSON.stringify` turns Dates
into strings and Blobs, Maps and Sets into `{}` without an error — the
failure surfaces only on restore. The codec keeps them, so a round trip is
exact.

**Decision: older backups are accepted.** A backup whose `dbVersion` is lower
than the database's is restored when all its stores exist; an app whose data
shape changed passes `migrate`. A newer backup, another app's, or one with
unknown stores is rejected with a German message.

**Decision: `window.confirm`, no dialog primitive.** Import and wipe are rare,
destructive actions; a native confirm is accessible and enough until a
`ConfirmDialog` earns its place in `layout`. `persist()` is only requested
behind a button, because Firefox shows a permission prompt.

---

## sync

End-to-end encrypted device sync of one JSON document over R2, paired by QR
link or typed code. **Extra**, not in `core`. Protocol v2.

Files (the template keeps `client/` and `worker/` subdirectories so the
relative `.ts` imports resolve the same in this repo, where the tests import
them, and in the app):

| Source | Destination | Policy | Contents |
|---|---|---|---|
| `client/types.ts` | `src/lib/sync/types.ts` | owned | `SyncEnvelope`, `SyncState`, `PullResult<T>`, `StorageLike`, `SyncClientOptions`, `RequestOptions` |
| `client/errors.ts` | `src/lib/sync/errors.ts` | owned | `SyncErrorCode`, `SyncError` (`code`, `status`, `retryAfter`), `syncErrorMessage()` (German), `isSyncError()` |
| `client/encoding.ts` | `src/lib/sync/encoding.ts` | owned | Crockford base32 (lenient decode), base64url without padding |
| `client/crypto.ts` | `src/lib/sync/crypto.ts` | owned | `deriveKeys()`, `seal()`, `open()` |
| `client/pairing.ts` | `src/lib/sync/pairing.ts` | owned | code encode/decode/format, `pairingUrl()`, `readPairingCode()`, `consumePairingFragment()` |
| `client/storage.ts` | `src/lib/sync/storage.ts` | owned | `guardStorage()`, `safeLocalStorage()`, `SyncStore` |
| `client/http.ts` | `src/lib/sync/http.ts` | owned | `send()` (timeout + abort), status → code, `readEnvelope()` |
| `client/client.ts` | `src/lib/sync/client.ts` | owned | `SyncClient` |
| `client/index.ts` | `src/lib/sync/index.ts` | **scaffold** | barrel + `export const syncClient = new SyncClient()` — the place to configure it |
| `worker/sync.ts` | `worker/sync.ts` | owned | `handleSync(request, env, { maxBytes? })`, `SyncEnv` |
| `worker/sync-http.ts` | `worker/sync-http.ts` | owned | `respond()`, `error()`, `bearer()`, `authHash()`, `sameHash()`, `normalizeEtag()`, `parseEnvelope()`, `readBounded()` |
| `sync.md` | `docs/sync.md` | **scaffold** | protocol, threat model, wiring, merge and QR recipes; the app adds its schema notes |

No dependencies (Web Crypto only). No enums or parameter properties
(`erasableSyntaxOnly`); imports carry explicit `.ts` extensions.

postInstall:
- "wrangler.toml: bind an R2 bucket as `SYNC` ([[r2_buckets]] binding = \"SYNC\", bucket_name = \"<app-name>-sync\")"
- "Optional rate limit: [[ratelimits]] name = \"SYNC_RATE_LIMIT\", namespace_id = \"1001\" with [ratelimits.simple] limit = 60, period = 60 (period must be 10 or 60)"
- "worker/index.ts: add `SYNC: R2Bucket` (and `SYNC_RATE_LIMIT?: RateLimit`) to Env and route /api/sync/* to `handleSync(request, env)` from ./sync.ts"
- "tsconfig.worker.json: set \"allowImportingTsExtensions\": true (worker/sync.ts imports ./sync-http.ts)"
- "src/main.tsx: before the router mounts, call `consumePairingFragment()` and pass a returned code to `syncClient.importPairingCode(code)` (handle `already_enabled` with a confirmation, see docs/sync.md)"
- "Use `syncClient.enable()` on the first device, `syncClient.sync(local, merge)` to sync and `syncClient.pairingUrl()` / `pairingCode()` to pair (merge recipe in docs/sync.md)"
- "Render the pairing QR code yourself, e.g. `bun add uqr` and `renderSVG(syncClient.pairingUrl())` (example in docs/sync.md)"
- "Apps with their own sync implementation (Hausverwaltung) must not run `web-base add sync` or `web-base check sync`"

### Protocol v2

**Keys.** The root secret is 16 random bytes. HKDF-SHA256 with salt
`daniel-rck/web-base sync v2` and `info` = salt + `/enc`, `/id`, `/auth`
derives a non-extractable AES-GCM-256 key, 80 bits encoded as 16 Crockford
base32 characters (the `objectId`), and 256 bits encoded as 43 base64url
characters (the bearer token).

**Envelope.** `{ "v": 2, "iv": b64url(12 bytes), "ct": b64url(AES-GCM) }` over
`JSON.stringify(document)`, with AAD = UTF-8 `web-base-sync/v2/<objectId>`.
Readers require `v === 2` (else `unsupported_version`); `v` versions the wire
format, the app's schema version lives inside the document.

**Pairing code.** Crockford base32 of `0x02 | secret | checksum`, where the
checksum is the first two bytes of SHA-256(UTF-8 `web-base-sync pairing` |
`0x02` | secret): 19 bytes, 31 characters, displayed in groups of four.
Decoding strips whitespace and hyphens, upper-cases, reads `I`/`L` as `1` and
`O` as `0`, and requires zero padding bits; a wrong length, version or
checksum is `invalid_code`. The link is `<page>#sync=<code without hyphens>` —
the same string, one parser; `readPairingCode()` also accepts HashRouter's
`#/route?sync=<code>`. `consumePairingFragment(win = globalThis.window)` reads
the code and removes it with `history.replaceState(history.state, "", cleaned)`,
keeping `history.state` (React Router stores its index there); it must run in
`main.tsx` before the router mounts and is a no-op without a window.

**Routes.** `/api/sync/<objectId>` only; `GET`, `PUT`, `DELETE`; other methods
`405` with `Allow: GET, PUT, DELETE`; unknown paths `404`; every response
`cache-control: no-store`; errors `{ "error": "<code>" }`. The handler checks,
in order: route → method → `SYNC_RATE_LIMIT?.limit({ key: objectId })` (`429`,
`retry-after: 60`) → bearer token (`401`). R2 key `v2/<objectId>`; the object's
`customMetadata.auth` holds hex(SHA-256(token)), compared in constant time.

- `GET`: `get(key)`, or with `If-None-Match` `get(key, { onlyIf: { etagDoesNotMatch } })`
  on the normalized ETag. `null` → `404`; wrong `auth` → `403`, checked before
  `304`/`200`; no body → `304` with `etag`; else `200` with the stored bytes,
  `etag: httpEtag`, `content-type: application/json`, `x-content-type-options: nosniff`.
- `PUT`: `content-length` over `maxBytes` (default 8 MiB) → `413`; the body is
  then read by `readBounded()`, which stops and cancels the stream as soon as
  it passes `maxBytes` (→ `413`), so a chunked upload without (or with a false)
  `content-length` is never buffered beyond the limit; not a v2 envelope →
  `400 bad_envelope`; neither `If-Match`
  nor `If-None-Match: *` → `428`. Create (`*`): existing object → `412`, else
  `put(…, { onlyIf: { etagDoesNotMatch: "*" }, customMetadata: { auth } })`,
  `null` → `412`. Update: missing → `412`, wrong `auth` → `403`, normalized
  `If-Match` ≠ `head.etag` → `412`, else `put(…, { onlyIf: { etagMatches: head.etag }, customMetadata })`,
  `null` → `412`. Success is `204` with `etag: httpEtag`.
- `DELETE`: missing → `204`; wrong `auth` → `403`; else delete → `204`.

`normalizeEtag()` strips `W/` (Cloudflare weakens ETags when it compresses a
response) and the quotes `httpEtag` carries.

**Client.** State `{ v: 2, code, etag, fp }` lives in `localStorage["web-base-sync"]`
behind the `StorageLike` seam; reads that throw count as "nothing stored",
writes that throw are `storage_unavailable`, and an invalid or v1 state is
removed. Every public method reads the state fresh. No ETag sends
`If-None-Match: *` on `PUT`, otherwise `If-Match`; a `GET` with an ETag sends
`If-None-Match`. Pull `404` → `missing` and clears the ETag; `304` →
`unchanged`; `412` → `conflict`. Every `200` pull and successful push records
the ETag together with `fp`, the `fingerprint()` (base64url SHA-256 of the
JSON) of the document the remote holds at that ETag. Every request carries `Authorization: Bearer
<token>`; the secret and the code never appear in a URL or header. Requests
use `cache: "no-store"` and a timeout covering the body (default 30 s),
combined with the caller's `AbortSignal` (`AbortSignal.any`, with a listener
fallback). Failures map to codes: `TypeError` → `offline`, deadline →
`timeout`, caller abort → `aborted`, `401` `unauthorized`, `403` `forbidden`,
`404` `not_found`, `409`/`412` `conflict`, `413` `too_large`, `429`
`rate_limited` (with `retryAfter`), other `4xx` `bad_request`, `5xx`
`server_error`, unparseable or ETag-less success `bad_response`.

```typescript
class SyncClient {
  constructor(options?: { endpoint?: string; storage?: StorageLike; fetch?: typeof fetch; timeoutMs?: number; storageKey?: string });
  isEnabled(): boolean;                        // never throws
  enable(): Promise<void>;                     // never replaces an existing secret
  pairingCode(): string;                       // grouped; throws not_enabled
  pairingUrl(base?: string): string;           // `${base}#sync=${code}`
  importPairingCode(code: string, options?: { replace?: boolean }): Promise<void>;
  pull<T>(options?: RequestOptions): Promise<{ status: "unchanged" } | { status: "missing" } | { status: "updated"; data: T }>;
  push(payload: unknown, options?: RequestOptions): Promise<void>;
  sync<T>(local: T, merge: (local: T, remote: T) => T | Promise<T>, options?: RequestOptions & { maxAttempts?: number }): Promise<T>;
  disable(options?: { deleteRemote?: boolean } & RequestOptions): Promise<void>;
}
```

`importPairingCode()` throws `already_enabled` while a different secret is
stored unless `replace` is set (the same code again is a no-op) and resets the
ETag. `sync()` is pull → merge → push, retried on `conflict` up to
`maxAttempts` (default 3); it skips the push when the merged document equals
the pulled one. Its `GET` is conditional only when `local` is exactly the
document stored at the known ETag (`fingerprint(local) === fp`), so a `304`
means "nothing to do"; otherwise it downloads and merges. Its `PUT` carries
the ETag *this attempt's* `GET` saw (`null` after a `404` → create), never the
one in storage, which another tab may have advanced meanwhile.

**Decision: a document fingerprint, not a persist callback.** `sync()` returns
the merged document and the app saves it, but the stored ETag used to claim
"this device has version E" before that save happened. When `merge` threw or
the tab closed in between, the next `sync()` got a `304` for its stale
document and pushed it back over the remote — a silent rollback. Storing
which document belongs to the ETag makes the claim true whatever the app
does: an unsaved result just doesn't match, and the next sync re-reads and
re-merges. The alternative, `sync(local, merge, persist)` with the ETag
committed after `persist`, changes the API and still trusts the app's save.
The cost: a sync with local edits downloads the document instead of getting a
`304` — fine for one JSON document per app. `disable({ deleteRemote: true })` sends `DELETE` first and only
then forgets the secret.

**Decision: pairing hands over the secret in a URL fragment, not through an
OTP slot.** The v1 docs described a 6-digit OTP that was both the server slot
id and the HKDF input of the key wrapping the secret: the server, which sees
the slot id, could unwrap the secret, and anyone else only had to hit one of
10⁶ slot ids while it was live — per-IP rate limits do not stop a botnet.
(The routes were never implemented.) The
second device now gets the root secret directly — QR link or typed code — and
the fragment never reaches the server. A PAKE-based handshake was rejected:
more code and a server round trip, for no gain when the user holds both devices.

**Decision: a 128-bit secret.** It keeps the code typeable (31 characters
instead of 55 for v1's 32 bytes) and matches a 128-bit security target; the
derived AES key is 256 bits, but brute force is bounded by the secret, and
2¹²⁸ is out of reach.

**Decision: the client stores the pairing code, not raw secret bytes.** The
checksum needs SHA-256, which Web Crypto only offers asynchronously; storing
the code keeps `pairingCode()` synchronous. The state is still the raw secret
in `localStorage` behind `StorageLike`: a script injected into the origin could
use a non-extractable key just as well as read the code, so the defence is a
strict CSP (`script-src 'self'`), not a different store.

**Decision: no QR dependency.** `patchPackageJson` is additive-only, so a
template dependency would be forced on every adopter and never removed by
`update`. Rendering the QR code is a per-app UI choice; `docs/sync.md` shows it
with `uqr`.

**Decision: KV dropped; rate limiting by object id through the Rate Limiting
binding.** The v1 KV token bucket was not atomic (read-modify-write on an
eventually consistent store) and kept raw client IPs as keys — personal data
at rest. Cloudflare advises against IP keys (shared NAT, rotating IPv6), and
keying by `objectId` limits each dataset without storing anything about the
person. The binding is optional; without it every request passes.

**Decision: the bearer token is derived from the secret.** HKDF gives the
server a credential that reveals nothing about the encryption key, so a leaked
`objectId` (logs, analytics) grants neither read nor write. The first `PUT`
binds `SHA-256(token)` to the object; that trust-on-first-use is safe because
only secret holders know the 80-bit `objectId`.

**Decision: no v1 migration.** A code search found no app using the template's
sync code (Hausverwaltung runs its own implementation, Tennisturnier a KV-only
protocol), so v2 changes route, envelope, key schedule and state without a
migration path. A v1 state in `localStorage` is not read (different key and
shape); a v1 envelope is `unsupported_version`.

**Decision: the R2 key is `v2/<objectId>`.** The version prefix lets a future
wire format live next to v2 in the same bucket during a transition.

Not verified against Cloudflare: whether `R2Conditional.etagDoesNotMatch: "*"`
acts as a wildcard on `put`. The worker therefore checks with `head()` first
and relies on the condition only to close the race; if R2 compares `*`
literally, two simultaneous creates both succeed and the loser's next push gets
`412`, after which `sync()` merges — no data is lost while devices keep their
local copy.

---

## Adding a new template

To add a new template (e.g. `notifications`):

1. Create `cli/templates/notifications/` with a `manifest.json` (name =
   directory name, description, files with their `policy`, dependencies) and
   the files it lists — nothing else; `templates.test.ts` rejects unlisted
   files and invalid manifests.
2. Take every dependency version from `cli/templates/pins.json`; a new
   package goes into `pins.json`, `07-conventions.md` and the skill's
   `tech-stack.md` together (`pins.test.ts`).
3. Add a section to this spec and a row to the inventory.
4. If it should be in `core`, add it to `cli/templates/core/manifest.json`
   `extends`.
5. Add `skill/references/notifications.md` (required — `skill.test.ts`) and
   list it in `SKILL.md` and `05-skill.md`.
6. If its code needs React, jsdom or the Vite plugins to test, put the tests
   in `cli/template-tests/notifications/`; pure TypeScript can be tested in
   this repo under `cli/test/`.
7. Record it under `## [Unreleased]` in the CHANGELOG; the version follows
   the rule in `02-cli.md`.

## Verifying a template

`bun run test` validates every manifest and the doc guards. For the output
itself:

```bash
# from web-base root
node cli/dist/index.js init --cwd "$(mktemp -d)/scratch-app" --name scratch-app
node cli/dist/index.js add <template> --cwd <that dir>
# then, in it: bun install && bun run lint && bun run typecheck && bun run test && bun run build
```

That is exactly what the `scaffold` job in `tools-ci.yml` runs on every
change (with `backup`, `sync` and the template tests), so a template that
doesn't install, lint, typecheck, test and build fails CI.
