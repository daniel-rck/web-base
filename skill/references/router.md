# Router reference

`react-router-dom` 7 with a typed routes scaffold. Always include the
router, even if the app starts with one page — retrofitting is painful.

## Files

`src/lib/router.tsx` (browser router definition):

```typescript
import { createBrowserRouter } from "react-router-dom";
import { ROUTES } from "./routes.ts";

export const router = createBrowserRouter([
  {
    path: ROUTES.home,
    lazy: async () => {
      const { HomePage } = await import("../features/home/HomePage.tsx");
      return { Component: HomePage };
    },
  },
]);
```

`src/lib/routes.ts` (path constants):

```typescript
export const ROUTES = {
  home: "/",
} as const;

export type RouteKey = keyof typeof ROUTES;
```

## Mounting

In `main.tsx`:

```typescript
import { RouterProvider } from "react-router-dom";
import { router } from "./lib/router.tsx";

createRoot(document.getElementById("root")!).render(
  <RouterProvider router={router} />,
);
```

## Patterns

- **Lazy-load feature pages.** Each route's `lazy` callback dynamically
  imports its `Component`. Keeps the initial bundle small.
- **Use the constants.** Import `ROUTES.home` instead of writing `"/"`
  in links — refactors stay typesafe.
- **NavLink for nav.** `AppNav` uses `NavLink` from react-router-dom
  with `end={true}` so the home route doesn't stay active on every page.

## Adding a route

1. Add the path constant in `routes.ts`:
   ```typescript
   export const ROUTES = {
     home: "/",
     settings: "/einstellungen",
   } as const;
   ```
2. Add the route in `router.tsx`:
   ```typescript
   {
     path: ROUTES.settings,
     lazy: async () => {
       const { SettingsPage } = await import("../features/settings/SettingsPage.tsx");
       return { Component: SettingsPage };
     },
   }
   ```
3. Add the nav item in the AppShell call site:
   ```typescript
   { to: ROUTES.settings, label: "Einstellungen", icon: <SettingsIcon /> }
   ```

## Anti-patterns

- Hand-writing `"/path"` strings in `<Link>` / `navigate()` calls instead
  of `ROUTES.x`.
- Forgetting `end` on a `NavLink` to `"/"` (active state will spill).
- Using `react-router` (the core) directly instead of `react-router-dom`.
