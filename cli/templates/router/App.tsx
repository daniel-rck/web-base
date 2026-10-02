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
    <AppShell title="<App-Name>" navItems={NAV_ITEMS}>
      <Outlet />
      <ScrollRestoration />
    </AppShell>
  );
}
