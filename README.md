# daniel-rck/web-base

Shared tooling, conventions, and templates for Daniel's personal web apps
([Hausverwaltung](https://github.com/daniel-rck/Hausverwaltung),
[Tennisturnier](https://github.com/daniel-rck/Tennisturnier),
[ErinnerMich](https://github.com/daniel-rck/ErinnerMich), and future apps).

Three things live in this monorepo, intentionally together so they stay aligned:

| Path | What | How consumed |
|---|---|---|
| `cli/` | Shadcn-style CLI that copies templates into an app repo | `bunx github:daniel-rck/web-base <cmd>` |
| `skill/` | Claude Code skill documenting the conventions | Symlink / install into Claude config |
| `.github/workflows/web-app-ci.yml` | Reusable GitHub Actions workflow | `uses: daniel-rck/web-base/.github/workflows/web-app-ci.yml@main` |

## Quick start

In a **new** app (empty directory):

```bash
bunx github:daniel-rck/web-base init
```

In an **existing** app (migrate to the shared baseline):

```bash
bunx github:daniel-rck/web-base add core    # all shared pieces
bunx github:daniel-rck/web-base add sync    # extras only some apps have
```

## What's in `core`

Everything every app of this family has: repo hygiene, Biome, the layout system
(AppShell + theme tokens), idb storage, injectManifest PWA, react-router-dom,
Cloudflare Worker routing.

Extras like `sync` (R2+KV E2E-encrypted) are separate `add` commands — only for
apps that actually need them.

## Specs

Architecture, conventions, and implementation plans live in
[`docs/specs/`](./docs/specs). Start with [`00-overview.md`](./docs/specs/00-overview.md).

## License

MIT © daniel-rck
