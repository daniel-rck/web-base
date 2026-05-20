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
