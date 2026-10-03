# Router reference

`react-router-dom` 7 with a typed routes scaffold. Always include the
router, even if the app starts with one page — retrofitting is painful.

## Files

`src/lib/router.tsx` — the route tree (scaffold). The root route renders the
shell (`App`); page errors render inside it; `*` is the 404 page:

```tsx
import { createBrowserRouter } from "react-router-dom";
import { App } from "../App.tsx";
import { ROUTES } from "./routes.ts";
import { NotFound } from "./routing/NotFound.tsx";
import { RouteError } from "./routing/RouteError.tsx";
import { RouteFallback } from "./routing/RouteFallback.tsx";

export const router = createBrowserRouter([
  {
    // The root layout route: AppShell around every page (src/App.tsx).
    path: ROUTES.home,
    Component: App,
    ErrorBoundary: RouteError,
    HydrateFallback: RouteFallback,
    children: [
      {
        // A page error renders inside the shell, so the navigation keeps working.
        ErrorBoundary: RouteError,
        children: [
          {
            index: true,
            lazy: async () => ({
              Component: (await import("../features/home/HomePage.tsx")).HomePage,
            }),
          },
          // Add feature routes here, e.g.
          // { path: ROUTES.settings, lazy: async () => ({ Component: (await import("../features/settings/SettingsPage.tsx")).SettingsPage }) },
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);
```

`src/App.tsx` — the root layout route (scaffold):

```tsx
import { House } from "lucide-react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { ROUTES } from "./lib/routes.ts";
import { AppShell, type NavItem } from "./lib/ui/index.ts";

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.home, label: "Start", icon: <House className="h-5 w-5" /> },
];

/** The root layout route: the shell around every page. */
export function App() {
  return (
    <AppShell title="<app-name>" navItems={NAV_ITEMS}>
      <Outlet />
      <ScrollRestoration />
    </AppShell>
  );
}
```

`src/lib/routes.ts` — path constants:

```typescript
export const ROUTES = {
  home: "/",
} as const;

export type RouteKey = keyof typeof ROUTES;
```

Owned, in `src/lib/routing/`: `RouteError` (German error page; a failed lazy
chunk after a deploy offers „Neu laden"), `NotFound`, `RouteFallback` (spinner
while the first route loads) and `useDocumentTitle("<Seite>")`.

## Mounting

`src/main.tsx` renders the router alone — never inside `AppShell`, which is the
root layout route (its `NavLink`s need the router):

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import "./index.css";
import { UpdatePrompt } from "./lib/pwa/UpdatePrompt.tsx";
import { router } from "./lib/router.tsx";

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root element");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </StrictMode>,
);
```

## Patterns

- **Lazy-load feature pages.** Each route's `lazy` callback dynamically
  imports its `Component`. Keeps the initial bundle small.
- **Use the constants.** Import `ROUTES.home` instead of writing `"/"`
  in links — refactors stay typesafe.
- **NavLink for nav.** `AppNav` uses `NavLink` with `end` so the home route
  doesn't stay active on every page.
- **Title per page.** `useDocumentTitle("Einstellungen")` and a `<PageHeader
  title="Einstellungen">` (the page's `<h1>`).

## Adding a route

1. Add the path constant in `routes.ts`:
   ```typescript
   export const ROUTES = {
     home: "/",
     settings: "/einstellungen",
   } as const;
   ```
2. Add the route next to the `HomePage` one in `router.tsx` (above `*`):
   ```typescript
   {
     path: ROUTES.settings,
     lazy: async () => ({
       Component: (await import("../features/settings/SettingsPage.tsx")).SettingsPage,
     }),
   },
   ```
3. Add the nav item in `src/App.tsx`:
   ```tsx
   { to: ROUTES.settings, label: "Einstellungen", icon: <Settings className="h-5 w-5" /> }
   ```

## Anti-patterns

- Hand-writing `"/path"` strings in `<Link>` / `navigate()` calls instead
  of `ROUTES.x` (the owned error pages are the exception: they can't import
  an app's `routes.ts`).
- Wrapping `<RouterProvider>` in `<AppShell>`.
- Forgetting `end` on a `NavLink` to `"/"` (active state will spill).
- Using `react-router` (the core) directly instead of `react-router-dom`.
