# Changelog

All notable changes to `web-base` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Versions follow the rule in `docs/specs/02-cli.md` (*Versioning*): until 1.0.0
a breaking change or a `feat:` bumps the minor, a `fix:` the patch; only
changes to the shipped CLI, templates and reusable workflows are versioned.
Entries collect under `[Unreleased]` until the release commit. Apps catch up
with `web-base update <template> --apply` (and `add <template>` for new
dependencies); the stamped `webBase.version` in an app's `package.json`
records which base it last pulled.

## [Unreleased]

## [0.6.0] - 2026-10-02

### Migration

0.6.0 moves the machinery out of the scaffold seams into owned files, so each
app migrates once — one PR per app, in that app's repo, with a deploy check.
Per-app notes (HamsterFlight, Hausverwaltung, Tonspur) are in
[`08-app-migrations.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/08-app-migrations.md#migrating-an-app-to-060).

1. **Pull the owned files** of the blocks the app already uses. `update` never
   writes `webBase.unmanaged` files and never adopts a block:

   ```bash
   bunx github:daniel-rck/web-base#v0.6.0 check core --diff
   bunx github:daniel-rck/web-base#v0.6.0 update core --apply
   ```

2. **Add the new owned files and dependencies.** `add` skips every file that
   exists; delete the scaffold copies the app doesn't want afterwards (e.g. a
   second `HomePage`):

   ```bash
   for t in testing pwa router worker storage; do
     bunx github:daniel-rck/web-base#v0.6.0 add "$t"
   done
   ```

3. **Rewrite the seams** onto the owned files:
   - `src/lib/ui/theme.css` becomes the seam — `@import "./tokens.css";`, then
     `:root { --accent-h: <hue>; }`, then only the app's own tokens. Delete
     everything `tokens.css` now defines.
   - `src/lib/db/db.ts`: `export const getDB = createDBOpener<AppSchema>({
     name, version, upgrade })` from `./open.ts`. **Keep the app's existing
     database `name` and `version`** — a new name starts every user with an
     empty database.
   - `src/sw/index.ts`: `registerAppShell()` from `./base.ts`, then only the
     app's own handlers; no `skipWaiting()`, `clientsClaim()` or
     `precacheAndRoute()` of its own. In `vite.config.ts` set
     `registerType: "prompt"`; render `<UpdatePrompt />` next to
     `<RouterProvider>` in `main.tsx`. `tsconfig.sw.json` needs
     `"allowImportingTsExtensions": true`.
   - The router: the shell as the root layout route (`src/App.tsx`),
     `ErrorBoundary: RouteError`, `HydrateFallback: RouteFallback`, and
     `{ path: "*", Component: NotFound }`; `main.tsx` renders
     `<RouterProvider>` without an `AppShell` around it.
   - `worker/index.ts`: `fetch: (request, env, ctx) => routeRequest(request,
     env, ctx, handleApi)`. In `wrangler.toml`: `not_found_handling =
     "single-page-application"` under `[assets]`, no `run_worker_first`,
     `nodejs_compat` only if the worker imports a Node built-in,
     `compatibility_date` ≥ 2025-04-01. `tsconfig.worker.json` needs
     `"allowImportingTsExtensions": true`. Review the CSP in the new
     `public/_headers`.

4. **Take the new hue and `theme_color`** from the table in
   [`04-layout-system.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/04-layout-system.md#color-tokens):
   `--accent-h` in `theme.css`, `theme_color` in `vite.config.ts` and
   `<meta name="theme-color">` in `index.html`. Every app's `theme_color`
   changes, Pizzateig's and Tankzettel's too (`accent-600` is darker).

5. **Search the app's own code** for what the new tokens replace — white text
   on accents, removed focus outlines, semantic text on its own tint:

   ```bash
   grep -rnE 'text-white|outline-none|text-(success|warning|danger|info)\b' src --exclude-dir=lib
   ```

   Use `text-fg-on-accent`, the default focus outline, and `text-*-fg`.

6. **Verify and pin.** `bun run lint && bun run typecheck && bun run test &&
   bun run build`, then `web-base check --strict` (never in HamsterFlight),
   `web-base pins` (`useLiveQuery` needs React ≥ 19.2), `bunx wrangler deploy
   --dry-run`, and pin the caller to `web-base-check.yml@v0.6.0`.

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
- **Breaking: the design tokens move into an owned `tokens.css`.** `theme.css`
  was the whole token file *and* a scaffold seam, so no token fix ever reached
  an existing app. It is now a five-line seam that imports `tokens.css` and sets
  `--accent-h`; `update layout --apply` keeps the tokens current. Apps replace
  their `theme.css` once (see *Migration*).
- **Breaking: accent hues are redistributed** so every accent sits ≥25° from the
  semantic hues and from every other app — the old table broke its own rule
  three times. Tennisturnier 155 → 175, Minispiele 195 → 200, Zeiterfassung
  230 → 255, Hausverwaltung 250 → 280, ErinnerMich 285 → 305, Tonspur 320 →
  330; Pizzateig 50 and Tankzettel 110 stay. 355 is the free slot and the new
  template default (was 250).
- **Breaking: darker accent and danger shades** so every text pair reaches WCAG
  AA (4.5:1) at every app hue: accent-500…900 one step darker (primary
  buttons at L 0.49 instead of 0.55), `danger` 0.60 → 0.55, `fg-subtle` 0.60 →
  0.54 (light) / 0.55 → 0.62 (dark). White on several accent buttons was
  3.9:1, badge text on its tint as low as 1.9:1.
- **Breaking: one file per layout primitive, `ref` as a prop.** `primitives.tsx`
  (221 lines) is now a barrel over `Button`, `Card` (+ `SectionCard`), `Chip`,
  `Badge`, `Spinner` and `EmptyState`; `forwardRef` is gone (React 19). Imports
  from `primitives.tsx` keep working.
- **Breaking: `PageHeader` is the page's `<h1>`; the header title is a
  `<span>`.** Every page outline used to open with the app name as `<h1>`, and
  the page title sat at `<h2>`, level with its sections.
- **`useTheme` is one store for the page.** Each call kept its own state, so a
  second consumer (a chart reading `resolvedTheme`) went stale when the toggle
  changed; other tabs now follow via the `storage` event, and the hook no
  longer throws without `matchMedia` (jsdom). `setTheme` is exported on its own.
- **Breaking: a new service-worker version waits for the user.** `sw.ts`
  called `skipWaiting()` on install, so a deploy activated the new worker under
  open pages and evicted the lazy chunks they still needed. The owned
  `src/sw/base.ts` (`registerAppShell()`) activates only on `SKIP_WAITING`; the
  new `UpdatePrompt` („Update verfügbar – neu laden") and `useAppUpdate()` hook
  (`useRegisterSW`, `registerType: "prompt"`, hourly re-check) drive it.
  `src/sw/index.ts` shrinks to the app's own handlers.
- **Breaking: the router renders the shell as its root layout route.** The
  template ships `src/App.tsx` (`AppShell` around `<Outlet />`), error and 404
  pages, and the `HomePage` its lazy import always pointed to; `main.tsx`
  renders `<RouterProvider>` alone. The old instructions said to wrap the app
  in both `AppShell` and `RouterProvider`, and the first reading throws.
- **`init` builds a complete app.** It applies the new `app` template — `core`
  plus `index.html`, `vite.config.ts`, the tsconfigs, `src/main.tsx`,
  `src/index.css` and `.gitignore` — and fills the app name into every
  `<app-name>` placeholder of the seams it creates. Next steps list only what a
  fresh app still needs.
- **`vite.snippet.md` is gone**; the VitePWA block lives in the `app`
  template's `vite.config.ts` and the skill's `pwa.md`. `check` reports a
  leftover copy as obsolete.
- **Breaking: the `sync` template speaks protocol v2.** v1 state, envelopes,
  object ids and the `/api/sync/<id>/data.json` route are gone without a
  migration — no app used the template's sync code. A 128-bit root secret feeds
  HKDF-SHA256 with separate labels for a non-extractable AES-GCM-256 key, an
  80-bit object id and a 256-bit bearer token; envelopes are `{ v: 2, iv, ct }`
  with the object id as AAD. Client and worker are split into one-concern files
  under `client/` and `worker/`; `src/lib/sync/index.ts` and `docs/sync.md` are
  scaffold seams, everything else is owned.
- **Breaking: the sync worker authenticates every request and no longer uses
  KV.** `GET`/`PUT`/`DELETE /api/sync/<objectId>` need `Authorization: Bearer
  <token>`; the first write binds the object to `SHA-256(token)`, so a leaked
  object id gives neither read nor write. Creates need `If-None-Match: *`,
  updates `If-Match`, bodies are capped at 8 MiB and must be v2 envelopes,
  responses are `no-store`. Rate limiting moves from a KV bucket keyed by raw
  IPs to the optional Rate Limiting binding `SYNC_RATE_LIMIT`, keyed by object
  id — no IP addresses at rest. Apps bind R2 as `SYNC` (plus optional
  `[[ratelimits]]`).
- **`tools-ci.yml` follows the workflow rules too:** `permissions: {}` with
  per-job grants, a concurrency group, SHA-pinned actions, `persist-credentials:
  false`, and Bun from `packageManager` instead of a hard-coded version.
- **Breaking: `useLiveQuery` needs React ≥ 19.2 and imports `./mutations.ts`.**
  It runs the query through `useEffectEvent` instead of writing a ref during
  render, returns `{ data: undefined, loading: true }` while `[storeName,
  ...deps]` changes (it used to show the previous key's data as current), and
  keeps the last good data on error. `update storage --apply` brings
  `mutations.ts` along.
- **`storage`'s `db.ts` is a thin seam** over the new owned `open.ts`
  (`createDBOpener`) and `mutations.ts` (`mutationChannel`, `notifyMutation`,
  `clearStores`), with a per-app database name and an `if (oldVersion < N)`
  migration ladder.
- **`worker/index.ts` delegates to the owned `worker/base.ts`**
  (`routeRequest`, `json`); `wrangler.toml` turns on SPA mode
  (`not_found_handling = "single-page-application"`), drops `nodejs_compat`
  from the default, and `tsconfig.worker.json` gains
  `allowImportingTsExtensions`.
- **`core` extends `testing`.**

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
- **Keyboard focus survives forced-colors mode.** Focus was a box-shadow ring
  with `outline-none`, which Windows high contrast removes; it also drew a
  white halo in dark mode. All controls use a real outline now.
- **Disabled secondary and ghost buttons looked enabled**; hover no longer
  applies to disabled controls.
- **Text on fills used `text-white`** instead of `--color-fg-on-accent`, and
  badge text sat on its own semantic tint at 1.9–3.5:1.
- **The spinner wasn't announced**: `role="status"` carried only an
  `aria-label`; it now contains visually hidden text.
- **`ThemeToggle` named only the current state**; it now says what a click does.
- **iPadOS 13+ never saw the install button** (it reports a Macintosh user
  agent); a `beforeinstallprompt` fired before the shell mounted was lost; a
  failing `prompt()` was an unhandled rejection. The iOS dialog is labelled by
  its heading.
- **The sticky sidebar ignored the notch inset** the header absorbs.
- **`init` produced a scaffold that did not build** (no entry files, no
  React/Vite/TypeScript dependencies, a lazy import of a page no template
  shipped). The deferred item in `08-app-migrations.md` is resolved.
- **The sync client no longer overwrites or wedges remote data.** The first push
  overwrote the remote object; a pull `404` kept a stale ETag so every later push
  failed with `412`; `push`/`pull` threw after a reload unless `isEnabled()` ran
  first; `enable()` replaced an existing secret; `304` and `404` looked the same;
  a blocked `localStorage` crashed the app; unvalidated JSON reached the caller.
- **The sync docs described OTP pairing routes that never existed and could not
  have been secure** (the server could unwrap the secret, and 10⁶ codes are
  guessable), and the postInstall referenced a `syncClient` that did not exist.
- **A failed IndexedDB open was cached forever** (VersionError, quota, private
  mode); the next `getDB()` now retries. **An open tab no longer blocks a newer
  tab's schema upgrade** — it closes its connection and reloads — and a
  connection the browser dropped (Safari) is reopened. `clearAll()` on a
  database without stores no longer throws.
- **The storage postInstall showed a call form that doesn't exist**
  (`useLiveQuery(db.<store>, …)`).
- **Reloading a client route 404'd** on Workers Assets without SPA mode (new
  apps; existing apps add one `wrangler.toml` line). **A throwing API handler
  returns 500 `{ "error": "internal" }`** instead of Cloudflare's exception
  page, and **a stale hashed asset gets a 404** instead of `index.html`
  served as JavaScript.

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
- **Text-on-tint tokens** `--color-{success,warning,danger,info}-fg` (light and
  dark) and `--color-danger-strong` for the danger hover.
- **Motion and radius tokens promoted from Pizzateig:** `--animate-fade-in`,
  `--animate-slide-up` (with keyframes), `--radius-2xl`, and a
  `prefers-reduced-motion` reset that spares only the spinner.
- **The theme is tested:** every text pair at every hue in the 04 table, light
  and dark, both gamut-mapping modes; the hue spacing rule; the two dark blocks
  staying identical; and the spec showing `tokens.css`/`theme.css` verbatim.
- **`OfflineIndicator`** in the header (and `useOnlineStatus()`): a warning
  badge while offline, announced through an always-mounted status region.
- **A skip link** („Zum Inhalt springen") to `<main id="main">`.
- **`buttonClassName()`** styles a router `<Link>` as a button; `Badge` has an
  `info` variant; `EmptyState` takes `titleAs`.
- **Offline deep links**: the service worker serves `index.html` for every
  navigation (except `/api` and `/healthz`), so reloading `/mieter/123`
  offline opens the app.
- **German error pages** (`RouteError`: a missing lazy chunk after a deploy
  offers „Neu laden"), `NotFound` for `*`, `RouteFallback` while the first route
  loads, and `useDocumentTitle()` — React Router showed its English developer
  screen before.
- **`import/no-unassigned-import` allows CSS imports** in the shared oxlint
  config (every app imports its stylesheet).
- **Devices pair by QR link or typed code; the server never sees the key.**
  `syncClient.pairingCode()` shows a checksummed 31-character Crockford code
  (forgiving input), `pairingUrl()` puts the same string in a `#sync=` fragment
  for a QR code, `importPairingCode()` adopts it (`already_enabled` unless
  `{ replace: true }`), and `consumePairingFragment()` removes it from the
  address bar in `main.tsx`, keeping `history.state`. No QR library ships;
  `docs/sync.md` shows `uqr`.
- **`syncClient.sync(local, merge)`, `disable({ deleteRemote })` and typed
  errors.** Pull → merge → push with retry on conflict; `SyncError` carries a
  stable `code`, `status`, `retryAfter` and a German message
  (`syncErrorMessage()`); requests time out after 30 s and honour an `AbortSignal`.
- **The sync template is typechecked and tested in this repo.**
  `tsconfig.templates.json` runs as part of `bun run typecheck`; `cli/test/sync/`
  covers encodings, pinned key-schedule vectors, pairing, storage, the client
  state machine, the worker and an end-to-end run against a fake R2 bucket.
- **`tools-ci.yml` builds what it ships.** New jobs: `scaffold` runs `init`,
  adds `backup` and `sync`, and lints, typechecks, tests (with the template
  tests in `cli/template-tests/`) and builds the result, then runs `check
  --strict`, `pins` and `wrangler deploy --dry-run` on it; `bunx-install` runs
  `bunx github:<repo>#<sha> --version`; `workflow-lint` runs actionlint (with
  shellcheck) and zizmor. Typecheck and build of a scaffold were left out
  before as "slow and flaky", which is how an `init` that didn't build went
  unnoticed.
- **`testing` template**: `vitest.config.ts` (scaffold, merges
  `vite.config.ts`), owned `src/test/setup.ts` (fake-indexeddb, jest-dom
  matchers, cleanup, a `matchMedia` stub) and `src/test/environment.test.tsx`;
  pins Vitest, jsdom, fake-indexeddb and Testing Library, including the new
  `@testing-library/dom`.
- **`public/_headers`** (worker, scaffold): CSP `script-src 'self'`, HSTS,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP, and
  immutable caching for `/assets/*`. Worker responses get `nosniff` and
  `no-store` from `base.ts` (Cloudflare doesn't apply `_headers` to them).
- **`backup` extra**: export, import and wipe of the whole IndexedDB as a
  versioned JSON file, with a codec that keeps Dates, Maps, Sets, Blobs,
  binary data and `undefined`; an atomic restore; persistent-storage helpers;
  a German `BackupCard` for the settings page.

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

- **`useLiveQuery` opened the wildcard channel twice** when called with `"*"`
  as the store name, so every mutation ran the query twice.

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

### Added

These shipped with PR #12, which merged while the version still read 0.3.1;
they were listed under 0.3.0 before.

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

- **`webBase.unmanaged` lets one app take a single owned file off the base.**
  `check` skips a listed file and reports it, so Hausverwaltung's
  `useLiveQuery` — 85 call sites predating the template's signature — doesn't
  keep its CI red forever.
- **`AppHeader` survives a notch and takes `maxWidthClass`.** The header
  absorbs `env(safe-area-inset-top)` with its height on the inner container,
  and an app with a wider content column sets the header's width to match.

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
  `~7.0.2`, `@types/node` `^26.4.0`, `@cloudflare/workers-types` `^5.20260706.1`,
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

## [0.1.0] - 2026-05-20

- Initial baseline: CLI (`init`/`add`/`update`), templates (`core`, `hygiene`,
  `biome`, `layout`, `storage`, `pwa`, `router`, `worker`, `sync`), the Claude
  Code skill, and the reusable GitHub Actions workflow.

[Unreleased]: https://github.com/daniel-rck/web-base/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/daniel-rck/web-base/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/daniel-rck/web-base/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/daniel-rck/web-base/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/daniel-rck/web-base/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/daniel-rck/web-base/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/daniel-rck/web-base/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/daniel-rck/web-base/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/daniel-rck/web-base/releases/tag/v0.1.0
