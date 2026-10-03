# 08 — App Migrations

The state of every app on the web-base baseline, the gaps that remain, and the
deviations each app has earned.

**This is a living record, not a forward-looking plan.** Its previous form
described three apps and a migration sequence, and by the time anyone read it
the work it described was done (Hausverwaltung had left Dexie; Tennisturnier had
a router) while six apps it never mentioned had drifted in their own directions.
When you change an app's relationship to the base, update the row here in the
same PR.

## Migration sequence (for a new or newly-adopted app)

The general order, applied per app:

1. **Tooling baseline.** `web-base add hygiene` + `web-base add oxc`. Switch
   CI to the reusable workflow. Add `packageManager`. Fill in package.json
   metadata and the pin table from `07-conventions.md`.
2. **Router.** `web-base add router` if the app has no `react-router-dom`.
3. **Storage.** idb via `web-base add storage`.
4. **PWA.** `injectManifest`, never `generateSW`.
5. **Worker.** Align with the worker template.
6. **Layout.** `web-base add layout`, then refactor screens onto `<AppShell>`.
7. **Color accent.** Set `--accent-h` per the table in `04-layout-system.md`.

oxc (oxlint + oxfmt) must land before any template that ships TypeScript,
because those files are written against oxfmt's formatting rules.

---

## Fleet state

Snapshot of 2026-10-02 (stamps read from each app's `package.json`). All nine
wire `web-base-check.yml`, still `@main`; from web-base 0.6.0 the check runs
the CLI at the app's stamped version, so `main` no longer breaks them.

| App | Stamp | Lint | Router | Storage | PWA | Worker | CI | Layout |
|---|---|---|---|---|---|---|---|---|
| ErinnerMich | 0.5.0 | oxc | react-router 7 (`BrowserRouter`) | idb | injectManifest | Assets + `/api` | reusable | own shell over base tokens |
| HamsterFlight | 0.5.0 | oxc | — | — | — | Assets only | reusable + own gates | — (canvas game) |
| Hausverwaltung | 0.3.1 | Biome | react-router 7 (`HashRouter`) | idb + query layer | injectManifest | Assets + own R2/KV sync (not the template) | reusable | own design system |
| Minispiele | 0.3.1 | Biome | react-router 7 | idb | injectManifest | Assets + `/api` | reusable + e2e | base |
| Pizzateig | 0.3.1 | Biome | react-router 7 | idb | injectManifest | Assets + `/api` | reusable | base + warm fork |
| Tankzettel | 0.5.0 | oxc | react-router 7 | idb | injectManifest | Assets + `/api` | reusable + guard | **base, zero drift** |
| Tennisturnier | 0.5.0 | oxc | react-router 7 | idb | injectManifest | Assets + KV sync | reusable | base |
| Tonspur | 0.5.0 | oxc | react-router 7 | idb | injectManifest | Assets | reusable | base + game skin |
| Zeiterfassung | 0.5.0 | oxc | react-router 7 | idb | injectManifest | Assets + `/api` | reusable | base |

Hausverwaltung, Minispiele and Pizzateig still lint with Biome: they take
`web-base add oxc` first (see the 0.4.0 CHANGELOG entry).

`daniel-rck/Codes` also carries a `webBase` stamp (0.2.1) but is not part of
the fleet listed here; whether it joins is open.

**Tankzettel is the reference implementation.** Its `src/lib/ui/` was
byte-identical to the template except for the `--accent-h` line, and it was the
first app to wire the `web-base-check.yml` drift guard. When a question about
"what should this look like" comes up, look there first.

---

## Accepted deviations

A deviation is accepted when the app's version is *better for that app*, not
merely different. Each one is also recorded in the app's own `CLAUDE.md`.

### ErinnerMich — own app shell and `BrowserRouter`

`src/components/AppShell.tsx` replaces the template's `AppShell`: a greeting
header, a centre floating action button and safe-area padding. These are product
decisions, not drift. It mounts `<BrowserRouter>` with `<Routes>` rather than
the template's `createBrowserRouter` — a known gap, not yet an accepted
deviation: adopting 0.6.0's layout route and `RouteError` needs the data
router. The app composes the base's `AppHeader`, `AppNav`,
`primitives`, `useTheme` and `InstallButton` rather than duplicating them.

### Hausverwaltung — own design system

`src/lib/ui/{layout,ui,shared,charts,sync}/` is a ~30-component design system
(Modal, Drawer, Tabs, DataTable, Wizard, FormField, Toast, KpiTile …) that
substantially exceeds the layout scaffold. Its `AppShell` and `PageHeader` are
rewritten; `AppHeader` and `AppNav` are replaced by `layout/Nav.tsx`.

Also: `HashRouter` rather than `createBrowserRouter`, because the app shares
data through hash-encoded URLs (`#/import/:payload`) and wants zero server
config. Its own worker sync (OTP pairing, R2 snapshots with `If-Match`, KV rate
limits) predates the template and is not wire-compatible with sync v2. **Do not
run `web-base add sync` or `web-base check sync` in Hausverwaltung.** Adopting
the template would be a migration of its own (new object ids under `v2/`,
re-pair every device). Follow-up: review whether its OTP pairing derives a wrap
key from the OTP alone — the design the template abandoned in 0.6.0 because
the server could unwrap the secret. Its `vitest.config.ts` uses `@cloudflare/vitest-pool-workers` projects.

### Pizzateig — warm theme fork

`theme.css` keeps hue-65 warm-tinted surfaces, `--color-accent-warm`,
`--shadow-warm` and `.slider-warm`. That palette is the product's identity. The
generally-useful parts of its fork (the `--animate-*` keyframes, `--radius-2xl`,
the `prefers-reduced-motion` reset) are promoted into the owned `tokens.css` in
0.6.0 — earlier versions of this page claimed that had happened in 0.3.0; it had
not. Since 0.6.0 the warm palette lives in Pizzateig's `theme.css` seam on top
of `tokens.css` (verify the promoted names and values against Pizzateig's fork
when it migrates).

### Tennisturnier — KV-only sync

Tournament data is opt-in shared through a share-code, not privacy-sensitive in
the way the `sync` template's E2E encryption is built for. The simpler KV-only
protocol stays; see `Tennisturnier/docs/specs/sync.md`. The `TOURNAMENTS` KV
binding name is hard-wired in `functions/_shared/kv.ts` — do not rename it.

### Tonspur — dark-only, single route

A cinema-themed quiz with one route. `AppNav` would be pure overhead, and the
app deliberately runs dark-only (`color-scheme: dark`), so it ships no
`ThemeToggle`. Its `.tonspur` palette aliases the base tokens rather than
forking them.

### HamsterFlight — not a React app at all

A faithful pixi.js port of a Flash game, reconstructed from bytecode analysis.
It has one runtime dependency (`pixi.js`), no React, no Tailwind, no router, no
`src/lib/ui`, no `src/lib/db`, no PWA, and its worker serves static assets with
`not_found_handling: "404-page"` — correct for a single-page game, where the SPA
fallback would be wrong.

It shares the *tooling* baseline (Bun, oxlint + oxfmt, the reusable CI job, hygiene
files) and nothing else. `web-base check` reports layout/storage/router/pwa as
"not adopted" for this repo, which is the intended answer, so **do not run
`check --strict` here**.

Two further deviations: its README is English (it is a technical port write-up
whose audience is the emulation community, not an end-user app README), and its
CI keeps its own `guards`, `actionlint`, `smoke`, `dependency-review` and
`gate`/`deploy` jobs alongside the reusable one. The `gate` job converts the
`CLOUDFLARE_API_TOKEN` secret into a job output because `secrets` cannot be
referenced from a job-level `if` — it must survive verbatim.

---

## Migrating an app to 0.6.0

0.6.0 moves machinery out of scaffold seams into owned files, so this is a
one-time migration per app — one PR per app, in that app's repo, with a deploy
check. The CHANGELOG's *Migration* section has the snippets; in short:

1. `bunx github:daniel-rck/web-base#v0.6.0 update core --apply` — pulls the
   owned files of the blocks the app already uses (and never touches
   `webBase.unmanaged` files).
2. `add testing`, `add pwa`, `add router`, `add worker`, `add storage` — copy
   the new owned files (`tokens.css`'s siblings, `src/sw/base.ts`,
   `src/lib/pwa/*`, `src/lib/routing/*`, `worker/base.ts`,
   `src/lib/db/{open,mutations}.ts`) and patch `package.json`. Delete unwanted
   scaffold copies afterwards.
3. Rewrite the seams onto the new owned files: `theme.css` (the five-line
   seam + the new hue), `db.ts` (`createDBOpener`), `src/sw/index.ts`
   (`registerAppShell()`), `worker/index.ts` (`routeRequest`), the router
   (layout route, `ErrorBoundary`, `*`, `HydrateFallback`), `main.tsx`
   (`<UpdatePrompt />`).
4. New accent hues (each a one-line change in `theme.css`). Every app also
   takes its new `theme_color` (manifest and `<meta name="theme-color">`)
   from the table in `04-layout-system.md` — Pizzateig and Tankzettel too,
   because `accent-600` got darker:

   | App | Old → new `--accent-h` |
   |---|---|
   | Tennisturnier | 155 → 175 |
   | Minispiele | 195 → 200 |
   | Zeiterfassung | 230 → 255 |
   | Hausverwaltung | 250 → 280 |
   | ErinnerMich | 285 → 305 |
   | Tonspur | 320 → 330 |
   | Pizzateig, Tankzettel | unchanged |

5. Grep the app's own code for `text-white`, `focus-visible:outline-none`
   and `text-{success,warning,danger}` on a tint (→ `text-*-fg`).
6. `bun run lint && bun run typecheck && bun run test && bun run build`,
   `web-base check --strict` (not in HamsterFlight) and `web-base pins`, then
   bump the `web-base-check.yml` ref.

Per-app notes: HamsterFlight takes only step 1 (oxc) and step 6. Hausverwaltung
keeps its design system and sync (do not `add sync`); its `useLiveQuery` stays
unmanaged — it gets `open.ts`/`mutations.ts` with plain `web-base add storage`
(never `--force`), and its own Vitest config adds `./src/test/setup.ts` to
`setupFiles`. Tonspur stays dark-only and without `AppNav`.

---

## Deferred — known gaps, not yet scheduled

**Worker runtime settings.** `compatibility_date` currently spans 2025-10-01
(ErinnerMich, Minispiele) to 2026-08-31 (HamsterFlight), and
`compatibility_flags = ["nodejs_compat"]` is set in five of nine apps with no
discernible rule.

**Decision: these are deliberately out of scope for a fleet-wide alignment
pass.** Both change Cloudflare Workers *runtime* semantics, and eight of nine
apps auto-deploy on merge to `main` through Workers Builds — so a batch bump
would ship nine simultaneous runtime changes with no per-app smoke test. Each
app raises its own `compatibility_date` in its own PR, with a deploy check.
The same applies to `nodejs_compat`: add it where a worker actually needs a Node
built-in, remove it where nothing does, one app at a time. Since 0.6.0 the
worker template ships SPA mode and no `nodejs_compat`; existing apps adopt
`not_found_handling = "single-page-application"` the same way, one at a time
(HamsterFlight keeps `404-page`).

---

## Cross-app checklist

Re-verify after any base change:

- [ ] All nine repos have the same `oxlint.base.json` and `.oxfmtrc.json` (per-app
  overrides live in `.oxlintrc.json` / `.prettierignore`)
- [ ] All React repos have identical `src/lib/db/{open,mutations,useLiveQuery}.ts`
  (Hausverwaltung's `useLiveQuery.ts` is unmanaged) and `src/test/setup.ts`
- [ ] All React repos have identical owned files in `src/lib/ui/` (the
  `theme.css` seam differs by its `--accent-h` and app tokens)
- [ ] All repos with a Worker have identical `worker/base.ts` and a reviewed
  `public/_headers`
- [ ] All nine repos call `web-app-ci.yml` and wire `web-base-check.yml`, pinned `@vX.Y.Z`
- [ ] All nine repos have the pinned `packageManager` (`07-conventions.md`) and a `bun.lock`
- [ ] `bunx github:daniel-rck/web-base#vX.Y.Z pins` is clean in all nine
- [ ] All nine repos have LICENSE, CONTRIBUTING.md, SECURITY.md, `.editorconfig`
- [ ] All nine repos have `CLAUDE.md` and `docs/specs/`
- [ ] Every app's `--accent-h` is distinct and ≥25° from the reserved semantic hues
- [ ] `bunx github:daniel-rck/web-base#vX.Y.Z check core` is clean in all nine
