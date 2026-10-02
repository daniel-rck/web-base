# 06 — Workflows

`.github/workflows/` holds these GitHub Actions workflows:

| Workflow | Trigger | Runs in | Does |
|---|---|---|---|
| `web-app-ci.yml` | `workflow_call` | every app | lint, typecheck, test, build |
| `web-base-check.yml` | `workflow_call` | every app | owned-drift guard (`web-base check`) |
| `notify-apps.yml` | release published, `workflow_dispatch` | web-base | "update available" issue per app |
| `tools-ci.yml` | push to `main`, pull requests | web-base | CI for this repo |

The workflow files are the reference for their YAML. This spec describes the
contract (inputs, behavior) and the decisions behind it, and deliberately does
not copy the YAML: copies drift. The only YAML here is the app-side caller
snippet.

## Rules for every workflow

`web-app-ci.yml` and `web-base-check.yml` run in nine app repos, so a weakness
in them is a weakness nine times over. Every workflow here follows the same
rules:

- **Least privilege.** Top-level `permissions: {}`; each job requests only
  what it needs (`contents: read` for a checkout). A called workflow can only
  narrow the caller's token, never widen it, so an app's caller must leave
  `contents: read` available (see *Caller pattern in apps*).
- **`timeout-minutes` on every job.**
- **`persist-credentials: false` on every `actions/checkout`**, so no token is
  left in `.git/config` for later steps (or a compromised dependency) to use.
- **Job-level `concurrency`.** A reusable workflow's group is set on the job
  and prefixed with the workflow's own name, e.g.
  `web-app-ci-${{ github.workflow }}-${{ github.ref }}`: a workflow-level group
  in a called workflow is evaluated in the caller's context and can collide
  with the caller's own group. `cancel-in-progress` is on only for
  `pull_request`, so a push to `main` is never cut off mid-run.
- **Every action pinned by full commit SHA**, with a `# vX.Y.Z` comment naming
  the release it resolves to.
- **No `${{ }}` expansion inside `run:`.** Inputs and event data reach a script
  through `env:` and are quoted; free-form inputs are validated against a
  pattern first, and command lines are built as bash arrays.
- **Bun comes from the app.** The reusable workflows take a `bun-version`
  input that defaults to `""`. Empty lets `oven-sh/setup-bun` resolve the
  version itself (`bun-version` → `bun-version-file` → `package.json`
  `packageManager` / `engines.bun` → latest; an empty string counts as unset),
  so each app's `packageManager: "bun@x.y.z"` is the single source. When
  neither the input nor `packageManager` / `engines.bun` is set, a step warns,
  because setup-bun then installs the latest Bun.

**Decision: pin every action by commit SHA.** A tag can be moved. In the March
2025 `tj-actions/changed-files` incident, the action's tags were rewritten to a
commit that printed CI secrets into the logs of every workflow that used it.
The reusable workflows here run in nine repos, so one moved tag upstream would
reach all of them at once. A full commit SHA cannot be moved.

## web-app-ci.yml

The reusable workflow that powers CI for every app: checkout, setup-bun,
restore the Bun package cache, `bun install --frozen-lockfile`, lint,
typecheck, test, build.

| Input | Type | Default | Effect |
|---|---|---|---|
| `bun-version` | string | `""` | Bun to install; empty = the app's `packageManager` |
| `run-tests` | boolean | `true` | run `bun run test` |
| `run-build` | boolean | `true` | run `bun run build` |

**Decision: inputs over hard-coded values.** `run-tests` and `run-build` are
inputs so an app without tests yet can still use the workflow. `bun-version`
stays an input for the rare override, but its default no longer hard-codes a
version: that had to be bumped in lockstep with nine `package.json` files and
silently disagreed with them in between.

**Decision: cache the Bun package cache with `actions/cache`.** `setup-bun`
caches only the Bun binary, not `~/.bun/install/cache`, so without a cache step
every run downloads every package again. The key is
`${{ runner.os }}-bun-${{ hashFiles('**/bun.lock') }}` with the restore key
`${{ runner.os }}-bun-`, so a lockfile change still starts from the previous
cache. `--frozen-lockfile` keeps verifying the install against `bun.lock`.

**Decision: typecheck once.** The conventional build script is
`tsc -b && vite build` (`07-conventions.md`), which typechecks the same project
graph as `typecheck` (`tsc -b --noEmit`). A step reads `.scripts.build` with
`jq`; the separate Typecheck step runs only when `run-build` is false or the
build script contains no `tsc` word, so HamsterFlight's plain `vite build`
keeps it. An app whose `typecheck` covers more than its build's `tsc` (a
tsconfig the build does not reference) should add it to the build's
references.

**Decision: no deploy step.** Cloudflare Workers Builds handles deployment
via Git integration directly in the Cloudflare dashboard. The CI workflow's
job is to gate PRs, not to deploy.

## web-base-check.yml (reusable — owned-drift guard)

`web-base-check.yml` is a `workflow_call` workflow that an app's CI includes to
fail when an **owned** base building block has drifted (`web-base check`).
Scaffold seams (theme accent, db schema, routes, handlers) are ignored, so
per-app customization never trips it.

| Input | Type | Default | Effect |
|---|---|---|---|
| `template` | string | `core` | baseline to check against; must match `^[a-z][a-z0-9-]*$` |
| `ref` | string | `""` | web-base tag or branch whose CLI runs the check; empty = `v<webBase.version>` (below); must match `^[A-Za-z0-9][A-Za-z0-9._/-]*$` |
| `strict` | boolean | `false` | pass `--strict` (below) |
| `pins` | boolean | `false` | also run `web-base pins`; needs a ref of `v0.6.0` or later |
| `bun-version` | string | `""` | Bun to install; empty = the app's `packageManager` |

**`ref` defaults to the app's stamp.** With `ref` empty, the workflow reads
`webBase.version` from the app's `package.json`, requires the form `X.Y.Z`,
and checks that the tag exists with
`git ls-remote --exit-code --tags https://github.com/daniel-rck/web-base refs/tags/v<stamp>`.
If it does, the check runs `bunx "github:daniel-rck/web-base#v<stamp>"`. If the
stamp is missing or malformed, or web-base has no such tag, it falls back to
`main` with a `::warning::`. An explicit `ref` is used as given.

Whatever the ref, it must contain the committed `cli/dist/index.js` bundle
(Bun runs no `prepare` script for Git deps, see `01-monorepo-structure.md`).
Refs at or before 0.2.0 predate the committed bundle and cannot run; `v0.2.1`
is the oldest usable tag.

**`strict`** fails not only on drift but also when a building block was not
adopted at all, was adopted only partially, or a superseded setup is left over
(`obsolete` files or packages, see `02-cli.md`). It is for apps that mean to be
on the full template; never set it in HamsterFlight.

**`--diff` is always passed**, so a failing run shows what drifted. CLIs from
v0.6.0 on print the diff; older ones (citty 0.1.6 ignores unknown flags) ignore
it. It follows the template argument, because an unknown flag in front of a
positional would take the positional as its value.

**`pins`** runs `web-base pins` (exit 1 on a mismatch) after the check, also
when the check failed, so one run reports both. The command exists from v0.6.0
on: with a `vX.Y.Z` ref below that, the workflow fails up front with a clear
error instead of letting an old CLI report "Unknown command". A branch ref is
not checked.

**Decision: the CLI version follows the app's stamp.** The old default
`ref: main` ran every app's check with the newest templates, so any change to
an owned file on web-base `main` turned all nine app CIs red at once, before
any app had pulled it. The stamp records which base the app last pulled, so
checking against that tag compares like with like; an app moves forward with
`update --apply`, which bumps the stamp in the same PR as the files. The `main`
fallback keeps an app whose stamp has no tag yet working, loudly.

## Caller pattern in apps

Each app's `.github/workflows/ci.yml`, with `vX.Y.Z` a web-base release tag:

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

Inputs go under `with:`:

```yaml
jobs:
  ci:
    uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@vX.Y.Z
    with:
      run-tests: false # an app before its first test

  web-base-check:
    uses: daniel-rck/web-base/.github/workflows/web-base-check.yml@vX.Y.Z
    with:
      strict: true # only for an app on the full core template
```

- **Permissions.** The called jobs need `contents: read`. Either grant it as
  above or omit `permissions:` (the repo default then applies). A caller with
  `permissions: {}` fails at startup, because a called workflow cannot widen
  the caller's token.
- **Pin a tag, let Dependabot bump it.** `@vX.Y.Z` instead of `@main`: a
  change to a workflow then reaches an app as a reviewable PR from the app's
  own Dependabot (`package-ecosystem: github-actions` also updates reusable
  workflow refs), not as a surprise on its next push. `@main` still works.
- **The workflow tag and the checked version are independent.** The `@` tag
  selects the workflow YAML; the app's `webBase.version` stamp selects the CLI
  that `web-base-check.yml` runs (unless `ref` is set).

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
          git init -q && touch .gitignore   # oxfmt reads .gitignore
          echo '{"name":"scratch","version":"0.0.0"}' > package.json
          node ${{ github.workspace }}/cli/dist/index.js add core
          bunx oxlint@1.85.0
          bunx oxfmt@0.70.0 --check

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
pass their *own* shipped oxlint/oxfmt configs, not the repo's), so without
this step a lint error inside a template — a hooks-rule violation, a decorative
SVG without `aria-hidden`, unsorted imports — would reach consumer apps
unnoticed. Scaffolding a full app and running `oxlint` + `oxfmt --check` on the
result lints the templates with their shipped config, the only faithful
check. Typecheck/build of the scaffolded app are intentionally left out: they
need a full dependency install (React, idb, lucide-react, Vite …) and would be
slow and flaky; revisit if template type errors start slipping through.

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
  or GitHub App token). No write access to app *code* is required. The job's
  own `GITHUB_TOKEN` gets no permissions.
- If the secret is absent, each matrix job no-ops (so the workflow is safe to
  merge before the secret exists).
- Deduplicates: skips a repo if an open issue with the same title already exists.

This is the Stage-2 "issue-notification" propagation model. A future, more
automated variant could open `web-base update --apply` PRs instead of issues
(needs code-write access); the issue path was chosen to avoid granting that.

## Versioning the reusable workflows

The reusable workflows are versioned with web-base itself. There are no
separate major tags (`v1`, `v2`); an app pins the `vX.Y.Z` tag of a web-base
release. A breaking change to a workflow's inputs or behavior is a breaking
web-base change (see *Versioning* in `02-cli.md`) and gets a CHANGELOG entry
that says what callers must change. Apps take it when they bump their `@` ref.

## Future workflows

When/if we want additional reusable workflows, add them as new files:

- `release.yml` — for tagging + GitHub release on a worker app
- `lint-only.yml` — a lighter check for draft PRs

Each new reusable workflow gets:
- Its own `workflow_call` definition
- Documentation in this spec
- A skill reference in `references/ci.md`
