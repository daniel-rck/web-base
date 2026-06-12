# 06 — Workflows

Two GitHub Actions workflows live in `.github/workflows/`:

- `web-app-ci.yml` — **reusable** workflow that apps call via `workflow_call`
- `tools-ci.yml` — CI for this repo (web-base itself)

## web-app-ci.yml

The reusable workflow that powers CI for every app.

```yaml
name: Web App CI

on:
  workflow_call:
    inputs:
      bun-version:
        type: string
        default: "1.3.11"
        description: "Bun version to install"
      run-tests:
        type: boolean
        default: true
        description: "Whether to run vitest"
      run-build:
        type: boolean
        default: true
        description: "Whether to run the build step"

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: ${{ inputs.bun-version }}

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Lint (biome)
        run: bun run lint

      - name: Typecheck
        run: bun run typecheck

      - name: Test
        if: ${{ inputs.run-tests }}
        run: bun run test

      - name: Build
        if: ${{ inputs.run-build }}
        run: bun run build
```

**Decision: inputs over hard-coded values.** Bun version is an input so an app
can opt into a newer Bun before web-base bumps the default. `run-tests` and
`run-build` are inputs so an app without tests yet can still use the workflow.

**Decision: no caching step.** Bun's `--frozen-lockfile` plus `setup-bun`'s
built-in cache is fast enough. Adding `actions/cache` complicates the
workflow without measurable benefit on these app sizes.

**Decision: no deploy step.** Cloudflare Workers Builds handles deployment
via Git integration directly in the Cloudflare dashboard. The CI workflow's
job is to gate PRs, not to deploy.

## Caller pattern in apps

Each app's `.github/workflows/ci.yml`:

```yaml
name: CI

on: [push, pull_request]

jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main
```

Or to pin to a tag (recommended for stability once web-base has releases):

```yaml
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@v1
```

To override inputs:

```yaml
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main
    with:
      run-tests: false  # e.g. tennisturnier before tests exist
```

## tools-ci.yml

CI for this repo. Runs on push to main and on PRs.

```yaml
name: Tools CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.11"

      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun run test
      - run: bun run build

      - name: Verify CLI runs
        run: |
          chmod +x cli/dist/index.js
          node cli/dist/index.js --help
          node cli/dist/index.js add --help

      - name: Smoke test - add hygiene
        run: |
          mkdir -p /tmp/scratch
          cd /tmp/scratch
          echo '{"name":"scratch","version":"0.0.0"}' > package.json
          node ${{ github.workspace }}/cli/dist/index.js add hygiene
          test -f LICENSE
          test -f CONTRIBUTING.md
          test -f SECURITY.md
          test -f .editorconfig

      - name: Smoke test - scaffold core and lint
        run: |
          SCRATCH=$(mktemp -d)
          trap 'rm -rf "$SCRATCH"' EXIT
          cd "$SCRATCH"
          git init -q && touch .gitignore   # biome.json uses vcs.useIgnoreFile
          echo '{"name":"scratch","version":"0.0.0"}' > package.json
          node ${{ github.workspace }}/cli/dist/index.js add core
          bunx --bun @biomejs/biome@2.4.15 check .

      - name: Verify skill/template alignment
        run: |
          # Every cli/templates/<name>/ (except 'core') should have a matching
          # skill/references/<name>.md (with -system suffix allowed for layout).
          set -e
          fail=0
          for dir in cli/templates/*/; do
            name=$(basename "$dir")
            [ "$name" = "core" ] && continue
            ref="skill/references/${name}.md"
            alt="skill/references/${name}-system.md"
            if [ ! -f "$ref" ] && [ ! -f "$alt" ]; then
              echo "MISSING: $ref or $alt for template $name"
              fail=1
            fi
          done
          exit $fail
```

The alignment check enforces the rule from `05-skill.md`: every template must
have a matching skill reference (so conventions stay documented).

The "scaffold core and lint" step is the guard for template correctness. The
repo's own `bun run lint` excludes `cli/templates` (templates are authored to
pass their *own* shipped `biome.json`, not the repo's), so without this step a
lint error inside a template — a missing Tailwind directive in the CSS parser
config, a decorative SVG without `aria-hidden`, unorganized imports — would
reach consumer apps unnoticed. Scaffolding a full app and running `biome check`
on the result lints the templates with their shipped config, the only faithful
check. Typecheck/build of the scaffolded app are intentionally left out: they
need a full dependency install (React, idb, lucide-react, Vite …) and would be
slow and flaky; revisit if template type errors start slipping through.

## web-base-check.yml (reusable — owned-drift guard)

`web-base-check.yml` is a `workflow_call` workflow that an app's CI includes to
fail when an **owned** base building block has drifted (`web-base check`).
Scaffold seams (theme accent, db schema, routes, handlers) are ignored, so
per-app customization never trips it.

Inputs:
- `template` (default `core`) — the baseline to check against.
- `ref` (default `main`) — the web-base ref/tag to run the check with; pin it to
  the app's `webBase.version` so the comparison matches what the app pulled.

Caller pattern in an app:

```yaml
jobs:
  web-base-check:
    uses: daniel-rck/web-base/.github/workflows/web-base-check.yml@main
    with:
      ref: v0.2.1
```

The `ref` is consumed as `bunx "github:daniel-rck/web-base#<ref>"`, so it must
be an existing tag/branch in this repo **and** that ref must contain the
committed `cli/dist/index.js` bundle (see `01-monorepo-structure.md` — Bun runs
no `prepare` script for Git deps). Refs at or before `0.2.0` predate the
committed bundle and cannot be executed via `bunx`; `v0.2.1` is the first
usable pin.

## Releasing web-base versions

Every version bump (`package.json` + `cli/src/version.ts`, see `02-cli.md`)
gets an annotated tag on `main` once the bump has merged:

```
git tag -a v0.2.1 -m "v0.2.1" && git push origin v0.2.1
```

The tags are what apps pin in `web-base-check.yml` (`ref:`) and what
`notify-apps.yml` announces. Tag after merge, never on a feature branch —
otherwise the tag points at a commit that may never reach `main`.

## notify-apps.yml (release → issue notifications)

When a web-base release is published, `notify-apps.yml` opens an "update
available" issue in each consuming app repo (the repo list is a matrix in the
workflow). Updates stay manual — the issue is the reminder to run
`web-base update`. It also fires on `workflow_dispatch` with a `version` input.

Requirements and behavior:
- Needs an `APP_NOTIFY_TOKEN` secret with `issues:write` on the app repos (a PAT
  or GitHub App token). No write access to app *code* is required.
- If the secret is absent, each matrix job no-ops (so the workflow is safe to
  merge before the secret exists).
- Deduplicates: skips a repo if an open issue with the same title already exists.

This is the Stage-2 "issue-notification" propagation model. A future, more
automated variant could open `web-base update --apply` PRs instead of issues
(needs code-write access); the issue path was chosen to avoid granting that.

## Releasing the workflow

When breaking changes are introduced to `web-app-ci.yml`:

1. Bump the major version tag (`v1` → `v2`).
2. Document the breaking change in CHANGELOG.md (create when needed).
3. Apps can opt into the new version at their pace by updating the `@` ref.

Until first major release, apps use `@main` and accept the breakage rate.

## Future workflows

When/if we want additional reusable workflows, add them as new files:

- `release.yml` — for tagging + GitHub release on a worker app
- `lint-only.yml` — a lighter check for draft PRs

Each new reusable workflow gets:
- Its own `workflow_call` definition
- Documentation in this spec
- A skill reference in `references/ci.md`
