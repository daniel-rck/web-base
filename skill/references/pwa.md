# PWA reference

We use `vite-plugin-pwa` with **injectManifest** (not `generateSW`) so the
service worker can have custom message handlers and background sync. A new
version **waits for the user** (`registerType: "prompt"`): activating it under
an open page would evict the lazy chunks that page still needs, because
Workers Assets only serves the current deploy.

## vite.config.ts

What `web-base init` writes (the `app` template); merge the `VitePWA` block
into an existing app's config. Keep the config a plain object — the testing
template's `vitest.config.ts` merges it.

```typescript
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// A plain object, not the function form: vitest.config.ts merges it.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "index.ts",
      // A new version waits for the user's go (UpdatePrompt); see src/sw/base.ts.
      registerType: "prompt",
      injectRegister: "auto",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
      },
      devOptions: { enabled: false, type: "module" },
      manifest: {
        id: "/",
        name: "<app-name>",
        short_name: "<app-name>",
        description: "<one-line German description>",
        lang: "de",
        dir: "ltr",
        // accent-600 of the app's hue, as hex (#a71f65 is hue 355)
        theme_color: "#a71f65",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
```

The worker builds to `dist/index.js`. Add `"exclude": ["src/sw"]` to
`tsconfig.app.json` and reference `tsconfig.sw.json` from `tsconfig.json`.

## The service worker

`src/sw/base.ts` is owned by web-base (never edit it): precache, an
`index.html` fallback for every navigation (offline deep links), and
activation only on `SKIP_WAITING`.

```typescript
/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

export type AppShellOptions = {
  /** Extra navigation paths the SPA fallback must leave to the network. */
  navigationDenylist?: RegExp[];
};

/**
 * The service-worker baseline, owned by web-base: precache the build, serve
 * index.html for every navigation (so an offline deep link like /mieter/123
 * opens the app instead of a browser error), and activate a new version only
 * when the page asks for it.
 */
export function registerAppShell({ navigationDenylist = [] }: AppShellOptions = {}): void {
  precacheAndRoute(self.__WB_MANIFEST);
  cleanupOutdatedCaches();
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("index.html"), {
      denylist: [/^\/api(\/|$)/, /^\/healthz$/, ...navigationDenylist],
    }),
  );

  // No skipWaiting() on install. Workers Assets only serves the current
  // deploy, so a new worker that activated under an open page would evict the
  // old precache while the page still needs its lazy chunks. The page posts
  // SKIP_WAITING when the user accepts the update (UpdatePrompt).
  self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") void self.skipWaiting();
  });
  self.addEventListener("activate", (event) => {
    event.waitUntil(self.clients.claim());
  });
}
```

`src/sw/index.ts` is the app's:

```typescript
/// <reference lib="webworker" />
import { registerAppShell } from "./base.ts";

// Precache, offline navigation and prompt-based updates (owned: base.ts).
registerAppShell();

// App-specific handlers go below — push, notificationclick, background sync,
// runtime caching. Example:
//
// declare const self: ServiceWorkerGlobalScope;
// self.addEventListener("push", (event) => { … });
```

## Update prompt

Render `<UpdatePrompt />` from `src/lib/pwa/UpdatePrompt.tsx` once, next to
`<RouterProvider>` in `src/main.tsx`. It shows „Update verfügbar – neu laden"
(posting `SKIP_WAITING` and reloading every tab) and „Die App ist jetzt auch
offline verfügbar." An app with its own UI calls `useAppUpdate()`:

```typescript
type AppUpdate = {
  needRefresh: boolean;
  offlineReady: boolean;
  reload: () => void;  // activate the waiting version, reload all tabs
  dismiss: () => void;
};
```

## Adding notification handlers (ErinnerMich)

```typescript
self.addEventListener("push", (event) => {
  const payload = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Erinnerung", {
      body: payload.body,
      icon: "/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const c of clients) {
        if (c.url === url && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
```

## Adding background sync (Hausverwaltung)

```typescript
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-pending") {
    event.waitUntil(flushPendingMutations());
  }
});
```

Register a sync tag from the client:

```typescript
const reg = await navigator.serviceWorker.ready;
await reg.sync.register("sync-pending");
```

## Install button

The PWA install button is shipped with the **layout** template (not
this one), at `src/lib/ui/InstallButton.tsx` plus the
`useInstallPrompt` hook in `src/lib/ui/useInstallPrompt.ts`. `AppShell`
auto-mounts it in the header, so no per-app wiring is required.

- Chrome / Edge / Android: listens for `beforeinstallprompt`, shows
  the button when the browser fires it, triggers the native prompt on
  click, hides on `appinstalled`.
- iOS and iPadOS Safari: no `beforeinstallprompt` exists. The button is
  shown until `display-mode: standalone` and opens a small `<dialog>` with
  the "Teilen → Zum Home-Bildschirm" instructions.

Apps that want a custom UI (banner, in-page CTA) import `useInstallPrompt`
from `src/lib/ui/index.ts` (relative imports — the templates use no path
alias) — see the layout reference for the return shape.

## Why not generateSW

`generateSW` is convenient but precludes:
- Push notification handlers (ErinnerMich)
- Background sync (any app with optional sync)
- Custom message handlers (cross-tab signalling)

The owned baseline (`base.ts`) is ~40 lines; the app's `index.ts` grows
linearly with its features. The trade is worth it.
