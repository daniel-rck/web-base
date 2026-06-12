# CI reference

Every app's `.github/workflows/ci.yml` is one screen long: it calls the
reusable workflow in `daniel-rck/web-base`. No duplicated CI yaml across
apps.

## Caller pattern

```yaml
name: CI

on: [push, pull_request]

jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main
```

That's the minimum. The reusable workflow runs lint + typecheck + test +
build.

## Inputs

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main
    with:
      bun-version: "1.3.11"   # default — bump per app to opt into newer Bun
      run-tests: true         # default — set false for apps with no tests yet
      run-build: true         # default — set false to skip the build step
```

## Pinning

- `@main` — always the latest. Accept the breakage rate during early
  development.
- `@v1` — pinned to a major tag. Recommended once web-base has tagged
  releases. Bump the `@vN` ref to opt into a major version.

## Extending with additional jobs

If an app needs more (e.g. a smoke test against the deployed Worker), add
a separate job:

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main

  smoke:
    needs: ci
    runs-on: ubuntu-latest
    steps:
      - run: curl -sf https://<app>.daniel-rck.workers.dev/healthz
```

Don't fork the reusable workflow into a per-app copy.

## Owned-drift guard (web-base-check.yml)

Add this job so CI fails if an **owned** web-base building block was hand-edited
in the app. Scaffold seams (theme accent, db schema, routes, handlers) are
ignored, so per-app customization is fine.

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main

  web-base-check:
    uses: daniel-rck/web-base/.github/workflows/web-base-check.yml@main
    with:
      ref: v0.2.1   # pin to this app's webBase.version (tag must exist in web-base)
```

When it fails, either `bunx github:daniel-rck/web-base update <template> --apply`
to restore the base, or promote the change into the template upstream.

## Update notifications (notify-apps.yml)

This one lives **in web-base**, not in the apps. On a web-base release it opens
an "update available" issue in each app repo (reminder to run
`web-base update`). It needs an `APP_NOTIFY_TOKEN` secret with `issues:write` on
the app repos; without it the workflow no-ops. See `06-workflows.md`.

## Deployment

We do **not** deploy from GitHub Actions. Cloudflare Workers Builds is
configured to build + deploy on push to `main` via the Cloudflare
dashboard's Git integration. CI's job is to gate the PR, not to deploy.

## Future workflows

Additional reusable workflows can be added under `web-base/.github/
workflows/`:

- `release.yml` — for tagging + GitHub release on a worker app
- `lint-only.yml` — a lighter check for draft PRs

Each new workflow needs:
- `workflow_call` definition
- Documentation in `web-base/docs/specs/06-workflows.md`
- An update to this reference
