# CI reference

Every app's `.github/workflows/ci.yml` is one screen long: it calls the
reusable workflows in `daniel-rck/web-base`. No duplicated CI yaml across
apps.

## Caller pattern

```yaml
name: CI

on: [push, pull_request]

permissions:
  contents: read

jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@vX.Y.Z

  web-base-check:
    uses: daniel-rck/web-base/.github/workflows/web-base-check.yml@vX.Y.Z
```

`vX.Y.Z` is a web-base release tag. `ci` runs lint + typecheck + test + build;
`web-base-check` is the owned-drift guard (below).

The called jobs need `contents: read`: grant it as above or leave
`permissions:` out. `permissions: {}` in the caller makes the run fail at
startup, since a called workflow cannot widen the caller's token.

## Inputs of web-app-ci.yml

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@vX.Y.Z
    with:
      bun-version: "" # default: use package.json "packageManager": "bun@x.y.z"
      run-tests: true # default; false for an app with no tests yet
      run-build: true # default; false to skip the build step
```

- **Bun version.** Leave `bun-version` empty and set
  `"packageManager": "bun@x.y.z"` in `package.json`; that is the one place the
  app's Bun version lives. Without either, the workflow warns and installs the
  latest Bun.
- **Typecheck runs once.** When the build script runs `tsc` (the conventional
  `tsc -b && vite build`), the build step does the typecheck and the separate
  Typecheck step is skipped. It runs when `run-build` is false or the build has
  no `tsc` (HamsterFlight's `vite build`).
- The workflow caches `~/.bun/install/cache` keyed on `bun.lock`.

## Pinning

- `@vX.Y.Z`: a web-base release tag. Recommended: a workflow change then
  arrives as a PR from the app's Dependabot (`package-ecosystem:
  github-actions` also bumps reusable-workflow refs) instead of on the next
  push. There are no major tags such as `@v1`; releases are tagged `vX.Y.Z`.
- `@main`: always the latest workflow YAML. Works, but every change to a
  web-base workflow reaches the app unreviewed.

The `@` tag only selects the workflow YAML. Which web-base CLI the drift guard
runs is decided by the app's `webBase.version` stamp (next section).

## Owned-drift guard (web-base-check.yml)

The `web-base-check` job fails CI if an **owned** web-base building block was
hand-edited in the app. Scaffold seams (theme accent, db schema, routes,
handlers) are ignored, so per-app customization is fine.

```yaml
jobs:
  web-base-check:
    uses: daniel-rck/web-base/.github/workflows/web-base-check.yml@vX.Y.Z
    with:
      template: core # default
      ref: "" # default: v<webBase.version> from package.json
      strict: false # default
      pins: false # default
      bun-version: "" # default: package.json packageManager
```

- **`ref`** is the web-base tag whose CLI runs the check. Empty (the default)
  means `v<webBase.version>` from the app's `package.json`, so the app is
  checked against the base it actually pulled and a change on web-base `main`
  cannot turn it red. If that tag does not exist, the check falls back to
  `main` and warns. Set `ref` only to override.
- **`strict: true`** also fails when a building block was not adopted, was
  adopted only partially, or a superseded setup is left over (e.g. a
  `biome.json`). Only for apps on the full `core`; never for HamsterFlight.
- **`pins: true`** also runs `web-base pins`, which fails when the app's
  dependency versions differ from the base's pin table. Needs a ref of
  `v0.6.0` or later.
- A failing run prints the diff of what drifted (CLI v0.6.0 or later).

When it fails, either restore the base with
`bunx github:daniel-rck/web-base#v<stamp> update core --apply` (a newer tag
updates and re-stamps in one go, and the check follows the new stamp in the
same PR), or promote the change into the template upstream.

## Releases and update notifications (release.yml, notify-apps.yml)

These live **in web-base**, not in the apps. A push to web-base `main` that
bumps the version makes `release.yml` tag `vX.Y.Z` and publish a GitHub
release with that version's CHANGELOG section; it then runs `notify-apps.yml`,
which opens a "web-base vX.Y.Z verfügbar" issue in each app repo and closes the
issue for the previous version. The issue lists the steps, pinned to the tag:
`check`, `update core --apply`, `add <template>` for new dependencies or
scripts, the local checks, optionally `pins`, and the release's migration
notes.

It needs an `APP_NOTIFY_TOKEN` secret in web-base (Issues read/write +
Metadata read on the app repos); without it the notification no-ops. See
`06-workflows.md`.

## Extending with additional jobs

If an app needs more (e.g. a smoke test against the deployed Worker), add
a separate job:

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@vX.Y.Z

  smoke:
    needs: ci
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - run: curl -sf https://<app>.daniel-rck.workers.dev/healthz
```

Don't fork the reusable workflow into a per-app copy.

## Deployment

We do **not** deploy from GitHub Actions. Cloudflare Workers Builds is
configured to build + deploy on push to `main` via the Cloudflare
dashboard's Git integration. CI's job is to gate the PR, not to deploy.

## Future workflows

Additional reusable workflows can be added under `web-base/.github/
workflows/`, e.g. `lint-only.yml`, a lighter check for draft PRs.

Each new workflow needs:
- `workflow_call` definition
- Documentation in web-base's [`06-workflows.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/06-workflows.md)
- An update to this reference
