# PWA reference

We use `vite-plugin-pwa` with **injectManifest** (not `generateSW`) so the
service worker can have custom message handlers and background sync.

## vite.config.ts (injectManifest block)

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src/sw",
      filename: "index.ts",
      injectRegister: "auto",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff2}"],
      },
      registerType: "autoUpdate",
      devOptions: { enabled: false, type: "module" },
      manifest: {
        name: "<app-name>",
        short_name: "<app-name>",
        description: "<one-line German description>",
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
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

## sw.ts skeleton

```typescript
/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
```

## tsconfig.sw.json (separate config)

The SW needs `lib: ["ES2022", "WebWorker"]` instead of `DOM`. Keep it in a
separate `tsconfig.sw.json` and add it to the root `tsconfig.json`
`references` array.

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
- iOS Safari: no `beforeinstallprompt` exists. The button is shown
  unconditionally (until `display-mode: standalone`) and opens a
  small in-component `<dialog>` with the "Teilen → Zum
  Home-Bildschirm" instructions.

Apps that want a custom UI (banner, in-page CTA) can import
`useInstallPrompt` directly from `@/lib/ui` — see the layout reference
for the return shape.

## Why not generateSW

`generateSW` is convenient but precludes:
- Push notification handlers (ErinnerMich)
- Background sync (any app with optional sync)
- Custom message handlers (cross-tab signalling)

The hand-written SW is ~40 lines for the baseline and grows linearly with
features. The trade is worth it.
