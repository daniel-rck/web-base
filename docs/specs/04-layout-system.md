# 04 — Layout System

The shared UI structure across all daniel-rck web apps. Structure is identical;
only the color accent in `theme.css` changes per app. Every token lives in the
owned `tokens.css`; `theme.css` is the per-app seam on top of it.

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
   as `data-theme` on `<html>`. `public/theme-init.js`, loaded from
   `index.html` before the stylesheet, prevents a flash of the wrong theme.

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

All of them live in `src/lib/ui/` and are **owned** (`update` keeps them
current) except `theme.css`, `public/theme-init.js` and the `index.ts` barrel,
which are scaffold seams.

### AppShell

`src/lib/ui/AppShell.tsx`. The top-level layout wrapper. It renders inside
the router — as the root layout route around `<Outlet />` (the router
template ships that route as `src/App.tsx`), because `AppNav`'s links are
router `NavLink`s.

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
- A skip link as the first focusable element: `<a href="#main">Zum Inhalt
  springen</a>`, `sr-only` until focused.
- `<AppHeader>` (sticky) — receives `<>{themeToggle ?? <ThemeToggle />}<OfflineIndicator /><InstallButton />{headerActions}</>`
  as `actions`. The always-present toggle comes first so it keeps its position
  while the conditional indicator and install button appear and disappear.
- Below header: `flex flex-1 min-h-0`
  - Desktop sidebar (hidden on `<md`): `<aside class="hidden md:block w-56 shrink-0 border-r border-border bg-surface-muted">`,
    with the `<AppNav variant="sidebar">` inside a
    `sticky top-[calc(3.5rem+env(safe-area-inset-top))]` wrapper — the header's
    `h-14` plus the notch inset it absorbs.
  - Main: `<main id="main" tabIndex={-1} class="flex-1 min-w-0 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0 focus:outline-hidden">`
    - `<div class="container mx-auto max-w-4xl px-4 py-6">{children}</div>`
- Mobile bottom nav (hidden on `≥md`): `md:hidden fixed bottom-0 inset-x-0 border-t border-border bg-surface/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)]`
  - `<AppNav variant="bottom">`

**Decision: the window scrolls, not `<main>`.** There is deliberately no
`overflow-y-auto` on `<main>`: an overflow container captures every descendant
`position: sticky` without ever scrolling itself, which silently breaks sticky
headers and toolbars anywhere in the page. `min-w-0` stops wide content
(tables, code blocks) from stretching the flex item past the viewport.

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
- Left group: logo (if any, `text-accent-600`) + the title as a
  `<span class="text-base font-semibold tracking-tight truncate">` — branding,
  not a heading
- Right group: `<div class="flex items-center gap-2 shrink-0">{actions}</div>`

The `h-14` sits on the inner container, not on the `<header>`. On a notched
phone the header also absorbs the status-bar inset; a fixed height on the
`<header>` itself would push the title up under the notch. And `maxWidthClass`
exists because an app with a wider content column (Minispiele's card grid) would
otherwise get a header narrower than the page beneath it.

**Decision: the page title is the `<h1>`, not the app name.** With the app
name as `<h1>` every page's outline opened with the same heading and the
page's own title sat at `<h2>`, level with its sections. `PageHeader` is now
the page's `<h1>`, `SectionCard` titles are `<h2>`.

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

Both variants render a `<nav>` landmark with `aria-label="Hauptnavigation"`.
Items are `NavLink`s with `end` (so `aria-current="page"` marks exactly the
active route). The icon span is `aria-hidden`; the label span is `truncate`.
Every link has the shared focus outline (see *Primitives*).

Sidebar variant:
- Outer: `<nav class="w-full p-3 space-y-1">`
- Item: `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors min-w-0`
  - Active: `bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200`
  - Inactive: `text-fg-muted hover:bg-surface-sunken hover:text-fg`

Bottom variant:
- Outer: `<nav class="flex h-16 items-stretch px-2">`
- Item: `group flex-1 min-w-0 flex flex-col items-center justify-center gap-1 py-1.5 text-xs font-medium`
- The active state is a **pill behind the icon** (`grid h-8 min-w-14 place-items-center rounded-full`,
  active `bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200`),
  with the label in `text-accent-600 dark:text-accent-300`; inactive icon and
  label are `text-fg-muted`. At this size a tint alone is easy to miss, and the
  pill keeps the touch target legible.

### PageHeader

`src/lib/ui/PageHeader.tsx`. The page's title — its one `<h1>`.

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
- Left: `<h1 class="text-2xl font-semibold tracking-tight truncate">{title}</h1>` + optional `<p class="mt-1 text-sm text-fg-muted">{subtitle}</p>`
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
- **Chrome / Edge / Android**: shows the button once the browser fired
  `beforeinstallprompt`, and triggers the deferred prompt on click. The event
  is captured **at module load**, not in an effect — it can fire before a
  lazily rendered shell mounts, and a missed event never comes back. A prompt
  is used once; a failing `prompt()` resolves to `"unavailable"`.
- **iOS and iPadOS Safari** (iPadOS 13+ reports a Macintosh user agent and is
  recognized by its touch points): no `beforeinstallprompt` is fired. The
  button (`aria-haspopup="dialog"`) is shown until standalone and opens a
  native `<dialog aria-labelledby=…>` with a short German „Zum
  Home-Bildschirm hinzufügen" instruction. A click on the backdrop closes it.

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

### OfflineIndicator

`src/lib/ui/OfflineIndicator.tsx` plus `useOnlineStatus()` in
`src/lib/ui/useOnlineStatus.ts` (`useSyncExternalStore` over the `online` /
`offline` events; a server render reads as online). `AppShell` mounts it in
the header. While the browser is offline it shows a warning `Badge` „Offline"
(title: „Keine Internetverbindung – deine Daten werden lokal gespeichert.").
The app keeps working — data is local-first — the badge only explains why sync
or updates pause. A visually hidden `role="status"` region is always mounted
and carries the announcement, because a live region that appears together
with its text is often not announced at all.

### ThemeToggle

`src/lib/ui/ThemeToggle.tsx` plus the `useTheme` hook in
`src/lib/ui/useTheme.ts`. A ghost-variant button that cycles the theme
system → light → dark on click, showing the matching `lucide-react` icon
(`Monitor` / `Sun` / `Moon`). Its `aria-label`/`title` name the current state
*and* the action: „Design: Hell – wechseln zu Dunkel". `AppShell`
auto-mounts it first in the header's right slot.

Props: none.

`useTheme()` is exported for custom theme UIs, and `setTheme` on its own:

```typescript
type Theme = "light" | "dark" | "system";

type UseThemeResult = {
  theme: Theme;                       // the user's choice
  resolvedTheme: "light" | "dark";    // what's actually showing
  setTheme: (t: Theme) => void;
};
```

Behavior:
- **One store for the page.** The choice lives in a module-level store read
  through `useSyncExternalStore`, so every `useTheme()` — the header toggle, a
  chart reading `resolvedTheme` — sees the same value at once. Other tabs
  follow through the `storage` event (also on `localStorage.clear()`, which
  reports `key === null`).
- The choice persists in `localStorage` under the key `theme` (settings-only,
  per `07-conventions.md`). Default is `"system"`. Storage errors (Safari
  private mode) are swallowed; the choice still applies for the session.
- `setTheme` writes `localStorage` and sets/removes `data-theme` on
  `document.documentElement` (`"system"` removes it, so the CSS falls back to
  `prefers-color-scheme`). The first subscriber reconciles the DOM with the
  stored value.
- `resolvedTheme` tracks `matchMedia("(prefers-color-scheme: dark)")`; without
  `matchMedia` (jsdom) it reads as light instead of throwing.
- SSR-safe: the server snapshot is `"system"`.

**FOUC prevention.** The canonical mechanism is the shipped
`public/theme-init.js` (a **scaffold** file of the layout template — an app
that stores the theme elsewhere adapts it), referenced from `index.html`
`<head>` before the stylesheet:

```html
<script src="/theme-init.js"></script>
```

**Decision: an external file, not an inline `<script>`.** An inline snippet
forces any app with a CSP to pin a `sha256-` hash of it, and that hash breaks
the theme silently the moment the snippet changes — a trap two apps had
already walked into. `script-src 'self'` is both simpler and stricter (the
worker template's `public/_headers` ships exactly that).

`themeInitScript` stays exported from `useTheme.ts` for apps that must inline it
anyway; the two must be kept in sync. An app that persists the theme somewhere
other than `localStorage["theme"]` — inside a validated settings blob, say —
adapts the read in its own `public/theme-init.js`. The contract is only that
`data-theme` ends up on `<html>` for a forced choice and stays absent for
"system".

### Primitives

One file per primitive, all re-exported by `primitives.tsx` (so an app's
`index.ts` line `export * from "./primitives.tsx"` keeps working):

| File | Exports |
|---|---|
| `Button.tsx` | `Button` — variants `primary \| secondary \| ghost \| danger`, sizes `sm \| md \| lg`; `buttonClassName()` for a `<Link>` that should look like a button |
| `Card.tsx` | `Card` (`interactive` adds a hover lift), `SectionCard` (titled `<section>`, `<h2>` title, optional `hint` and `icon`) |
| `Chip.tsx` | `Chip` — selectable pill with `aria-pressed` |
| `Badge.tsx` | `Badge` — variants `neutral \| accent \| success \| warning \| danger \| info` |
| `Spinner.tsx` | `Spinner` — sizes `sm \| md \| lg`, `label` (default „Lädt …") |
| `EmptyState.tsx` | `EmptyState` — icon, title (`titleAs`: `h2` default, `h3` inside a SectionCard, `p`), description, action |
| `cn.ts` | `cn()` class concat and `FOCUS_RING` (internal, not re-exported) |

All primitives:
- Accept `className` and merge it with `cn` (no `clsx` dependency).
- Take `ref` as a regular prop (React 19) — no `forwardRef`.
- Show keyboard focus as a real **outline**: `focus-visible:outline-2
  focus-visible:outline-offset-2` plus an outline colour (`outline-accent-500`;
  the danger button uses `outline-danger`).
- Put text on fills with `text-fg-on-accent`, never `text-white`; badge text on
  a semantic tint uses the `*-fg` token.
- Style hover as `not-disabled:hover:` and dim disabled controls with
  `disabled:opacity-50 disabled:cursor-not-allowed` — a disabled secondary or
  ghost button used to look enabled.
- `Spinner` is `role="status"` with visually hidden text — screen readers
  announce a status region's content, not an `aria-label` on it.

**Decision: an outline, not a box-shadow ring.** Tailwind 4's
`focus-visible:outline-none` sets `outline-style: none`, and forced-colors
mode (Windows high contrast) drops box-shadows, so the old ring-only focus
style vanished there entirely; its missing `ring-offset-surface` also drew a
white halo in dark mode. An outline survives both.

### index.ts (barrel)

A scaffold seam (apps may add their own exports):

```typescript
export type { AppHeaderProps } from "./AppHeader.tsx";
export { AppHeader } from "./AppHeader.tsx";
export type { AppNavProps, NavItem } from "./AppNav.tsx";
export { AppNav } from "./AppNav.tsx";
export type { AppShellProps } from "./AppShell.tsx";
export { AppShell } from "./AppShell.tsx";
export { InstallButton } from "./InstallButton.tsx";
export { OfflineIndicator } from "./OfflineIndicator.tsx";
export type { PageHeaderProps } from "./PageHeader.tsx";
export { PageHeader } from "./PageHeader.tsx";
export * from "./primitives.tsx";
export { ThemeToggle } from "./ThemeToggle.tsx";
export type { UseInstallPromptResult } from "./useInstallPrompt.ts";
export { useInstallPrompt } from "./useInstallPrompt.ts";
export { useOnlineStatus } from "./useOnlineStatus.ts";
export type { Theme, UseThemeResult } from "./useTheme.ts";
export { setTheme, themeInitScript, useTheme } from "./useTheme.ts";
```

An app that kept an older barrel imports the new pieces directly
(`./OfflineIndicator.tsx`, `./useOnlineStatus.ts`).

## Per-app customization

After `web-base add layout`, the files a developer edits in `src/lib/ui/` are
the seams: `theme.css` (the `--accent-h` hue and any app tokens) and, if
needed, `index.ts`. Everything else is owned and stays untouched, so
`web-base update layout --apply` works cleanly.

If an app needs structural changes (e.g. a top-right floating action button),
add it to **this spec and the template at once**, not as a per-app edit.

## Anti-patterns

- ❌ Hard-coding accent colors in component files (`bg-blue-500`). Use
  `bg-accent-500` only.
- ❌ `text-white` on a fill. Use `text-fg-on-accent`.
- ❌ `focus-visible:outline-none` with a ring. Use the outline (`FOCUS_RING`).
- ❌ A semantic colour as text on its own tint (`bg-success/15 text-success`).
  Use `text-success-fg`.
- ❌ Editing `tokens.css` in an app. Add tokens in `theme.css`.
- ❌ Adding `clsx`, `tailwind-merge`, `class-variance-authority` unless they
  pay for themselves across multiple files. Concat is fine.
- ❌ shadcn/ui as a dependency. The shadcn *philosophy* (copy code, don't
  import) is good — but their components carry implicit decisions we don't
  want (Radix UI deps, their token system, etc.).
- ❌ Per-app overrides via `tailwind.config.js` `extend`. Tokens go in
  `theme.css`, period.
