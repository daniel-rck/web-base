# Changelog

All notable changes to `web-base` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version is bumped on every change (driven by the conventional-commit type:
`fix:` → patch, `feat:` → minor, breaking → major). Apps catch up with
`web-base update <template> --apply`; the stamped `webBase.version` in an app's
`package.json` records which base it last pulled.

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
  `^7.0.2`, `@types/node` `^26.4.0`, `@cloudflare/workers-types` `^5.20260706.1`,
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

## [0.1.0]

- Initial baseline: CLI (`init`/`add`/`update`), templates (`core`, `hygiene`,
  `biome`, `layout`, `storage`, `pwa`, `router`, `worker`, `sync`), the Claude
  Code skill, and the reusable GitHub Actions workflow.
