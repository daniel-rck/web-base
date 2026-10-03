# Tech stack reference

Version pins, the per-app `package.json` template, and the per-app oxlint/oxfmt and
TypeScript configs. The pins mirror `cli/templates/pins.json` in web-base;
`web-base pins` compares an app against them (`--apply` rewrites mismatches).

## Production dependencies

```json
{
  "react": "^19.2.8",
  "react-dom": "^19.2.8",
  "react-router-dom": "^7.18.3",
  "idb": "^8.0.3",
  "lucide-react": "^1.39.0"
}
```

## Dev dependencies

```json
{
  "typescript": "~7.0.2",
  "vite": "^8.2.2",
  "@vitejs/plugin-react": "^6.1.1",
  "vite-plugin-pwa": "^1.3.0",
  "workbox-precaching": "^7.4.1",
  "workbox-routing": "^7.4.1",
  "workbox-strategies": "^7.4.1",
  "workbox-expiration": "^7.4.1",
  "workbox-window": "^7.4.1",
  "tailwindcss": "^4.3.3",
  "@tailwindcss/vite": "^4.3.3",
  "oxlint": "^1.85.0",
  "oxfmt": "^0.70.0",
  "vitest": "^4.1.11",
  "@vitest/ui": "^4.1.11",
  "jsdom": "^30.0.1",
  "fake-indexeddb": "^6.2.5",
  "@testing-library/react": "^16.3.3",
  "@testing-library/dom": "^10.4.2",
  "@testing-library/user-event": "^14.6.7",
  "@testing-library/jest-dom": "^7.0.1",
  "wrangler": "^4.128.0",
  "@cloudflare/workers-types": "^5.20260902.1",
  "@types/react": "^19.2.18",
  "@types/react-dom": "^19.2.5",
  "@types/node": "^26.4.1"
}
```

## Package manager

```json
{ "packageManager": "bun@1.3.11" }
```

Required in every app's `package.json`. `oven-sh/setup-bun` reads it in CI;
it also documents which Bun the lockfile was written with.

## package.json template (per app)

```json
{
  "name": "<app-name>",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "description": "<one-line German description>",
  "keywords": ["pwa", "privacy", "offline", "react", "vite", "typescript"],
  "author": "daniel-rck",
  "license": "MIT",
  "homepage": "https://<app>.daniel-rck.workers.dev",
  "repository": { "type": "git", "url": "https://github.com/daniel-rck/<App>.git" },
  "bugs": { "url": "https://github.com/daniel-rck/<App>/issues" },
  "packageManager": "bun@1.3.11",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "oxlint && oxfmt --check",
    "format": "oxfmt",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "worker:dev": "wrangler dev",
    "worker:deploy": "wrangler deploy"
  }
}
```

## Per-app oxlint / oxfmt config

Shipped by the `oxc` template: `oxlint.base.json` + `.oxfmtrc.json` (owned) and
`.oxlintrc.json` + `.prettierignore` (per-app seams). The full content is in
`oxc.md`.

## vitest.config.ts (per app)

Shipped by the `testing` template: it merges `vite.config.ts` and loads the
owned `src/test/setup.ts`. Include it in `tsconfig.node.json` next to
`vite.config.ts`. The full content is in `testing.md`.

## tsconfig.app.json (per app)

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
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
    "types": ["vite/client"]
  },
  "include": ["src"]
}
```

## vite.config.ts skeleton

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "index.ts",
      // See pwa.md for the full config (manifest entries, icons, etc.).
    }),
  ],
});
```

Domain dependencies (chart.js, dnd-kit, framer-motion, qrcode, canvas-confetti,
…) are added per-app via `bun add`, not by the CLI.
