# Tech stack reference

Version pins, the per-app `package.json` template, and the per-app Biome and
TypeScript configs.

## Production dependencies

```json
{
  "react": "^19.2.5",
  "react-dom": "^19.2.5",
  "react-router-dom": "^7.14.2",
  "idb": "^8.0.3",
  "lucide-react": "^1.16.0"
}
```

## Dev dependencies

```json
{
  "typescript": "^7.0.2",
  "vite": "^8",
  "@vitejs/plugin-react": "^6",
  "vite-plugin-pwa": "^1.3",
  "workbox-precaching": "^7.4.0",
  "workbox-window": "^7.4.0",
  "tailwindcss": "^4.2.4",
  "@tailwindcss/vite": "^4.2.4",
  "@biomejs/biome": "^2.5.11",
  "vitest": "^4.1.5",
  "@vitest/ui": "^4.1.5",
  "jsdom": "^29.1.0",
  "@testing-library/react": "^16.3.2",
  "@testing-library/user-event": "^14.6.1",
  "@testing-library/jest-dom": "^6.9.1",
  "wrangler": "^4.127.1",
  "@cloudflare/workers-types": "^5.20260706.1",
  "@types/react": "^19.2.14",
  "@types/react-dom": "^19.2.3",
  "@types/node": "^26.4.0"
}
```

## Package manager

```json
{ "packageManager": "bun@1.3.11" }
```

Required in every app's `package.json`. Bun's corepack integration uses it.

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
    "lint": "biome check .",
    "format": "biome format --write .",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "worker:dev": "wrangler dev",
    "worker:deploy": "wrangler deploy"
  }
}
```

## Per-app Biome config

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": true,
    "includes": ["**", "!**/dist", "!**/node_modules", "!**/.wrangler"]
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
    "domains": {
      "react": "recommended",
      "test": "recommended"
    },
    "rules": {
      "recommended": true,
      "correctness": { "useExhaustiveDependencies": "warn" },
      "style": { "noNonNullAssertion": "warn" },
      "suspicious": {
        "noExplicitAny": "warn",
        "noConsole": { "level": "warn", "options": { "allow": ["error", "warn"] } }
      }
    }
  },
  "javascript": {
    "formatter": { "quoteStyle": "double", "semicolons": "always", "trailingCommas": "all" }
  },
  "json": { "formatter": { "trailingCommas": "none" } }
}
```

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
