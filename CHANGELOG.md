# Changelog

All notable changes to `web-base` are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The version is bumped on every change (driven by the conventional-commit type:
`fix:` → patch, `feat:` → minor, breaking → major). Apps catch up with
`web-base update <template> --apply`; the stamped `webBase.version` in an app's
`package.json` records which base it last pulled.

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
