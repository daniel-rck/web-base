# 01 — Monorepo Structure

This spec defines the root-level files and their exact content.

## package.json

The root `package.json` declares the CLI binary so `bunx github:daniel-rck/web-base ...` works.

```json
{
  "name": "@daniel-rck/web-base",
  "private": false,
  "version": "0.5.0",
  "type": "module",
  "description": "Shared tooling, conventions, and templates for personal web apps",
  "keywords": ["cli", "scaffolding", "react", "vite", "pwa", "cloudflare-workers"],
  "author": "daniel-rck",
  "license": "MIT",
  "homepage": "https://github.com/daniel-rck/web-base",
  "repository": { "type": "git", "url": "https://github.com/daniel-rck/web-base.git" },
  "bugs": { "url": "https://github.com/daniel-rck/web-base/issues" },
  "packageManager": "bun@1.3.11",
  "bin": {
    "web-base": "./cli/dist/index.js"
  },
  "files": ["cli/dist", "cli/templates", "skill"],
  "scripts": {
    "build": "bun build cli/src/index.ts --outdir cli/dist --target node --format esm --minify --define 'process.env.NODE_ENV=\"production\"' --banner '#!/usr/bin/env node' && chmod +x cli/dist/index.js",
    "dev": "bun run cli/src/index.ts",
    "typecheck": "tsc --noEmit && tsc --noEmit -p tsconfig.templates.json",
    "lint": "oxlint && oxfmt --check",
    "format": "oxfmt",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepare": "bun run build"
  },
  "dependencies": {
    "citty": "^0.1.6",
    "consola": "^3.4.0",
    "pathe": "^1.1.2"
  },
  "devDependencies": {
    "@types/node": "^25.6.0",
    "oxfmt": "^0.70.0",
    "oxlint": "^1.85.0",
    "typescript": "~6.0.2",
    "vitest": "^4.1.5"
  }
}
```

**Decision: bundle into a single file.** The `bun build` step bundles all CLI
source plus dependencies into `cli/dist/index.js`. When a user runs `bunx
github:daniel-rck/web-base`, Bun/npm clone the repo and execute the bin entry
directly — having a single bundled file avoids the user needing to run
`bun install` first. Templates under `cli/templates/` stay as files (not
bundled) because the CLI reads them at runtime.

**Decision: the shebang comes from `bun build --banner`.** It used to be
prepended with `sed -i '1i…'`, which is GNU-only — on macOS (BSD sed) the build,
and with it `prepare` and every `bun install`, failed — and which stacked a
second shebang when run twice.

**Decision: the build defines `process.env.NODE_ENV` as `"production"`.**
`bun build` inlines `process.env.NODE_ENV` from the *building* shell. The e2e
globalSetup builds under vitest (`NODE_ENV=test`), so the bundle came out
with `"test"` baked in. In that state consola (via std-env) only printed
warnings, and CI's fresh build no longer matched the committed one. Pinning
the value makes the bundle byte-identical however it is built, and keeps the
CLI's output independent of the caller's `NODE_ENV`.

**Decision: `cli/dist/index.js` is committed.** Bun installs Git dependencies
from the repo tarball as-is and runs no lifecycle scripts (`prepare` is
ignored), so if the bin entry only exists after a build step, `bunx
github:daniel-rck/web-base` fails with `could not determine executable to run`.
The bundled file is therefore checked in, and `tools-ci.yml` rebuilds it and
fails when `git status --porcelain -- cli/dist` is non-empty (modified *or*
untracked output) so the committed bundle can't drift from `cli/src/`. After changing CLI source, run `bun run build` and commit the
updated bundle (the `prepare` script does this on every local `bun install`
too). The alternative — publishing to npm so a packed tarball with a
`prepublishOnly` build is served — was rejected; see below.

**Decision: no npm publish.** Distribution is via `bunx github:...` only. The
`files` array still exists for the future case where we decide to publish.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["cli/src", "cli/src/**/*.json", "vitest.config.ts"]
}
```

`allowImportingTsExtensions` is required because the source uses
`import { foo } from "./bar.ts"`. Bun resolves this natively; the bundler
strips the extension. Don't drop the `.ts` suffix on imports.

## tsconfig.templates.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": [],
    "erasableSyntaxOnly": true
  },
  "include": ["cli/templates/sync/client/**/*.ts", "cli/test/sync/**/*.ts"],
  "exclude": ["cli/test/sync/worker*.ts", "cli/test/sync/e2e.test.ts"]
}
```

The sync client is plain TypeScript over Web Crypto and `fetch`, so it is
typechecked here, with DOM types and without Node's; its tests in
`cli/test/sync/` run in this repo's vitest. The worker half needs Cloudflare's
types and is typechecked in the scaffold job instead (`06-workflows.md`).
React templates are typechecked only there.

## vitest.config.ts

```ts
import { defineConfig } from "vitest/config";

// Only the repo's own tests. Template test files (cli/templates/, cli/template-tests/)
// are copied into a scaffolded app and run there, never here.
export default defineConfig({
  test: {
    include: ["cli/src/**/*.test.ts", "cli/test/**/*.test.ts"],
    unstubEnvs: true,
    // The e2e suite runs the bundle; rebuild it from the current source first.
    globalSetup: ["cli/src/e2e/build-dist.ts"],
  },
});
```

Without an explicit `include`, vitest's default glob would collect test files
that ship inside templates. `unstubEnvs` restores every `vi.stubEnv` after each
test — tests set `WEB_BASE_TEMPLATES_DIR` that way, never by assigning
`process.env` (assigning `undefined` stores the string `"undefined"`).

## .claude/ (cloud sessions)

`.claude/settings.json` registers `.claude/hooks/session-start.sh` as a
`SessionStart` hook. In a Claude Code cloud session (`CLAUDE_CODE_REMOTE=true`)
it runs `bun install --frozen-lockfile`, so the gatekeepers in `CLAUDE.md`
(`typecheck`, `lint`, `test`) can run; elsewhere it is a no-op.

## .oxlintrc.json / .oxfmtrc.json

The web-base repo lints with oxlint and formats with oxfmt (see `07-conventions.md`).
The lint config is tuned for a small Node CLI — no React/a11y plugins, and
`no-explicit-any` is an error rather than a warn:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["typescript", "unicorn", "oxc", "import", "node", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "env": { "builtin": true, "node": true, "es2024": true },
  "ignorePatterns": ["cli/dist/**", "cli/templates/**", "cli/template-tests/**"],
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/no-non-null-assertion": "warn",
    "no-console": ["warn", { "allow": ["error", "warn"] }]
  }
}
```

The formatter config matches the one shipped to apps (`03-templates.md`, `oxc`),
minus the app-only ignores. Markdown is excluded to keep the specs and
changelog hand-wrapped:

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
  "ignorePatterns": [
    "cli/dist/**",
    "cli/templates/**",
    "cli/template-tests/**",
    "bun.lock",
    "**/*.md"
  ]
}
```

**Decision: templates are lint- and format-ignored.** Files under `cli/templates/`
(and the template tests in `cli/template-tests/`) are
*source material to be copied verbatim* into target apps. Linting them here
would either force them to match this repo's rules (wrong scope) or require
double maintenance. They're checked with their *shipped* config by the
"scaffold core and lint" step in `tools-ci.yml` instead. The template's own
config files are stored without their leading dot (`oxlintrc.json`,
`oxfmtrc.json`) so neither tool discovers them as nested configs here.

## .gitignore

```
node_modules/
.wrangler/
*.log
.DS_Store
.claude/worktrees/
```

`.claude/worktrees/` holds Claude Code's isolated agent checkouts; ignoring it
keeps oxlint, oxfmt and Git from treating those copies as part of the repo.

`cli/dist/` is intentionally **not** ignored — the committed bundle is what
makes `bunx github:...` work (see the decision above). oxlint and oxfmt skip it
via `ignorePatterns`.

## File presence checklist

After scaffolding, this should be the file tree at the root:

```
web-base/
├── .claude/
│   ├── hooks/session-start.sh
│   └── settings.json
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── notify-apps.yml
│       ├── release.yml
│       ├── tools-ci.yml
│       ├── web-app-ci.yml
│       └── web-base-check.yml
├── .gitignore
├── .oxfmtrc.json
├── .oxlintrc.json
├── CHANGELOG.md
├── CLAUDE.md
├── LICENSE
├── README.md
├── docs/specs/
│   └── (these files)
├── package.json
├── tsconfig.json
├── tsconfig.templates.json
└── vitest.config.ts
```

The `cli/` and `skill/` directories are populated per their own specs
(`02-cli.md`, `03-templates.md`, `05-skill.md`).
