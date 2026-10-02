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
