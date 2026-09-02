# 01 — Monorepo Structure

This spec defines the root-level files and their exact content.

## package.json

The root `package.json` declares the CLI binary so `bunx github:daniel-rck/web-base ...` works.

```json
{
  "name": "@daniel-rck/web-base",
  "private": false,
  "version": "0.3.0",
  "type": "module",
  "description": "Shared tooling, conventions, and templates for personal web apps",
  "keywords": ["cli", "scaffolding", "react", "vite", "pwa", "cloudflare-workers"],
  "author": "<author>",
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
    "build": "bun build cli/src/index.ts --outdir cli/dist --target node --format esm --minify && bun run build:shebang && chmod +x cli/dist/index.js",
    "build:shebang": "sed -i '1i#!/usr/bin/env node' cli/dist/index.js",
    "dev": "bun run cli/src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome format --write .",
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
    "@biomejs/biome": "^2.4.15",
    "@types/node": "^25.6.0",
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

**Decision: `cli/dist/index.js` is committed.** Bun installs Git dependencies
from the repo tarball as-is and runs no lifecycle scripts (`prepare` is
ignored), so if the bin entry only exists after a build step, `bunx
github:daniel-rck/web-base` fails with `could not determine executable to run`.
The bundled file is therefore checked in, and `tools-ci.yml` rebuilds it and
fails on `git diff -- cli/dist` so the committed bundle can't drift from
`cli/src/`. After changing CLI source, run `bun run build` and commit the
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
  "include": ["cli/src", "cli/src/**/*.json"]
}
```

`allowImportingTsExtensions` is required because the source uses
`import { foo } from "./bar.ts"`. Bun resolves this natively; the bundler
strips the extension. Don't drop the `.ts` suffix on imports.

## biome.json

The web-base repo uses Biome's strict settings since the CLI is a small, focused
codebase:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!**/dist", "!**/cli/dist", "!**/node_modules", "!**/cli/templates"]
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": { "organizeImports": "on" }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
  "linter": {
    "enabled": true,
    "domains": { "project": "recommended" },
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "warn" },
      "style": { "noNonNullAssertion": "warn" }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "json": { "formatter": { "trailingCommas": "none" } }
}
```

**Decision: templates are biome-ignored.** Files under `cli/templates/` are
*source material to be copied verbatim* into target apps. Linting them here
would either force them to match this repo's rules (wrong scope) or require
double maintenance. They're checked by the consuming app's CI instead. The
nested `cli/templates/biome/.gitignore` is a placeholder that anchors Biome
v2's `vcs.useIgnoreFile` discovery for the nested template config — it's not
shipped to apps (only `biome.json` is listed in the template manifest).

## .gitignore

```
node_modules/
.wrangler/
*.log
.DS_Store
```

`cli/dist/` is intentionally **not** ignored — the committed bundle is what
makes `bunx github:...` work (see the decision above). Biome skips it via
`files.includes` in `biome.json`.

## File presence checklist

After scaffolding, this should be the file tree at the root:

```
web-base/
├── .github/workflows/
│   ├── tools-ci.yml
│   └── web-app-ci.yml
├── .gitignore
├── CLAUDE.md
├── LICENSE
├── README.md
├── biome.json
├── docs/specs/
│   └── (these files)
├── package.json
└── tsconfig.json
```

The `cli/` and `skill/` directories are populated per their own specs.
