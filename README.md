# web-base

Shared tooling, conventions, and templates for the personal web apps under
daniel-rck — nine of them today (ErinnerMich, HamsterFlight, Hausverwaltung,
Minispiele, Pizzateig, Tankzettel, Tennisturnier, Tonspur, Zeiterfassung; their
state is in [`08-app-migrations.md`](./docs/specs/08-app-migrations.md)) and
every future one.

Three things live in this monorepo, intentionally together so they stay aligned:

| Path | What | How consumed |
|---|---|---|
| `cli/` | Shadcn-style CLI that copies templates into an app repo | `bunx github:daniel-rck/web-base#vX.Y.Z <cmd>` |
| `skill/` | Claude Code skill documenting the conventions | Symlink into `~/.claude/skills/` or a repo's `.claude/skills/` |
| `.github/workflows/web-app-ci.yml`, `web-base-check.yml` | Reusable workflows: CI, and the drift guard | `uses: daniel-rck/web-base/.github/workflows/<file>@vX.Y.Z` |

## Quick start

A **new** app — installs, typechecks, tests and builds out of the box:

```bash
bunx github:daniel-rck/web-base#vX.Y.Z init --name my-app --cwd my-app
```

An **existing** app:

```bash
bunx github:daniel-rck/web-base#vX.Y.Z add core          # all shared pieces (also patches package.json)
bunx github:daniel-rck/web-base#vX.Y.Z add backup        # extras: backup, sync
bunx github:daniel-rck/web-base#vX.Y.Z check --strict    # owned files still match the base?
bunx github:daniel-rck/web-base#vX.Y.Z update core --diff   # what an update would change
bunx github:daniel-rck/web-base#vX.Y.Z update core --apply  # pull it
bunx github:daniel-rck/web-base#vX.Y.Z pins              # dependency versions vs. the fleet's pins
```

Replace `vX.Y.Z` with a [release](https://github.com/daniel-rck/web-base/releases).
Exit codes: `0` ok, `1` the app doesn't conform, `2` the command couldn't run.

## What's in `core`

Everything every app of this family has: repo hygiene, oxlint + oxfmt, the
Vitest setup, the layout system (AppShell, accessible primitives, design
tokens), idb storage, the injectManifest PWA with a prompt-based update,
react-router-dom with error pages, and Cloudflare Worker routing with security
headers. `init` adds the entry files on top (the `app` template).

Extras are separate `add` commands, only for apps that need them: `backup`
(JSON export/import, „Alle Daten löschen") and `sync` (R2 end-to-end-encrypted
sync with QR pairing).

## Specs

Architecture, conventions, and decisions live in
[`docs/specs/`](./docs/specs). Start with [`00-overview.md`](./docs/specs/00-overview.md).
What changed when: [`CHANGELOG.md`](./CHANGELOG.md).

## License

MIT © daniel-rck
