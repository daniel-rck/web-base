# 06 — Workflows

`.github/workflows/` holds these GitHub Actions workflows:

| Workflow | Trigger | Runs in | Does |
|---|---|---|---|
| `web-app-ci.yml` | `workflow_call` | every app | lint, typecheck, test, build |
| `web-base-check.yml` | `workflow_call` | every app | owned-drift guard (`web-base check`) |
| `tools-ci.yml` | push to `main`, pull requests | web-base | CI for this repo |
| `release.yml` | push to `main`, `workflow_dispatch` | web-base | tag + GitHub release for the `package.json` version |
| `notify-apps.yml` | `workflow_call` from `release.yml`, `workflow_dispatch` | web-base | "update available" issue per app |

`.github/dependabot.yml` keeps the actions they use current (see
*Dependabot*).

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
- **A `concurrency` group.** In a reusable workflow it is set on the job and
  prefixed with the workflow's own name, e.g.
  `web-app-ci-${{ github.workflow }}-${{ github.ref }}`: a workflow-level group
  in a called workflow is evaluated in the caller's context and can collide
  with the caller's own group. Only `release.yml`, which nothing calls, uses a
  workflow-level group. `cancel-in-progress` is on only for `pull_request`, so
  a push to `main` is never cut off mid-run.
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
reach all of them at once. A full commit SHA cannot be moved. Dependabot
bumps the SHA and its comment together (see *Dependabot*), so pinning costs a
weekly PR to review, not manual upkeep.

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
v0.6.0 on print the diff; older CLIs ignore it, because their citty 0.1.6
silently accepts unknown flags. It follows the template argument: an unknown
flag in front of a positional would take the positional as its value.

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

CI for this repo, on push to `main` and on pull requests. It follows the
*Rules for every workflow*; Bun comes from the root `package.json`
`packageManager`. Four jobs run in parallel:

| Job | Does |
|---|---|
| `ci` | `bun install --frozen-lockfile`, `lint`, `typecheck` (root + `tsconfig.templates.json`), `test` (unit, doc guards, the sync suite, and the e2e suite against the rebuilt bundle), `build`, then fails if `git status --porcelain -- cli/dist` is non-empty |
| `bunx-install` | `bunx github:<repo>#<sha> --version` must print the `package.json` version — the real distribution path, which a bundle can fail even when it builds |
| `scaffold` | `init` a new app, `add backup` and `add sync`, copy `cli/template-tests/` into `src/__base_tests__/`; then in the app: `bun install`, `lint` (the shipped oxlint/oxfmt configs), `typecheck` (app, node, service worker, worker), `test` (the testing template's setup), `build`; `check app/backup/sync --strict` and `pins`; `wrangler deploy --dry-run` |
| `workflow-lint` | actionlint (checksum-verified release binary; runs shellcheck on every `run:` script) and zizmor's offline audits |

**Decision: the smoke tests live in vitest.** The regressions this workflow
used to run as shell steps (`add hygiene`, `check --strict` on a fresh
scaffold, the `webBase.unmanaged` exemption, a leftover `biome.json`,
`update core` restoring files, `--force` keeping `wrangler.toml`, the
skill/template alignment) are tests in `cli/src/e2e/dist.test.ts` and
`cli/src/templates.test.ts`, so they run locally with `bun run test` too.

**Decision: CI typechecks, tests and builds a scaffolded app.** This spec
used to leave typecheck and build of the scaffold out as "slow and flaky".
Meanwhile `init` produced an app that did not build, the router template
imported a page no template shipped, and the service worker's tsconfig could
not resolve its own imports — all invisible to lint. The `scaffold` job is
the only place the React templates meet a compiler; it installs with
`bun install` (no lockfile), so the newest caret versions within the pins are
what it tests.

## release.yml (tag + GitHub release from the version)

Every push to `main` runs `release.yml`. Its `tag` job reads the version from
`package.json` at the pushed commit and makes sure web-base has a release for
it:

1. **Resolve the commit.** `GITHUB_SHA` on a push; on `workflow_dispatch` the
   `sha` input (or `GITHUB_SHA` when empty). The SHA must be 7–40 lowercase
   hex digits, must resolve with `git rev-parse`, and must be on `main`
   (`git merge-base --is-ancestor "$sha" HEAD` in a full-history checkout of
   `main`). A dispatch is only accepted from `refs/heads/main`.
2. **Read the version** with `git show "$sha:package.json" | jq -r .version`.
   It must be SemVer; a `-` part marks a prerelease.
3. **Already released → done.** If `gh release view vX.Y.Z` finds a release
   (drafts included), the job sets `created=false` and stops. Most pushes do
   not bump the version, so this is the normal, green no-op.
4. **Tag conflicts fail.** If the tag `vX.Y.Z` exists but points at another
   commit, the job fails rather than guess; a tag at the same commit is
   released as is.
5. **Notes.** The release notes are the version's section of `CHANGELOG.md`
   on `main`: everything between `## [X.Y.Z]` and the next `## [` heading (or
   the link-reference footer, `[Unreleased]: …` / `[X.Y.Z]: …`), blank lines
   trimmed. An empty section fails the run, so a bump without a CHANGELOG
   entry is visible on `main`. Write the entry, migration notes included, in
   the same PR as the bump.
6. **Create** with `gh release create vX.Y.Z --target "$sha" --title vX.Y.Z
   --notes-file notes.md`, plus `--latest` on a push, `--latest=false` on a
   dispatch, and `--prerelease --latest=false` for a prerelease. The API
   creates the tag, so tags are **lightweight**, like the original `v0.2.1`.

The job (`contents: write`, 5 minutes) outputs `version`, `created` and
`prerelease`. A second job, `notify`, calls `notify-apps.yml` with the version
and the `APP_NOTIFY_TOKEN` secret when a release was created, it is not a
prerelease, and the run is a push or a dispatch with `notify: true`.

Runs share the concurrency group `release` (backfills get
`release-backfill-<sha>`) without cancelling each other. GitHub keeps at most
one *pending* run per group, though: when three pushes land while a release
is running, the middle one is dropped. If that one carried a version bump,
backfill it (below).

So releasing is: bump `package.json` + `cli/src/version.ts` (see `02-cli.md`),
write the `CHANGELOG.md` section, merge to `main`. Never tag by hand on a
feature branch: the tag would point at a commit that may never reach `main`.

**Decision: release on `push`, not `workflow_run`.** Chaining the release to a
green Tools CI with `workflow_run` would gate it on CI, but `workflow_run`
runs in the base repository's privileged context and is a known injection
path (zizmor flags it as dangerous). Instead `main` is protected: Tools CI is a
required status check, so nothing reaches `main` without passing it (see
*Recommended repository settings*).

**Decision: notify through `workflow_call`.** A release created with
`GITHUB_TOKEN` triggers no `release:` (or `push: tags`) workflow, by GitHub's
design against recursive runs. Listening for `release: published` would
therefore never fire for the releases this workflow creates, so `release.yml`
calls `notify-apps.yml` directly instead, and only for a release it just
created.

### Backfilling releases

Versions 0.3.0–0.5.0 were bumped and merged before `release.yml` existed;
only `v0.2.1` had a tag. They are released with **Actions → Release → Run
workflow** on `main`, once per version, oldest first, with `notify` off (the
apps get one issue for the current version, not four):

| Version | `sha` | Commit |
|---|---|---|
| 0.3.0 | `f22cd06579356913f0d4eed188d260b8ad332806` | merge of #10 |
| 0.3.1 | `48b285122c6d4985598af5bfd724ad952afbbd9e` | merge of #12 |
| 0.4.0 | `940418ad7530c355a9de964f73e96d005bfc36cf` | `feat!: replace Biome with oxlint + oxfmt` (in #13) |
| 0.5.0 | `ca6d3db8bc8f8747985fd7bae9631691aad16c7d` | merge of #13 |

Each SHA is the last first-parent commit on `main` carrying that version,
except 0.4.0, which was never the head of `main` (#13 bumped to 0.4.0 and then
to 0.5.0 before merging); its commit is reachable from `main` and carries a
`cli/dist` bundle built at 0.4.0, so `bunx github:daniel-rck/web-base#v0.4.0`
runs that version. `v0.2.1` (lightweight, on `443c3c8`) has a tag but no
release; dispatching `sha=443c3c81e3a084f1b86b6c377f6cb3bdcc6514e3` adds one.

A dispatch never moves the *Latest* badge (`--latest=false`), so the newest
release stays Latest however the backfills are ordered.

The first `release.yml` run is the push that merges it. If `main` is at a new
version by then (0.6.0), that push releases it and the table above is the
whole backfill. If `main` is still at 0.5.0, that push releases v0.5.0 at the
merge commit instead of `ca6d3db` (the same 0.5.0 CLI as long as nothing else
changed `cli/`); skip the 0.5.0 row then.

## notify-apps.yml (release → issue notifications)

`notify-apps.yml` opens an "update available" issue in each consuming app repo
(a matrix of the nine apps). Updates stay manual: the issue is the reminder to
run `web-base update`.

Triggers: `workflow_call` from `release.yml` (input `version`, required;
secret `APP_NOTIFY_TOKEN`, optional) and `workflow_dispatch` (input `version`)
to re-announce a version by hand. It has no `release:` trigger (see the
decision above).

Each matrix job (5 minutes, job-level concurrency group
`notify-apps-<owner/repo>`, never cancelled):

1. **No token → no-op.** Without `APP_NOTIFY_TOKEN` it logs a notice and exits
   0, so the workflow is safe before the secret exists.
2. **Version.** Normalized to `vX.Y.Z` and validated as SemVer; a prerelease
   is not announced.
3. **The release must exist.** `gh release view` on web-base (with
   `github.token`, hence the job's `contents: read`; the app token may not
   reach web-base) must find a published release that is not a prerelease.
4. **One issue per version.** If an open issue titled
   `web-base vX.Y.Z verfügbar` exists, nothing is created. If an open issue
   already announces a *newer* version, nothing is created either.
5. **Create** the issue (German; body below).
6. **Close what it supersedes.** Every other open issue whose title matches
   `^web-base v[0-9]+\.[0-9]+\.[0-9]+ verfügbar$` and names an older version
   is closed as *not planned* with the comment `Ersetzt durch #N`. An app
   therefore has at most one open update issue, for the newest release.

The open issues are listed with `gh issue list` without `--search`: the search
index lags, which would break the dedupe on a quick re-run.

The issue body links the release
(`https://github.com/daniel-rck/web-base/releases/tag/vX.Y.Z`, whose notes are
the CHANGELOG section including its migration notes) and lists the steps, all
pinned to the release tag:

1. `bunx github:daniel-rck/web-base#vX.Y.Z check` first.
2. `bunx github:daniel-rck/web-base#vX.Y.Z update core --apply`: updates only
   the blocks the app already uses, never scaffold seams or files listed in
   `webBase.unmanaged`.
3. New dependencies, scripts or blocks in the release:
   `bunx github:daniel-rck/web-base#vX.Y.Z add <template>`, since `update`
   never changes `package.json`.
4. `bun install && bun run lint && bun run typecheck && bun run test`.
5. Optionally `bunx github:daniel-rck/web-base#vX.Y.Z pins`.

It ends with "Migrationshinweise im Release beachten." and a footer saying the
issue was opened by `notify-apps.yml` and closes with the next release's.

**`APP_NOTIFY_TOKEN`** is a repository secret of web-base: a fine-grained
personal access token with access to the nine app repos and the repository
permissions **Issues: read and write** and **Metadata: read** (no code
access), or a GitHub App installation token with the same permissions. Opening
`web-base update --apply` PRs instead of issues would need code-write access
to every app; the issue path was chosen to avoid granting that.

## Dependabot

`.github/dependabot.yml` has one entry: `package-ecosystem: github-actions`
for directory `/` (which covers `.github/workflows/`), checked weekly, with
all updates in one group so they arrive as a single PR. Its commits are
`chore(deps): …` (`prefix: chore`, `include: scope`), matching the
conventional-commit rule. `cooldown.default-days: 7` holds back a release
until it is a week old, so a compromised release has time to be noticed and
pulled before it reaches nine repos.

Dependabot understands the `uses: owner/repo@<sha> # vX.Y.Z` form and updates
both. Local `./` references are left alone.

## Recommended repository settings

Settings the workflows assume but cannot set themselves:

- **Default `GITHUB_TOKEN` permissions: read-only** (Settings → Actions →
  General → Workflow permissions). The workflows request what they need per
  job; read-only is the fallback for anything that does not.
- **Protect `main`** (branch ruleset): require pull requests and the Tools CI
  status check. `release.yml` relies on this instead of chaining to CI.
- **Optionally protect release tags** (tag ruleset on `refs/tags/v*`): block
  deletion and updates, so a published version cannot be moved. Do not
  restrict creation, or `release.yml` cannot create tags.
- **App repos:** pin the web-base workflows to `@vX.Y.Z` and enable Dependabot
  for `github-actions` there, so a new web-base release arrives as a PR.

## Versioning the reusable workflows

The reusable workflows are versioned with web-base itself. There are no
separate major tags (`v1`, `v2`); an app pins the `vX.Y.Z` tag of a web-base
release. A breaking change to a workflow's inputs or behavior is a breaking
web-base change (see *Versioning* in `02-cli.md`) and gets a CHANGELOG entry
that says what callers must change. Apps take it when they bump their `@` ref.

## Future workflows

When/if we want additional reusable workflows, add them as new files, e.g.
`lint-only.yml`, a lighter check for draft PRs.

Each new reusable workflow gets:
- Its own `workflow_call` definition
- Documentation in this spec
- A skill reference in `references/ci.md`
