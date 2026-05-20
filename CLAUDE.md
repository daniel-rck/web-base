# Claude Code instructions for daniel-rck/web-base

This is the shared tooling repo for daniel-rck's web apps. The full architecture
and conventions live in `docs/specs/`. **Read those before making changes.**

## Reading order

For any task in this repo, start with `docs/specs/00-overview.md`. It points to
the spec relevant to what you're doing:

| Working on… | Spec |
|---|---|
| Repo structure, root configs | `01-monorepo-structure.md` |
| The CLI (commands, manifest format, file copy logic) | `02-cli.md` |
| A specific template under `cli/templates/` | `03-templates.md` |
| The shared layout system, design tokens | `04-layout-system.md` |
| The Claude Code skill under `skill/` | `05-skill.md` |
| Reusable GitHub Actions workflows | `06-workflows.md` |
| Stack decisions, version pins, anti-patterns | `07-conventions.md` |
| Migrating one of the existing apps | `08-app-migrations.md` |

## Workflow

daniel-rck uses spec-driven development:

1. **Specs are the source of truth.** Code follows the spec, not the other way around.
2. **Specs are living documents.** When the design changes, update the spec in the same change. Don't archive specs; use Git for history.
3. **The compiler / Biome / tests are the gatekeepers.** After any change run:
   - `bun run typecheck`
   - `bun run lint`
   - `bun run test`
4. **Commit messages use conventional commits** (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`).

## Implementation guidance

- TypeScript strict, including `noUncheckedIndexedAccess`. Don't disable rules globally.
- One concern per file. Helpers that have grown past ~150 lines probably want splitting.
- Biome formats and lints — don't add ESLint or Prettier configs.
- Bun is the runtime + package manager. Don't introduce npm/yarn/pnpm lock files.
- The CLI must run via `bunx github:daniel-rck/web-base ...` after `bun run build`. Verify with the `tools-ci.yml` workflow.

## When something isn't in the specs

If a decision needs to be made that the specs don't cover:

1. Make the smallest reasonable choice that fits the existing patterns
2. Document it in the matching spec file in the same PR
3. Flag it in the PR description so daniel-rck can confirm or correct
