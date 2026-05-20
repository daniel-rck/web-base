# 04 — Layout System

The shared UI structure across all daniel-rck web apps. Structure is identical;
only the color accent in `theme.css` changes per app.

## Design principles

1. **Mobile-first.** Bottom-nav on `<md`, sidebar on `≥md`.
2. **Same shell, different paint.** The structural tokens (typography, spacing,
   radius, shadow) are shared. Only the color palette differs per app.
3. **No CSS-in-JS.** Tailwind 4 utility classes + CSS variables via `@theme`.
4. **No third-party UI library.** Custom primitives only. Shadcn-style means
   the code lives in the app after `web-base add layout`.
5. **Dark mode automatic** via `prefers-color-scheme`. No toggle needed.
   Apps may add a manual toggle on top of this if they want.

## Color tokens

The single variable that defines an app's accent is `--accent-h` (hue in
degrees, 0–360). All accent shades derive from it via OKLCH lightness/chroma
on the same hue.

Per-app suggested hues:

| App | Accent name | `--accent-h` | Sample OKLCH |
|---|---|---|---|
| Hausverwaltung | Slate-Blau | `250` | `oklch(0.62 0.18 250)` |
| Tennisturnier | Emerald | `155` | `oklch(0.68 0.17 155)` |
| ErinnerMich | Indigo | `285` | `oklch(0.58 0.19 285)` |

If Daniel wants different hues, swap the value of `--accent-h`. No other
tokens need to change.

## theme.css

The full template file at `cli/templates/layout/theme.css`:

```css
/*
 * Design tokens for daniel-rck web apps.
 * Per-app: change only `--accent-h` below.
 */

@import "tailwindcss";

@theme {
  /* ── App accent — change this per app ─────────────────── */
  --accent-h: 250; /* hue: 250=slate-blue, 155=emerald, 285=indigo */

  --color-accent-50:  oklch(0.97 0.02 var(--accent-h));
  --color-accent-100: oklch(0.94 0.04 var(--accent-h));
  --color-accent-200: oklch(0.88 0.08 var(--accent-h));
  --color-accent-300: oklch(0.80 0.12 var(--accent-h));
  --color-accent-400: oklch(0.70 0.16 var(--accent-h));
  --color-accent-500: oklch(0.62 0.18 var(--accent-h));
  --color-accent-600: oklch(0.55 0.18 var(--accent-h));
  --color-accent-700: oklch(0.48 0.16 var(--accent-h));
  --color-accent-800: oklch(0.40 0.13 var(--accent-h));
  --color-accent-900: oklch(0.30 0.10 var(--accent-h));

  /* ── Surfaces ──────────────────────────────────────────── */
  --color-surface:        oklch(1 0 0);
  --color-surface-muted:  oklch(0.97 0 0);
  --color-surface-sunken: oklch(0.94 0 0);
  --color-border:         oklch(0.88 0 0);
  --color-fg:             oklch(0.18 0 0);
  --color-fg-muted:       oklch(0.45 0 0);
  --color-fg-subtle:      oklch(0.60 0 0);

  /* ── Semantic ──────────────────────────────────────────── */
  --color-success: oklch(0.65 0.17 150);
  --color-warning: oklch(0.75 0.15 80);
  --color-danger:  oklch(0.60 0.20 25);
  --color-info:    oklch(0.65 0.15 230);

  /* ── Typography ────────────────────────────────────────── */
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  /* ── Radii ─────────────────────────────────────────────── */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* ── Shadows ───────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.10), 0 2px 4px -2px oklch(0 0 0 / 0.10);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.10), 0 4px 6px -4px oklch(0 0 0 / 0.10);

  /* ── Animation ─────────────────────────────────────────── */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-surface:        oklch(0.18 0 0);
    --color-surface-muted:  oklch(0.22 0 0);
    --color-surface-sunken: oklch(0.14 0 0);
    --color-border:         oklch(0.30 0 0);
    --color-fg:             oklch(0.95 0 0);
    --color-fg-muted:       oklch(0.70 0 0);
    --color-fg-subtle:      oklch(0.55 0 0);
  }
}

html { color-scheme: light dark; }
body {
  background-color: var(--color-surface);
  color: var(--color-fg);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

## Components

### AppShell

`src/lib/ui/AppShell.tsx`. The top-level layout wrapper.

Props:
```typescript
type AppShellProps = {
  title: string;
  logo?: ReactNode;
  navItems: NavItem[];
  headerActions?: ReactNode;
  children: ReactNode;
};
```

Structure:
- Outermost: `min-h-screen flex flex-col bg-surface text-fg`
- `<AppHeader>` (sticky, h-14)
- Below header: `flex flex-1 min-h-0`
  - Desktop sidebar (hidden on `<md`): `<aside class="hidden md:flex w-56 shrink-0 border-r border-border bg-surface-muted">`
    - `<AppNav variant="sidebar">`
  - Main: `flex-1 overflow-y-auto pb-16 md:pb-0`
    - `<div class="container mx-auto max-w-4xl px-4 py-6">{children}</div>`
- Mobile bottom nav (hidden on `≥md`): `md:hidden fixed bottom-0 inset-x-0 border-t bg-surface`
  - `<AppNav variant="bottom">`

### AppHeader

`src/lib/ui/AppHeader.tsx`.

Props:
```typescript
type AppHeaderProps = {
  title: string;
  logo?: ReactNode;
  actions?: ReactNode;
};
```

Structure:
- `<header class="sticky top-0 z-20 h-14 shrink-0 border-b border-border bg-surface/95 backdrop-blur">`
- Inside: `container mx-auto max-w-4xl h-full px-4 flex items-center justify-between gap-4`
- Left group: logo (if any, `text-accent-600`) + `<h1 class="text-base font-semibold tracking-tight truncate">{title}</h1>`
- Right group: `<div class="flex items-center gap-2 shrink-0">{actions}</div>`

### AppNav

`src/lib/ui/AppNav.tsx`. Renders nav as either sidebar or bottom-bar.

Props:
```typescript
type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;  // typically a lucide-react icon
};

type AppNavProps = {
  items: NavItem[];
  variant: "sidebar" | "bottom";
};
```

Sidebar variant:
- Outer: `<nav class="w-full p-3 space-y-1">`
- Each item: `<NavLink>` from react-router-dom, `end={true}`
- Item classes:
  - Base: `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors`
  - Active: `bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200`
  - Inactive: `text-fg-muted hover:bg-surface-sunken hover:text-fg`

Bottom variant:
- Outer: `<nav class="flex h-16">`
- Each item: `<NavLink class="flex-1 flex flex-col items-center justify-center gap-1 text-xs">`
- Active: `text-accent-600`
- Inactive: `text-fg-muted`

### PageHeader

`src/lib/ui/PageHeader.tsx`. Section header inside a page.

Props:
```typescript
type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};
```

Structure:
- `<div class="mb-6 flex items-start justify-between gap-4">`
- Left: `<h2 class="text-2xl font-semibold tracking-tight">{title}</h2>` + optional `<p class="mt-1 text-sm text-fg-muted">{subtitle}</p>`
- Right: `{actions}` if present

### primitives.tsx

Small reusable primitives co-located in one file (don't grow this past
~150 lines; split into `card.tsx`, etc. when it does):

- `Card` — `<div class="rounded-lg border border-border bg-surface p-4 shadow-sm">`
- `EmptyState` — centered icon + title + description + optional CTA
- `Spinner` — animated SVG, sizes sm/md/lg, accent-colored
- `Badge` — pill, variants: `neutral | accent | success | warning | danger`
- `Button` — variants: `primary | secondary | ghost | danger`; sizes `sm | md | lg`

All primitives must:
- Accept `className` and merge it (via simple `clsx`-style concat or `cn`
  helper — don't add `clsx` as a dependency unless other components need it)
- Forward refs where applicable (`Button`, `Card`)
- Have descriptive `aria-*` attributes for screen readers

### index.ts (barrel)

```typescript
export { AppShell } from "./AppShell.tsx";
export type { AppShellProps } from "./AppShell.tsx";
export { AppHeader } from "./AppHeader.tsx";
export type { AppHeaderProps } from "./AppHeader.tsx";
export { AppNav } from "./AppNav.tsx";
export type { NavItem, AppNavProps } from "./AppNav.tsx";
export { PageHeader } from "./PageHeader.tsx";
export type { PageHeaderProps } from "./PageHeader.tsx";
export * from "./primitives.tsx";
```

## Per-app customization

After `web-base add layout`, the only file a developer should edit in
`src/lib/ui/` is `theme.css` — and within that, primarily the `--accent-h`
value. Everything else stays untouched so `web-base update layout` works
cleanly.

If an app needs structural changes (e.g. a top-right floating action button),
add it to **this spec and the template at once**, not as a per-app edit.

## Anti-patterns

- ❌ Hard-coding accent colors in component files (`bg-blue-500`). Use
  `bg-accent-500` only.
- ❌ Adding `clsx`, `tailwind-merge`, `class-variance-authority` unless they
  pay for themselves across multiple files. Concat is fine.
- ❌ shadcn/ui as a dependency. The shadcn *philosophy* (copy code, don't
  import) is good — but their components carry implicit decisions we don't
  want (Radix UI deps, their token system, etc.).
- ❌ Per-app overrides via `tailwind.config.js` `extend`. Tokens go in
  `theme.css`, period.
