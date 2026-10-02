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
`cli/src/docs/theme.test.ts` enforces both against the table below (the
reserved hues are read from `tokens.css`).

Per-app hues:

| App | Accent name | `--accent-h` |
|---|---|---|
| Pizzateig | Orange | `50` |
| Tankzettel | Frischgrün | `110` |
| Tennisturnier | Smaragd | `175` |
| Minispiele | Türkis | `200` |
| Zeiterfassung | Blau | `255` |
| Hausverwaltung | Indigo | `280` |
| ErinnerMich | Violett | `305` |
| Tonspur | Magenta | `330` |
| (nächste App) | Himbeere | `355` |

HamsterFlight is not in the table: it is not a Tailwind app (a pixi.js canvas
game with no `theme.css`) — excluded by decision, not by omission.

**Decision: the hues were redistributed in 0.6.0.** The previous table broke
its own rule three times — Tennisturnier at 155 sat 5° from `success`,
Zeiterfassung at 230 *on* `info`, Hausverwaltung at 250 20° from both — and
the template default (250) did too. With four reserved hues and a 25° minimum
the wheel has exactly nine free slots: one in 50–55, one in 105–125, two in
175–205 and five in 255–360. Pizzateig (50, its warm token set is tuned
around it) and Tankzettel (110, the zero-drift reference) stay; the others
move by 5–30° to exact 25° spacing, so no app changes colour family (the two
blues stay blue, Hausverwaltung now reads indigo, ErinnerMich violet). The
last slot, 355, is the template default — the next app takes it and records
itself here. A tenth accent needs a rule change, not a squeeze.

An earlier decision moved two of the three warm apps (Tankzettel 55 → 110,
Tonspur 45 → 320) out of the 10° band they shared between `danger` and
`warning`.

**Contrast guarantee.** Every text pair the components use reaches WCAG AA
(4.5:1) at every hue in the table, in light and dark: body text (`fg`,
`fg-muted`, `fg-subtle`) on the surfaces, `fg-on-accent` on accent-600/700
and on the danger fills, accent text where the nav and badges put it, and the
`*-fg` text tokens on their own semantic tint. The focus outline (accent-500)
reaches 3:1 on the surface. `theme.test.ts` checks this in sRGB, taking the
worse of per-channel clipping and chroma-reducing gamut mapping. It does not
cover P3 displays or app-specific token forks (Pizzateig's warm surfaces).

**Decision: semantic text uses its own `-fg` token.** The semantic fills
(`success`, `warning`, …) are mid-lightness so they read as icons and tints;
as text on a 15% tint of themselves they reached 1.9–3.5:1. `--color-*-fg`
is a darker (light theme) or lighter (dark theme) shade of the same hue.

## tokens.css

`src/lib/ui/tokens.css` — **owned**: every token, the dark blocks, motion.
`update` overwrites it, so apps never edit it. The full template file:

```css
/*
 * Design tokens for daniel-rck web apps. OWNED by web-base: `web-base update`
 * overwrites this file, so never edit it in an app. The per-app seam is
 * theme.css, which imports this file and sets the accent hue.
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
  /* ── Accent ───────────────────────────────────────────── */
  /* Fallback only — theme.css sets the app's hue. */
  --accent-h: 355;

  --color-accent-50: oklch(0.97 0.02 var(--accent-h));
  --color-accent-100: oklch(0.94 0.04 var(--accent-h));
  --color-accent-200: oklch(0.88 0.08 var(--accent-h));
  --color-accent-300: oklch(0.8 0.12 var(--accent-h));
  --color-accent-400: oklch(0.7 0.16 var(--accent-h));
  --color-accent-500: oklch(0.6 0.18 var(--accent-h));
  --color-accent-600: oklch(0.49 0.18 var(--accent-h));
  --color-accent-700: oklch(0.43 0.16 var(--accent-h));
  --color-accent-800: oklch(0.37 0.13 var(--accent-h));
  --color-accent-900: oklch(0.28 0.1 var(--accent-h));

  /* ── Surfaces ──────────────────────────────────────────── */
  --color-surface: oklch(1 0 0);
  --color-surface-muted: oklch(0.97 0 0);
  --color-surface-sunken: oklch(0.94 0 0);
  --color-border: oklch(0.88 0 0);
  --color-fg: oklch(0.18 0 0);
  --color-fg-muted: oklch(0.45 0 0);
  --color-fg-subtle: oklch(0.54 0 0);

  /* Foreground for text sitting on a saturated fill (accent/danger buttons,
   * the active chip). `--color-fg` is near-black in light mode, so it is the
   * wrong token there — this one stays light in both themes. */
  --color-fg-on-accent: oklch(0.99 0 0);

  /* ── Semantic ──────────────────────────────────────────── */
  /* Reserved hues: danger 25, warning 80, success 150, info 230. App accents
   * keep ≥25° away (04-layout-system.md). The fills are for icons, borders and
   * tints; text on a tint uses the matching `-fg` token. */
  --color-success: oklch(0.65 0.17 150);
  --color-warning: oklch(0.75 0.15 80);
  --color-danger: oklch(0.55 0.2 25);
  --color-danger-strong: oklch(0.48 0.19 25);
  --color-info: oklch(0.65 0.15 230);

  --color-success-fg: oklch(0.48 0.13 150);
  --color-warning-fg: oklch(0.5 0.11 80);
  --color-danger-fg: oklch(0.5 0.19 25);
  --color-info-fg: oklch(0.48 0.13 230);

  /* ── Typography ────────────────────────────────────────── */
  --font-sans:
    ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  /* ── Radii ─────────────────────────────────────────────── */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;

  /* ── Shadows ───────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.1), 0 2px 4px -2px oklch(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.1), 0 4px 6px -4px oklch(0 0 0 / 0.1);

  /* ── Animation ─────────────────────────────────────────── */
  --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;

  --animate-fade-in: fade-in var(--duration-base) var(--ease-out-quart) both;
  --animate-slide-up: slide-up var(--duration-base) var(--ease-out-quart) both;

  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes slide-up {
    from {
      opacity: 0;
      transform: translateY(0.5rem);
    }
  }
}

/*
 * Dark tokens. `@theme` only works at top level, so dark values are plain
 * custom-property overrides on `:root` (utilities read them via `var()`).
 * Three states: no `data-theme` = follow the OS; `data-theme="dark"` / `"light"`
 * = forced. The dark token list appears twice — once in the media query (system)
 * and once on the forced selector — because CSS can't share one declaration
 * block across a media query and a plain selector. A test keeps them identical.
 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-surface: oklch(0.18 0 0);
    --color-surface-muted: oklch(0.22 0 0);
    --color-surface-sunken: oklch(0.14 0 0);
    --color-border: oklch(0.3 0 0);
    --color-fg: oklch(0.95 0 0);
    --color-fg-muted: oklch(0.7 0 0);
    --color-fg-subtle: oklch(0.62 0 0);
    --color-success-fg: oklch(0.8 0.14 150);
    --color-warning-fg: oklch(0.85 0.13 80);
    --color-danger-fg: oklch(0.78 0.13 25);
    --color-info-fg: oklch(0.8 0.11 230);
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
  --color-fg-subtle: oklch(0.62 0 0);
  --color-success-fg: oklch(0.8 0.14 150);
  --color-warning-fg: oklch(0.85 0.13 80);
  --color-danger-fg: oklch(0.78 0.13 25);
  --color-info-fg: oklch(0.8 0.11 230);
  color-scheme: dark;
}

:root[data-theme="light"] {
  color-scheme: light;
}

/*
 * Reduced motion: collapse animations and transitions to an instant for users
 * who ask for it. The spinner keeps turning — it is the only signal that work
 * is in progress, not decoration.
 */
@media (prefers-reduced-motion: reduce) {
  *:not(.animate-spin),
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
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

## theme.css

`src/lib/ui/theme.css` — the per-app **scaffold** seam. It imports
`tokens.css`, sets the accent hue, and holds whatever tokens an app adds:

```css
/*
 * The app's theme — a per-app seam (`web-base update` never touches it).
 * Every token lives in tokens.css, which web-base owns; this file only picks
 * the accent hue and holds app-specific additions.
 */

@import "./tokens.css";

/* The accent hue: take your app's slot from the table in 04-layout-system.md.
 * 355 is the one free slot (the fallback in tokens.css). Unlayered on purpose,
 * so it wins over the `@theme` default whatever the cascade layers say. */
:root {
  --accent-h: 355;
}

/* App-specific tokens and overrides below (e.g. Pizzateig's warm surfaces). */
```

**Decision: owned tokens behind a thin seam.** `theme.css` used to be the
whole token file *and* a scaffold, so no token fix ever reached an existing
app — the same trap the oxlint config was split out of (`oxlint.base.json` +
`.oxlintrc.json`). Now the tokens flow through `update`, and the seam is five
lines an app has no reason to rewrite. The hue sits in an unlayered `:root`
rule so it overrides the `@theme` default regardless of cascade layers.

**Decision: reduced motion is a token-file reset.** `prefers-reduced-motion:
reduce` collapses every animation and transition to an instant, except
`.animate-spin` — the spinner is the only sign that work is in progress. The
`--animate-fade-in`/`--animate-slide-up` keyframes and `--radius-2xl` were
promoted from Pizzateig's fork (08 claimed this had happened in 0.3.0; it had
not).

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
  /** Replaces the built-in ThemeToggle — for apps with i18n. */
  themeToggle?: ReactNode;
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
  /** Tailwind max-w-* for the inner container. Default `max-w-4xl`. */
  maxWidthClass?: string;
};
```

Structure:
- `<header class="sticky top-0 z-20 shrink-0 border-b border-border bg-surface/95 backdrop-blur">`
  with `style={{ paddingTop: "env(safe-area-inset-top)" }}`
- Inside: `container mx-auto {maxWidthClass} h-14 px-4 flex items-center justify-between gap-4`

The `h-14` sits on the inner container, not on the `<header>`. On a notched
phone the header also absorbs the status-bar inset; a fixed height on the
`<header>` itself would push the title up under the notch. And `maxWidthClass`
exists because an app with a wider content column (Minispiele's card grid) would
otherwise get a header narrower than the page beneath it.
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
