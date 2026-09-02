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
5. **Dark mode defaults to `prefers-color-scheme`**, with a built-in manual
   override. **The contract is `data-theme` on `<html>`, and it is an
   invariant** — a `.dark` class cannot express "follow the OS" without
   JavaScript, so a class-based app always paints the wrong theme until its
   first effect runs. Absent attribute = follow the OS; `data-theme="dark"` /
   `"light"` = forced. A `ThemeToggle` (auto-mounted in the header) cycles
   system → light → dark; the choice persists in `localStorage` and is expressed
   as `data-theme` on `<html>`. An inline init script (`themeInitScript`) in
   `index.html` prevents a flash of the wrong theme on load.

## Color tokens

The single variable that defines an app's accent is `--accent-h` (hue in
degrees, 0–360). All accent shades derive from it via OKLCH lightness/chroma
on the same hue.

**Reserved hues.** The semantic tokens occupy fixed hues: `danger` 25,
`warning` 80, `success` 150, `info` 230. An app accent must sit at least 25°
away from each of them — otherwise a `Badge variant="success"` and an accent
chip are indistinguishable — and at least 25° from every other app's accent.

Per-app hues:

| App | Accent name | `--accent-h` | Sample OKLCH |
|---|---|---|---|
| Pizzateig | Orange | `50` | `oklch(0.62 0.18 50)` |
| Tankzettel | Frischgrün | `110` | `oklch(0.62 0.18 110)` |
| Tennisturnier | Emerald | `155` | `oklch(0.68 0.17 155)` |
| Minispiele | Türkis | `195` | `oklch(0.62 0.18 195)` |
| Zeiterfassung | Blau | `230` | `oklch(0.62 0.18 230)` |
| Hausverwaltung | Slate-Blau | `250` | `oklch(0.62 0.18 250)` |
| ErinnerMich | Indigo | `285` | `oklch(0.58 0.19 285)` |
| Tonspur | Neon-Magenta | `320` | `oklch(0.62 0.18 320)` |
| HamsterFlight | — | — | Not a Tailwind app: a pixi.js canvas game with no `theme.css`. Excluded by decision, not by omission. |

**Decision: two of the three warm apps moved.** Pizzateig (50), Tankzettel (55)
and Tonspur (45) previously sat inside a 10° band, and that band is itself
squeezed between `danger` (25) and `warning` (80). Pizzateig kept 50 because its
token set is tuned around it (warm-tinted surfaces, `--color-accent-warm`,
`--shadow-warm`); Tankzettel and Tonspur are pure accent consumers, so moving
them costs one line each. Minispiele's apparent collision with Hausverwaltung at
250 was a stale scaffold — the app already overrode the hue to 195 in
`index.css`; 195 is now written where it belongs.

If different hues are wanted, swap the value of `--accent-h`. No other
tokens need to change.

## theme.css

The full template file at `cli/templates/layout/theme.css`:

```css
/*
 * Design tokens for daniel-rck web apps.
 * Per-app: change only `--accent-h` below.
 */

@import "tailwindcss";

/*
 * Make Tailwind's `dark:` variant follow the manual theme choice, not just the
 * OS. It triggers when the OS prefers dark AND the user hasn't forced light, or
 * when the user has forced dark — mirroring the token logic below so utilities
 * like `dark:bg-accent-900/40` stay in sync with the surface tokens.
 */
@custom-variant dark {
  @media (prefers-color-scheme: dark) {
    &:where(:not([data-theme="light"]), :not([data-theme="light"]) *) {
      @slot;
    }
  }
  &:where([data-theme="dark"], [data-theme="dark"] *) {
    @slot;
  }
}

@theme {
  /* ── App accent — change this per app ─────────────────── */
  --accent-h: 250; /* hue: 250=slate-blue, 155=emerald, 285=indigo */

  --color-accent-50: oklch(0.97 0.02 var(--accent-h));
  --color-accent-100: oklch(0.94 0.04 var(--accent-h));
  --color-accent-200: oklch(0.88 0.08 var(--accent-h));
  --color-accent-300: oklch(0.8 0.12 var(--accent-h));
  --color-accent-400: oklch(0.7 0.16 var(--accent-h));
  --color-accent-500: oklch(0.62 0.18 var(--accent-h));
  --color-accent-600: oklch(0.55 0.18 var(--accent-h));
  --color-accent-700: oklch(0.48 0.16 var(--accent-h));
  --color-accent-800: oklch(0.4 0.13 var(--accent-h));
  --color-accent-900: oklch(0.3 0.1 var(--accent-h));

  /* ── Surfaces ──────────────────────────────────────────── */
  --color-surface: oklch(1 0 0);
  --color-surface-muted: oklch(0.97 0 0);
  --color-surface-sunken: oklch(0.94 0 0);
  --color-border: oklch(0.88 0 0);
  --color-fg: oklch(0.18 0 0);
  --color-fg-muted: oklch(0.45 0 0);
  --color-fg-subtle: oklch(0.6 0 0);

  /* Foreground for text sitting on a saturated fill (accent/danger/success
   * buttons and badges). `--color-fg` is near-black in light mode, so it is the
   * wrong token there — this one stays light in both themes. */
  --color-fg-on-accent: oklch(0.99 0 0);

  /* ── Semantic ──────────────────────────────────────────── */
  --color-success: oklch(0.65 0.17 150);
  --color-warning: oklch(0.75 0.15 80);
  --color-danger: oklch(0.6 0.2 25);
  --color-info: oklch(0.65 0.15 230);

  /* ── Typography ────────────────────────────────────────── */
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  /* ── Radii ─────────────────────────────────────────────── */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* ── Shadows ───────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1);

  /* ── Animation ─────────────────────────────────────────── */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
}

/*
 * Dark tokens. `@theme` only works at top level, so dark values are plain
 * custom-property overrides on `:root` (utilities read them via `var()`).
 * Three states: no `data-theme` = follow the OS; `data-theme="dark"` / `"light"`
 * = forced. The dark token list appears twice — once in the media query (system)
 * and once on the forced selector — because CSS can't share one declaration
 * block across a media query and a plain selector. Keep both blocks in sync.
 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-surface: oklch(0.18 0 0);
    --color-surface-muted: oklch(0.22 0 0);
    --color-surface-sunken: oklch(0.14 0 0);
    --color-border: oklch(0.3 0 0);
    --color-fg: oklch(0.95 0 0);
    --color-fg-muted: oklch(0.7 0 0);
    --color-fg-subtle: oklch(0.55 0 0);
    color-scheme: dark;
  }
}

:root[data-theme="dark"] {
  --color-surface: oklch(0.18 0 0);
  --color-surface-muted: oklch(0.22 0 0);
  --color-surface-sunken: oklch(0.14 0 0);
  --color-border: oklch(0.3 0 0);
  --color-fg: oklch(0.95 0 0);
  --color-fg-muted: oklch(0.7 0 0);
  --color-fg-subtle: oklch(0.55 0 0);
  color-scheme: dark;
}

:root[data-theme="light"] {
  color-scheme: light;
}

html {
  color-scheme: light dark;
}
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
- `<AppHeader>` (sticky, h-14) — receives `<><InstallButton />{headerActions}</>`
  as `actions`, so the PWA install button always renders before any app-specific
  actions. `InstallButton` self-hides when not applicable.
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

Both variants render a `<nav>` landmark, so both carry
`aria-label="Hauptnavigation"` to give each landmark an accessible name. The
icon span is `aria-hidden`; the label span is `truncate` so long labels clip
with an ellipsis instead of wrapping and breaking the layout rhythm.

Sidebar variant:
- Outer: `<nav class="w-full p-3 space-y-1" aria-label="Hauptnavigation">`
- Each item: `<NavLink>` from react-router-dom, `end={true}`
- Item classes:
  - Base: `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0`
  - Active: `bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200`
  - Inactive: `text-fg-muted hover:bg-surface-sunken hover:text-fg`
- Label span: `truncate`

Bottom variant:
- Outer: `<nav class="flex h-16" aria-label="Hauptnavigation">`
- Each item: `<NavLink class="flex-1 min-w-0 flex flex-col items-center justify-center gap-1 text-xs">`
- Active: `text-accent-600`
- Inactive: `text-fg-muted`
- Label span: `max-w-full truncate`

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

### InstallButton

`src/lib/ui/InstallButton.tsx` plus the `useInstallPrompt` hook in
`src/lib/ui/useInstallPrompt.ts`. Renders a small ghost-variant button
that triggers the PWA install flow. `AppShell` auto-mounts it inside the
header's right slot, so apps need no boilerplate.

Props: none.

Behavior:
- **Standalone** (`display-mode: standalone` or `navigator.standalone`):
  renders `null`. The user already installed the app.
- **Chrome / Edge / Android**: listens for `beforeinstallprompt`,
  shows the button once the browser deems the app installable, and
  triggers the deferred prompt on click. Listens for `appinstalled`
  to hide itself.
- **iOS Safari**: no `beforeinstallprompt` is fired. The button is
  shown unconditionally (until standalone) and opens a native
  `<dialog>` with a short German „Zum Home-Bildschirm hinzufügen"
  instruction (Teilen-Symbol → Zum Home-Bildschirm → Hinzufügen).

`useInstallPrompt()` is exported for apps that want to build a custom
install UI (e.g. a banner) instead of the default button:

```typescript
type UseInstallPromptResult = {
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};
```

The hook has no runtime dependency on the `pwa` template — without a
registered service worker, browsers simply never fire
`beforeinstallprompt`, the iOS path still works, and the button stays
hidden on non-iOS.

If an app wants to suppress the default button (rare), pass an
`InstallButton`-replacement via `headerActions` and additionally hide
the auto-mounted one by overriding `AppShell`. Default is: show.

### ThemeToggle

`src/lib/ui/ThemeToggle.tsx` plus the `useTheme` hook in
`src/lib/ui/useTheme.ts`. A ghost-variant button that cycles the theme
system → light → dark on click, showing the matching `lucide-react` icon
(`Monitor` / `Sun` / `Moon`) with a German `aria-label`/`title` and an
`sr-only` label. `AppShell` auto-mounts it in the header's right slot — before
`InstallButton`, so the always-present toggle keeps a stable position while the
conditional install button appears/disappears. Unlike `InstallButton`, it is
always visible.

Props: none.

`useTheme()` is exported for custom theme UIs:

```typescript
type Theme = "light" | "dark" | "system";

type UseThemeResult = {
  theme: Theme;                       // the user's choice
  resolvedTheme: "light" | "dark";    // what's actually showing
  setTheme: (t: Theme) => void;
};
```

Behavior:
- The choice persists in `localStorage` under the key `theme` (settings-only,
  per `07-conventions.md`). Default is `"system"`.
- `setTheme` writes `localStorage` and sets/removes `data-theme` on
  `document.documentElement` (`"system"` removes it, so the CSS falls back to
  `prefers-color-scheme`).
- `resolvedTheme` tracks the live system preference via a
  `matchMedia("(prefers-color-scheme: dark)")` listener while in `"system"` mode.
- SSR-safe (`typeof window` guards).

**FOUC prevention.** The canonical mechanism is the shipped
`public/theme-init.js` (an `owned` file of the layout template), referenced from
`index.html` `<head>` before the stylesheet:

```html
<script src="/theme-init.js"></script>
```

**Decision: an external file, not an inline `<script>`.** An inline snippet
forces any app with a Worker CSP to pin a `sha256-` hash of it, and that hash
breaks the theme silently the moment the snippet changes — a trap two apps had
already walked into. `script-src 'self'` is both simpler and stricter. As a real
file it is also guardable by `web-base check`, which an inline `<head>` snippet
can never be.

`themeInitScript` stays exported from `useTheme.ts` for apps that must inline it
anyway; the two must be kept in sync. An app that persists the theme somewhere
other than `localStorage["theme"]` — inside a validated settings blob, say —
adapts the read in its own `public/theme-init.js`. The contract is only that
`data-theme` ends up on `<html>` for a forced choice and stays absent for
"system".

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
export { InstallButton } from "./InstallButton.tsx";
export { useInstallPrompt } from "./useInstallPrompt.ts";
export type { UseInstallPromptResult } from "./useInstallPrompt.ts";
export { ThemeToggle } from "./ThemeToggle.tsx";
export { themeInitScript, useTheme } from "./useTheme.ts";
export type { Theme, UseThemeResult } from "./useTheme.ts";
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
