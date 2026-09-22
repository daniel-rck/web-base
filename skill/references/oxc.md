# oxc reference (oxlint + oxfmt)

We use the oxc toolchain: **oxlint** as the linter, **oxfmt** as the
formatter. ESLint, Prettier and Biome are explicitly out — see SKILL.md
anti-patterns.

## Install

The `oxc` template ships:

- `oxlint.base.json` — the shared lint rules (**owned**, `update` overwrites it)
- `.oxlintrc.json` — `extends` the base, holds per-app `overrides` (**scaffold**)
- `.oxfmtrc.json` — the formatter settings (**owned**)
- `.prettierignore` — per-app formatter exclusions (**scaffold**; oxfmt reads it)
- `oxlint` and `oxfmt` devDeps
- `lint` (`oxlint && oxfmt --check`) and `format` (`oxfmt`) scripts

```bash
bunx github:daniel-rck/web-base add oxc
```

## Config

`oxlint.base.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "react", "jsx-a11y", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "env": { "builtin": true, "browser": true, "es2024": true },
  "ignorePatterns": ["dist/**", ".wrangler/**", "dev-dist/**"],
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn",
    "react/react-in-jsx-scope": "off",
    "typescript/no-explicit-any": "warn",
    "typescript/no-non-null-assertion": "warn",
    "no-console": ["warn", { "allow": ["error", "warn"] }],
    "no-underscore-dangle": "off",
    "unicorn/require-post-message-target-origin": "off",
    "jsx-a11y/prefer-tag-over-role": "off"
  }
}
```

`.oxlintrc.json` (the per-app seam):

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "extends": ["./oxlint.base.json"],
  "overrides": [
    { "files": ["scripts/**"], "rules": { "no-console": "off" } },
    {
      "files": ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"],
      "rules": { "typescript/no-non-null-assertion": "off" }
    }
  ]
}
```

`.oxfmtrc.json`:

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "sortImports": { "newlinesBetween": false },
  "sortPackageJson": false,
  "ignorePatterns": ["dist/**", ".wrangler/**", "dev-dist/**", "bun.lock", "**/*.md", "**/*.generated.ts"]
}
```

## Migrating from Biome (or ESLint + Prettier)

After running `add oxc` (or `update core --apply`):

1. Remove `biome.json`, `biome.base.json`, `eslint.config.js`, `.eslintrc*`,
   `.prettierrc*`.
2. Remove devDeps: `@biomejs/biome`, `eslint`, `typescript-eslint`,
   `@eslint/js`, `eslint-plugin-*`, `prettier`.
3. Move per-app Biome `overrides`: lint rules into `.oxlintrc.json`'s
   `overrides`, formatter exclusions into `.prettierignore`.
4. Rewrite `// biome-ignore lint/<group>/<rule>: <reason>` as
   `// oxlint-disable-next-line <plugin>/<rule> -- <reason>`.
5. Run `bun install`, then `bunx oxlint --fix && bunx oxfmt && bun run lint`.
   oxfmt reshapes some files (import order, a few wrapping differences) —
   review the diff.

Common Biome → oxlint rule names: `useExhaustiveDependencies` →
`react/exhaustive-deps`, `noNonNullAssertion` →
`typescript/no-non-null-assertion`, `noExplicitAny` →
`typescript/no-explicit-any`, `noConsole` → `no-console`,
`noRestrictedGlobals` → `no-restricted-globals`.

## Quirks

- `no-console` is a warn, not an error. The `allow: ["error", "warn"]` list
  keeps `console.error` / `console.warn` usable for genuine errors;
  `console.log` and other methods are flagged.
- `typescript/no-explicit-any` is a warn. Use `unknown` and narrow.
- `typescript/no-non-null-assertion` is a warn. If you must use `!`, add a
  comment explaining why.
- `react/exhaustive-deps` is a warn. Suppress with
  `// oxlint-disable-next-line react/exhaustive-deps -- <reason>` only when the
  dependency is intentionally stale.
- Warnings do not fail `bun run lint`; errors do. `oxfmt --check` fails on any
  unformatted file.
- oxlint does not lint CSS or JSON (Biome did). oxfmt formats them, including
  Tailwind 4 directives in `theme.css`.
- oxfmt has no `extends`, so the formatter config is one owned file. Per-app
  exclusions (generated modules, vendored files) go in `.prettierignore`,
  which oxfmt reads next to `.gitignore`. Files named `*.generated.ts` are
  already excluded.
- oxlint discovers nested `.oxlintrc.json` files. Keep one at the repo root
  unless a subdirectory genuinely needs different rules.

## Per-app vs web-base

The config shipped by the `oxc` template differs from `web-base`'s own root
`.oxlintrc.json`: apps enable the `react`, `jsx-a11y` and `vitest` plugins and
the browser env; web-base lints a Node CLI and makes `no-explicit-any` an
error. Don't unify them.
