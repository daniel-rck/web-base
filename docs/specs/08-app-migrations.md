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

1. **Tooling baseline.** `web-base add hygiene` + `web-base add biome`. Switch
   CI to the reusable workflow. Add `packageManager`. Fill in package.json
   metadata and the pin table from `07-conventions.md`.
2. **Router.** `web-base add router` if the app has no `react-router-dom`.
3. **Storage.** idb via `web-base add storage`.
4. **PWA.** `injectManifest`, never `generateSW`.
5. **Worker.** Align with the worker template.
6. **Layout.** `web-base add layout`, then refactor screens onto `<AppShell>`.
7. **Color accent.** Set `--accent-h` per the table in `04-layout-system.md`.

Biome must land before any template that ships TypeScript, because those files
are written against Biome's formatting rules.

---

## Fleet state

As of web-base 0.3.0.

| App | Stamp | Router | Storage | PWA | Worker | CI | Layout |
|---|---|---|---|---|---|---|---|
| ErinnerMich | 0.3.0 | react-router 7 (`BrowserRouter`) | idb | injectManifest | Assets + `/api` | reusable | own shell over base tokens |
| HamsterFlight | 0.3.0 | — | — | — | Assets only | reusable + own gates | — (canvas game) |
| Hausverwaltung | 0.3.0 | react-router 7 (`HashRouter`) | idb + query layer | injectManifest | Assets + R2/KV sync | reusable | own design system |
| Minispiele | 0.3.0 | react-router 7 | idb | injectManifest | Assets + `/api` | reusable + e2e | base |
| Pizzateig | 0.3.0 | react-router 7 | idb | injectManifest | Assets + `/api` | reusable | base + warm fork |
| Tankzettel | 0.3.0 | react-router 7 | idb | injectManifest | Assets + `/api` | reusable + guard | **base, zero drift** |
| Tennisturnier | 0.3.0 | react-router 7 | idb | injectManifest | Assets + KV sync | reusable | base |
| Tonspur | 0.3.0 | react-router 7 | idb | injectManifest | Assets | reusable | base + game skin |
| Zeiterfassung | 0.3.0 | react-router 7 | idb | injectManifest | Assets + `/api` | reusable | base |

**Tankzettel is the reference implementation.** Its `src/lib/ui/` is
byte-identical to the template except for the `--accent-h` line, and it was the
first app to wire the `web-base-check.yml` drift guard. When a question about
"what should this look like" comes up, look there first.

---

## Accepted deviations

A deviation is accepted when the app's version is *better for that app*, not
merely different. Each one is also recorded in the app's own `CLAUDE.md`.

### ErinnerMich — own app shell

`src/components/AppShell.tsx` replaces the template's `AppShell`: a greeting
header, a centre floating action button and safe-area padding. These are product
decisions, not drift. The app composes the base's `AppHeader`, `AppNav`,
`primitives`, `useTheme` and `InstallButton` rather than duplicating them.

### Hausverwaltung — own design system

`src/lib/ui/{layout,ui,shared,charts,sync}/` is a ~30-component design system
(Modal, Drawer, Tabs, DataTable, Wizard, FormField, Toast, KpiTile …) that
substantially exceeds the layout scaffold. Its `AppShell` and `PageHeader` are
rewritten; `AppHeader` and `AppNav` are replaced by `layout/Nav.tsx`.

Also: `HashRouter` rather than `createBrowserRouter`, because the app shares
data through hash-encoded URLs (`#/import/:payload`) and wants zero server
config. Its worker sync (OTP pairing, R2 snapshots with `If-Match`, KV,
rate-limit) is the source the `sync` template was derived from and stays ahead
of it. Its `vitest.config.ts` uses `@cloudflare/vitest-pool-workers` projects.

### Pizzateig — warm theme fork

`theme.css` keeps hue-65 warm-tinted surfaces, `--color-accent-warm`,
`--shadow-warm` and `.slider-warm`. That palette is the product's identity. The
generally-useful parts of its fork (the `--animate-*` keyframes, `--radius-2xl`,
the `prefers-reduced-motion` reset) were promoted upstream in 0.3.0 instead of
staying app-local.

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

It shares the *tooling* baseline (Bun, Biome, the reusable CI job, hygiene
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
built-in, remove it where nothing does, one app at a time.

**`web-base pins`.** The CLI cannot apply the pin table: `patchPackageJson` is
additive-only and the templates declare only nine packages, so React, Vite,
TypeScript, Tailwind, Vitest, jsdom and every `@types/*` are unmanaged. Pins are
applied by hand today. A read-only `web-base pins` report (compare an app's
`package.json` against a machine-readable form of the `07-conventions.md` table,
exit non-zero on mismatch) is the next step; `--apply` after that.

**`init` produces a scaffold that does not build.** `router.tsx` lazy-imports
`../features/home/HomePage.tsx`, which no template ships, and `init` writes no
React/Vite/TS/Tailwind dependencies, no `vite.config.ts`, `index.html`,
`main.tsx`, `index.css` or `tsconfig.app.json`. `tools-ci.yml` only lints the
scaffold, never typechecks or builds it. None of the nine apps run `init`, so
this blocks nothing — but a new app cannot be scaffolded end to end today.

---

## Cross-app checklist

Re-verify after any base change:

- [ ] All nine repos have the same `biome.json` (modulo documented overrides)
- [ ] All nine repos have identical `src/lib/db/useLiveQuery.ts`
- [ ] All React repos have identical `src/lib/ui/` except `theme.css`'s `--accent-h`
- [ ] All nine repos call `web-app-ci.yml` and wire `web-base-check.yml`
- [ ] All nine repos have `packageManager: "bun@1.3.11"` and a `bun.lock`
- [ ] All nine repos match the pin table in `07-conventions.md`
- [ ] All nine repos have LICENSE, CONTRIBUTING.md, SECURITY.md, `.editorconfig`
- [ ] All nine repos have `CLAUDE.md` and `docs/specs/`
- [ ] Every app's `--accent-h` is distinct and ≥25° from the reserved semantic hues
- [ ] `bunx github:daniel-rck/web-base#vX.Y.Z check core` is clean in all nine
