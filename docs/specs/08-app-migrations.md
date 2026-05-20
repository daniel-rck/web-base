# 08 — App Migrations

Migration plans for the three existing apps. Each is a sequence of PRs, ordered
by risk (low-risk first) and by dependency (e.g. Biome before layout, because
the layout template files must lint cleanly under the new Biome config).

After each PR, the app should:
- `bun install && bun run lint && bun run typecheck && bun run test && bun run build`
- Deploy preview and smoke-test in a browser

## Migration sequence (all apps)

The general order, applied per app:

1. **Tooling baseline.** `web-base add hygiene` + `web-base add biome`. Switch
   CI to the reusable workflow. Add `packageManager` field. Fill in
   package.json metadata.
2. **Router.** If the app doesn't have `react-router-dom` yet, `web-base add
   router`. Wrap the existing app in `<RouterProvider>` with a single index
   route initially.
3. **Storage.** Migrate to idb. The biggest per-app difference — see below.
4. **PWA.** Migrate from generateSW to injectManifest where applicable.
5. **Worker.** Align with the worker template (only minor changes for most apps).
6. **Layout.** `web-base add layout`, then refactor existing screens to use
   `<AppShell>`. This is the most user-visible change.
7. **Color accent.** Set `--accent-h` in `theme.css` to the app's hue.

The order is not absolute — for example, layout can land before worker if
there's a reason. But Biome must come before any template that ships TypeScript
files, because those files are written against Biome's formatting rules.

---

## Hausverwaltung

The most complex migration because of Dexie → idb and the existing R2+KV sync.

### Current state (relevant facts)

- React 19, Vite 8, Tailwind 4, TypeScript ~6.0
- ESLint 9 (must migrate to Biome)
- **Dexie** with 16 stores and `dexie-react-hooks`
- react-router-dom 7 ✅
- chart.js + react-chartjs-2, lucide-react, pako
- vite-plugin-pwa with **generateSW** (must migrate to injectManifest)
- Cloudflare Worker with R2 + KV sync (E2E-encrypted) — the reference
  implementation for the `sync` template
- `packageManager` field already present ✅
- LICENSE in README only — needs a `LICENSE` file

### Migration PRs

**PR 1: Tooling baseline**
- `web-base add hygiene` — adds LICENSE file, CONTRIBUTING.md, SECURITY.md, .editorconfig
- `web-base add biome` — adds biome.json, biome devDep, lint/format scripts
- Remove: `eslint.config.js`, `@eslint/js`, `eslint-plugin-react-hooks`,
  `eslint-plugin-react-refresh`, `typescript-eslint`, `globals`
- Run `bun run format` to apply Biome formatting
- Fix Biome lint findings manually
- Switch `.github/workflows/ci.yml` to call `daniel-rck/web-base/.github/workflows/web-app-ci.yml@main`
- Fill in package.json metadata: `description`, `keywords`, `author`, `homepage`, `repository`, `bugs`

**PR 2: Storage — Dexie → idb (the big one)**
- `web-base add storage` — installs `src/lib/db/db.ts` (placeholder schema) and
  `useLiveQuery.ts`
- Map the 16 Dexie tables to idb object stores. daniel-rck will produce a separate
  migration spec for this (`docs/specs/migration-dexie-to-idb.md`) — it's the
  only file that should be created mid-migration, because the schema is
  app-specific.
- For each `useLiveQuery` from dexie-react-hooks: replace with the new
  `useLiveQuery` from `src/lib/db/`. The hook shape matches deliberately, so
  most call sites should change only the import.
- Data migration: write a one-time migration script that reads from Dexie's
  IndexedDB databases and writes to the new idb schema. Run it on app start
  with a "migrated" flag stored in idb to prevent re-runs.
- Remove `dexie` and `dexie-react-hooks` from package.json.
- Tests: write a vitest suite covering the migration script with `fake-indexeddb`.

**PR 3: PWA — generateSW → injectManifest**
- `web-base add pwa` — installs sw.ts, vite.snippet.md, tsconfig.sw.json
- Merge the snippet into vite.config.ts (or replace the generateSW block).
- The Hausverwaltung sw.ts may need additional caching strategies for the
  R2-synced data — document in `docs/specs/sw-strategy.md`.
- Delete vite.snippet.md.

**PR 4: Worker alignment**
- Compare the current `worker/index.ts` against the worker template. They
  should be very close.
- Only diff: Hausverwaltung's worker includes the sync handlers from the sync
  template. Run `web-base add sync` to ensure the sync code matches the
  current source-of-truth. If the current Hausverwaltung sync is newer than
  the template, this PR is the moment to **promote** the current
  implementation into the template (separate PR to web-base).

**PR 5: Layout**
- `web-base add layout` — installs the UI components.
- Refactor existing pages to use `<AppShell>` with `navItems` for the existing
  modules (Mieter, Nebenkosten, Versorger, …).
- Set `--accent-h: 250` (Slate-Blau).
- This PR will be large because every page touches it. Consider doing it
  module-by-module if needed.

### Risk notes

- The Dexie → idb migration is the biggest risk. Real user data exists in
  Dexie databases on devices in production. The migration script must be
  conservative: dry-run mode, log every write, abort on any error, never
  delete the Dexie data until the user explicitly confirms.
- Backup-first: trigger an automatic JSON export to the user's downloads
  before running the migration script.

---

## Tennisturnier

Smaller migration. Currently uses localStorage and lacks react-router-dom.

### Current state

- React 19, Vite 8, Tailwind 4, TypeScript 5.9 (must bump to 6.0)
- ESLint 9 (must migrate to Biome)
- **localStorage only** (for tournament data)
- **No react-router-dom**
- @dnd-kit/*, @formkit/auto-animate, canvas-confetti, qrcode
- vite-plugin-pwa with generateSW (must migrate to injectManifest)
- Cloudflare Worker with **KV only** sync (simpler than Hausverwaltung's)
- No `packageManager` field
- No LICENSE file
- Has `.claude/` directory (preserve)

### Migration PRs

**PR 1: Tooling baseline**
- Same as Hausverwaltung PR 1.
- Additionally: bump TypeScript to `~6.0.2`.
- Add `packageManager: "bun@1.3.11"`.

**PR 2: Router**
- `web-base add router`.
- Add a `<RouterProvider>` wrapper around the existing single view.
- Define one route initially (`/`). Subsequent features can add more.

**PR 3: Storage — localStorage → idb**
- `web-base add storage`.
- Define the tournament schema in `src/lib/db/db.ts` (tournaments, matches,
  players, rounds).
- Migration script: read existing `localStorage` keys, write to idb, delete
  the localStorage keys. One-time.
- Tests with fake-indexeddb.

**PR 4: PWA — generateSW → injectManifest**
- Same as Hausverwaltung PR 3.

**PR 5: Worker alignment**
- The current sync is **simpler than `web-base add sync`** (KV-only, no
  E2E encryption). Two options:
  - (a) Upgrade to the full sync template — overkill for tournament data
        that's already shared via the share-code mechanism.
  - (b) Document the simpler sync as a deviation in
        `Tennisturnier/docs/specs/sync.md`. Leave the worker mostly as-is.
- **Decision: option (b).** Tournament data is opt-in shared, not
  privacy-sensitive in the same way; the existing simpler protocol fits.

**PR 6: Layout**
- `web-base add layout`.
- Refactor the current view into pages reachable via `navItems` (Setup,
  Spielplan, Ergebnisse, Siegerehrung).
- Set `--accent-h: 155` (Emerald).

---

## ErinnerMich

The closest to the target baseline already.

### Current state

- React 19, Vite 8, Tailwind 4, TypeScript ~6.0 ✅
- ESLint 10 (must migrate to Biome)
- **idb already** ✅ — but verify the schema matches the template pattern
- react-router-dom 7 ✅
- framer-motion, @formkit/auto-animate, canvas-confetti, lucide-react
- **vite-plugin-pwa with injectManifest already** ✅
- No sync yet (planned)
- LICENSE, CONTRIBUTING, SECURITY all present ✅
- package.json metadata complete ✅
- No `packageManager` field

### Migration PRs

**PR 1: Tooling baseline**
- `web-base add biome` only (hygiene already done).
- Add `packageManager: "bun@1.3.11"`.
- Remove ESLint config and deps.
- Switch CI to the reusable workflow.

**PR 2: Storage alignment**
- Compare `src/lib/db.ts` to the storage template. If the patterns match,
  no change needed. If `useLiveQuery` differs from the template, decide whether
  to:
  - (a) update ErinnerMich to match the template (typical), or
  - (b) update the template to match ErinnerMich (if its implementation is
        cleaner — promote via a web-base PR first).

**PR 3: PWA alignment**
- Compare `src/sw/index.ts` to the PWA template. ErinnerMich already uses
  injectManifest, but the structure may differ. Align if reasonable; document
  deviations.

**PR 4: Layout**
- `web-base add layout`.
- Refactor pages to use `<AppShell>` with `navItems` for Today, Habits, Mood,
  Stats.
- Set `--accent-h: 285` (Indigo).

**PR 5: Sync (future)**
- When sync is wanted, `web-base add sync`.
- Reuse Hausverwaltung's R2+KV pattern as-is.

---

## Cross-app checklist after migration

When all three apps complete migration, verify across the board:

- [ ] All three repos have identical `biome.json`
- [ ] All three repos have identical `src/lib/ui/` (except `theme.css`'s `--accent-h`)
- [ ] All three repos have identical `src/lib/db/useLiveQuery.ts`
- [ ] All three repos have identical `src/sw/index.ts` (except app-specific handlers)
- [ ] All three repos call the reusable workflow
- [ ] All three repos have `packageManager: "bun@1.3.11"`
- [ ] All three repos have full package.json metadata
- [ ] All three repos have LICENSE, CONTRIBUTING.md, SECURITY.md
- [ ] All three repos have docs/specs/
- [ ] Each app's `--accent-h` differs (250 / 155 / 285)

Run `web-base update layout` (and the others) on each app and verify the
output is "All in sync." If not, either bring the app in line or update the
template to match the better version.
