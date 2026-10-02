# Layout system reference

The shared UI structure across all apps. Structure is identical; only the
color accent in `theme.css` changes per app.

The full spec is
[`04-layout-system.md`](https://github.com/daniel-rck/web-base/blob/main/docs/specs/04-layout-system.md)
in web-base. This reference is the day-to-day terse version.

## Principles

1. Mobile-first. Bottom-nav on `<md`, sidebar on `≥md`.
2. Same shell, different paint. Only `--accent-h` differs per app.
3. Tailwind 4 utility classes + CSS variables via `@theme`. No CSS-in-JS.
4. Custom primitives only. No shadcn/ui, no Radix UI.
5. Dark mode defaults to `prefers-color-scheme`, with a built-in `ThemeToggle`
   (light/dark/system) that persists in `localStorage` as `data-theme` on
   `<html>`.

## Per-app accent hues

| App | Accent | `--accent-h` | `theme_color` |
|---|---|---|---|
| Pizzateig | Orange | `50` | `#aa3100` |
| Tankzettel | Frischgrün | `110` | `#696500` |
| Tennisturnier | Smaragd | `175` | `#007e5a` |
| Minispiele | Türkis | `200` | `#007a88` |
| Zeiterfassung | Blau | `255` | `#005cc2` |
| Hausverwaltung | Indigo | `280` | `#524bc2` |
| ErinnerMich | Violett | `305` | `#793bb0` |
| Tonspur | Magenta | `330` | `#952c8f` |
| (nächste App) | Himbeere | `355` | `#a71f65` |

Reserved for the semantic tokens: danger 25, warning 80, success 150, info
230. Every accent keeps ≥25° from those and from every other app.

Change *only* `--accent-h` in `theme.css` to change the app's accent. All
tokens live in `tokens.css` (owned by web-base, never edited); all accent
shades derive from the hue via OKLCH. Text on a semantic tint uses the
matching `text-success-fg` / `-warning-fg` / `-danger-fg` / `-info-fg`.

## Components

All exported from `src/lib/ui/index.ts`; all owned (never edit them in an
app) except `theme.css`, `public/theme-init.js` and `index.ts`.

### `AppShell`

```typescript
type AppShellProps = {
  title: string;
  logo?: ReactNode;
  navItems: NavItem[];
  headerActions?: ReactNode;
  themeToggle?: ReactNode; // replaces the German ThemeToggle (i18n apps)
  children: ReactNode;
};
```

Renders as the router's root layout route around `<Outlet />` (`src/App.tsx`
from the router template) — `AppNav` needs the router. A skip link
(„Zum Inhalt springen") targets `<main id="main">`. Header actions in order:
theme toggle, `OfflineIndicator`, `InstallButton`, then `headerActions`. The
window scrolls (no `overflow-y-auto` on `<main>`, which would break sticky
elements).

### `AppHeader`

```typescript
type AppHeaderProps = {
  title: string;
  logo?: ReactNode;
  actions?: ReactNode;
  maxWidthClass?: string; // default "max-w-4xl"
};
```

Sticky, backdrop-blur, absorbs the notch inset; `h-14` on the inner container.
The title is branding (a `<span>`), not a heading.

### `AppNav`

```typescript
type NavItem = { to: string; label: string; icon: ReactNode };
type AppNavProps = { items: NavItem[]; variant: "sidebar" | "bottom" };
```

Sidebar on `≥md` (active: `bg-accent-100 text-accent-700`), bottom bar on
`<md` (active: a pill behind the icon, label `text-accent-600`). `NavLink`
with `end`.

### `PageHeader`

```typescript
type PageHeaderProps = { title: string; subtitle?: string; actions?: ReactNode };
```

The page's `<h1>`. Every page renders one; `SectionCard` titles are `<h2>`.

### `InstallButton` + `useInstallPrompt`

Auto-mounted by `AppShell`. Hidden when standalone or when the browser hasn't
fired `beforeinstallprompt` (captured at module load, so a late mount doesn't
miss it). On iOS/iPadOS Safari it opens a `<dialog>` with German
„Zum Home-Bildschirm" instructions.

```typescript
type UseInstallPromptResult = {
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};
```

### `OfflineIndicator` + `useOnlineStatus`

Auto-mounted by `AppShell`: a warning badge „Offline" while the browser is
offline, announced through an always-mounted `role="status"` region.
`useOnlineStatus(): boolean` for custom UI.

### `ThemeToggle` + `useTheme`

Auto-mounted first in the header. Cycles system → light → dark; the label says
the state and the action („Design: Hell – wechseln zu Dunkel"). One
module-level store: every `useTheme()` sees the same value; other tabs follow
via the `storage` event. Persists in `localStorage["theme"]` as `data-theme`
on `<html>` (`"system"` removes it). Works without `matchMedia` (jsdom).

```typescript
type Theme = "light" | "dark" | "system";
type UseThemeResult = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
};
```

Prevent the theme flash with `<script src="/theme-init.js"></script>` in
`index.html` `<head>`, before the stylesheet (an external file keeps a CSP at
`script-src 'self'`). `themeInitScript` is the same logic as a string for apps
that must inline it.

### Primitives

One file each, re-exported from `primitives.tsx`:

- `Button` — `primary | secondary | ghost | danger`, `sm | md | lg`;
  `buttonClassName({ variant, size })` styles a `<Link>` as a button.
- `Card` (`interactive` hover lift), `SectionCard` (titled section, `<h2>`).
- `Chip` — selectable pill, `aria-pressed`.
- `Badge` — `neutral | accent | success | warning | danger | info`.
- `Spinner` — `sm | md | lg`, `role="status"` with hidden text.
- `EmptyState` — icon, title (`titleAs` `h2`/`h3`/`p`), description, action.

All of them take `className` (merged with `cn`, no `clsx`), take `ref` as a
prop (React 19, no `forwardRef`), show focus as an outline
(`focus-visible:outline-2 outline-offset-2 outline-accent-500`), and use
`text-fg-on-accent` on fills.

## Per-app customization

Edit only the seams: `theme.css` (`--accent-h`, app tokens) and, if needed,
`index.ts`. Never `tokens.css` or a component — `web-base update layout
--apply` overwrites them. Structural changes go into the template and spec at
once, not into one app.

## Anti-patterns

- Hard-coding accent colors like `bg-blue-500`. Use `bg-accent-500` only.
- `text-white` on a fill — use `text-fg-on-accent`.
- `focus-visible:outline-none` + ring — forced-colors mode drops the ring.
- `text-success` on `bg-success/15` — use `text-success-fg`.
- Adding `clsx`, `tailwind-merge`, `class-variance-authority`. Concat is
  fine until multiple files need composition.
- shadcn/ui as a dependency.
- Per-app Tailwind config overrides. Tokens go in `theme.css`.
