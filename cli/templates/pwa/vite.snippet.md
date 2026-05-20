# VitePWA configuration snippet

Merge into your `vite.config.ts`. Delete this file after merging.

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

## Type declarations

Add a `vite-env.d.ts` (or similar) so `self.__WB_MANIFEST` is typed:

```typescript
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
```
