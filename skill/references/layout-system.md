# Layout system reference

The shared UI structure across all apps. Structure is identical; only the
color accent in `theme.css` changes per app.

The full spec is in `web-base/docs/specs/04-layout-system.md`. This
reference is the day-to-day terse version.

## Principles

1. Mobile-first. Bottom-nav on `<md`, sidebar on `≥md`.
2. Same shell, different paint. Only `--accent-h` differs per app.
3. Tailwind 4 utility classes + CSS variables via `@theme`. No CSS-in-JS.
4. Custom primitives only. No shadcn/ui, no Radix UI.
5. Dark mode automatic via `prefers-color-scheme`.

## Per-app accent hues

| App | `--accent-h` |
|---|---|
| Hausverwaltung | 250 (Slate-Blau) |
| Tennisturnier | 155 (Emerald) |
| ErinnerMich | 285 (Indigo) |

Change *only* `--accent-h` in `theme.css` to change the app's accent. All
accent shades derive from it via OKLCH on the same hue.

## Components

All exported from `src/lib/ui/index.ts`.

### `AppShell`

```typescript
type AppShellProps = {
  title: string;
  logo?: ReactNode;
  navItems: NavItem[];
  headerActions?: ReactNode;
  children: ReactNode;
};
```

Wraps the whole app. Sticky header (h-14), responsive sidebar/bottom-nav,
container-constrained main content.

### `AppHeader`

```typescript
type AppHeaderProps = {
  title: string;
  logo?: ReactNode;
  actions?: ReactNode;
};
```

Sticky, h-14, backdrop-blur, container max-w-4xl.

### `AppNav`

```typescript
type NavItem = { to: string; label: string; icon: ReactNode };
type AppNavProps = { items: NavItem[]; variant: "sidebar" | "bottom" };
```

Renders as sidebar on `≥md`, bottom-bar on `<md`. Active state uses
`bg-accent-100 text-accent-700` (sidebar) or `text-accent-600` (bottom).

### `PageHeader`

```typescript
type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};
```

Section header inside a page. Title is `text-2xl font-semibold`.

### `InstallButton` + `useInstallPrompt`

`src/lib/ui/InstallButton.tsx` is auto-mounted by `AppShell` in the
header's right slot. It self-hides when the app is already running
standalone or when the browser hasn't fired `beforeinstallprompt`
(non-iOS). On iOS Safari it always shows (until standalone) and opens
a `<dialog>` with German „Zum Home-Bildschirm" instructions, since
iOS has no programmatic install prompt.

`useInstallPrompt()` is exported for custom install UIs:

```typescript
type UseInstallPromptResult = {
  canInstall: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
};
```

### Primitives

Exported from `src/lib/ui/primitives.tsx`:

- `Card` — `<div class="rounded-lg border border-border bg-surface p-4
  shadow-sm">`, forwards ref.
- `EmptyState` — centered icon + title + description + optional CTA.
- `Spinner` — animated SVG, sizes `sm | md | lg`, accent-colored.
- `Badge` — pill, variants `neutral | accent | success | warning | danger`.
- `Button` — variants `primary | secondary | ghost | danger`, sizes
  `sm | md | lg`, forwards ref.

All primitives:
- Accept and merge `className` (simple concat, no `clsx` dep).
- Forward refs where applicable.
- Carry descriptive `aria-*` attributes for screen readers.

## Per-app customization

After `web-base add layout`, the only file you should edit in `src/lib/ui/`
is `theme.css`, and within that primarily the `--accent-h` value.
Everything else stays untouched so `web-base update layout` works cleanly.

If an app needs structural changes (e.g. a floating action button), add it
to **this reference and the template at once**, not as a per-app edit.

## Anti-patterns

- Hard-coding accent colors like `bg-blue-500`. Use `bg-accent-500` only.
- Adding `clsx`, `tailwind-merge`, `class-variance-authority`. Concat is
  fine until multiple files need composition.
- shadcn/ui as a dependency.
- Per-app Tailwind config overrides. Tokens go in `theme.css`.
