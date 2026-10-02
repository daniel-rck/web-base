# New-app reference (`app` template)

`web-base init --name <app>` applies the `app` template: everything in `core`
plus the files a new app needs to build. All of them are scaffold (the app's
own); `init` fills `<app-name>` into the ones it creates.

| File | What it is |
|---|---|
| `index.html` | `lang="de"`, `viewport-fit=cover`, `theme-color`, `<title>`, `<script src="/theme-init.js">` before the CSS |
| `vite.config.ts` | `react()`, `tailwindcss()`, VitePWA (`injectManifest`, `registerType: "prompt"`) — see `pwa.md` |
| `tsconfig.json` | `files: []`, references app / node / sw / worker |
| `tsconfig.app.json` | `src`, minus `src/sw`; `types: ["vite/client"]`; strict + `noUncheckedIndexedAccess` |
| `tsconfig.node.json` | `vite.config.ts`, `vitest.config.ts` |
| `src/main.tsx` | `<RouterProvider router={router} />` + `<UpdatePrompt />` |
| `src/index.css` | `@import "./lib/ui/theme.css";` |
| `.gitignore` | `node_modules`, `dist`, `.wrangler`, build info |

After `init`:

1. Replace `<one-line German description>` (index.html, vite.config.ts).
2. Take your accent slot from the hue table in `layout-system.md`: set
   `--accent-h` in `src/lib/ui/theme.css`, and the accent-600 hex as
   `theme_color` and `<meta name="theme-color">`.
3. Add `public/icon-192.png`, `icon-512.png`, `icon-maskable.png`.
4. Set `compatibility_date` in `wrangler.toml`; review `public/_headers`.
5. `bun install`, then `bun run lint && bun run typecheck && bun run test && bun run build`.

Imports are relative with explicit `.ts`/`.tsx` extensions — the templates use
no path alias (`@/…`), so nothing needs configuring in Vite, Vitest and
TypeScript alike.

An existing app doesn't run `init`; it adopts blocks with `web-base add
<template>` instead. `web-base check app --strict` on a fresh scaffold is clean.
