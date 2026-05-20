# Biome reference

We use Biome as the single linter + formatter. ESLint and Prettier are
explicitly out — see SKILL.md anti-patterns.

## Install

The `biome` template ships:

- `biome.json` at the repo root
- `@biomejs/biome` devDep
- `lint` and `format` scripts

```bash
bunx github:daniel-rck/web-base add biome
```

## Config

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": { "ignoreUnknown": true, "ignore": ["dist", "node_modules", ".wrangler"] },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "warn" },
      "style": { "noNonNullAssertion": "warn" },
      "suspicious": { "noConsoleLog": "warn", "noExplicitAny": "warn" }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "json": { "formatter": { "trailingCommas": "none" } }
}
```

## Migrating from ESLint + Prettier

After running `add biome`:

1. Remove `eslint.config.js`, `.eslintrc*`, `.prettierrc*`.
2. Remove devDeps: `eslint`, `typescript-eslint`, `@eslint/js`,
   `eslint-plugin-*`, `prettier`.
3. Run `bun install` to drop them from `bun.lockb`.
4. Run `bun run format && bun run lint`. Biome's auto-format will reshape
   files to the new style — review the diff.

## Quirks

- Biome's `noConsoleLog` is a warn, not an error. `console.error` and
  `console.warn` are fine for genuine errors.
- `noExplicitAny` is a warn. Use `unknown` and narrow.
- `noNonNullAssertion` is a warn. If you must use `!`, add a comment
  explaining why.
- The `useExhaustiveDependencies` rule is a warn for React hooks. Override
  with `// biome-ignore lint/correctness/useExhaustiveDependencies: <reason>`
  only when the dependency is intentionally stale.

## Per-app vs web-base

The `biome.json` shipped by the `biome` template is *slightly less strict*
than `web-base`'s own root `biome.json`. Apps get the warnings on
`noConsoleLog` and `noExplicitAny`; web-base itself doesn't because the CLI
codebase is small and tightly controlled. Don't unify them.
