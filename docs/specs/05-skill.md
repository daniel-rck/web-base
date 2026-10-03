# 05 — Claude Code Skill

The skill at `skill/` documents the conventions for these web apps. It's a
Claude Code skill (Markdown frontmatter + body), installed per user or per
project (see *Distribution*).

## File layout

```
skill/
├── SKILL.md
└── references/
    ├── app.md
    ├── backup.md
    ├── ci.md
    ├── hygiene.md
    ├── layout-system.md
    ├── oxc.md
    ├── pwa.md
    ├── router.md
    ├── storage.md
    ├── sync.md
    ├── tech-stack.md
    ├── testing.md
    └── worker.md
```

`SKILL.md` is loaded into Claude's context when the skill triggers. References
are loaded on demand when SKILL.md instructs Claude to read them. Every
template under `cli/templates/` (except the meta-template `core`) has a
reference named after it (`layout` → `layout-system.md`); `tech-stack.md` and
`ci.md` cover what no single template does. `cli/src/docs/skill.test.ts`
enforces this in both directions, and that the tree above lists exactly the
files on disk.

## SKILL.md frontmatter

The `description` field is the trigger. It must be specific enough to fire on
work in these web app repos but broad enough to catch related tasks. Pushy
phrasing per the skill-creator guidelines. The frontmatter is exactly:

```yaml
name: daniel-rck-web-app
description: Conventions and patterns for the personal web apps under daniel-rck (ErinnerMich, HamsterFlight, Hausverwaltung, Minispiele, Pizzateig, Tankzettel, Tennisturnier, Tonspur, Zeiterfassung, and future apps). Stack is React 19 + Vite 8 + Tailwind 4 + TypeScript 7 + Bun + Cloudflare Workers + idb + injectManifest PWA + react-router-dom 7 + oxlint + oxfmt. Use this skill whenever working in any of these repos, scaffolding a new app in the same style, migrating an existing app to the shared baseline, or whenever the user mentions "my web apps", "Hausverwaltung", "Tennisturnier", "ErinnerMich", "Minispiele", "Tankzettel", "Zeiterfassung", "Pizzateig", "Tonspur", "HamsterFlight", or similar personal browser-based PWAs. Also use whenever the @daniel-rck/web-base CLI is mentioned or when copy-pasting shared layout, storage, PWA, worker, or sync code between these repos.
```

## SKILL.md body

The body has these sections, in order:

### `# daniel-rck Web App Conventions`

One-paragraph statement of purpose.

### `## The apps in scope`

A table of the nine apps with their URL and one-line description, and a note
that HamsterFlight shares only the tooling baseline.

### `## The baseline stack`

A bulleted summary of the stack. Names only — no version pins (those live in
`references/tech-stack.md`, mirroring `cli/templates/pins.json`).

### `## The CLI`

The most common commands, pinned to a release (`#vX.Y.Z`), and the rules a
user of the CLI needs: owned vs scaffold, `update` changes files only (new
dependencies arrive with `add`), `--force` / `--force-scaffold` / `--dry-run`,
`webBase.unmanaged`, `check --strict` (never in HamsterFlight), the exit
codes, and that `check` — not the stamp — is the authority on conformance.
States explicitly: "When working in any of these web app repos, prefer running
the CLI over hand-copying snippets. The CLI is the source of truth; this skill
documents the why and when."

### `## Architecture invariants`

Numbered list of hard rules:

1. Lokal-first (no account, no email, no third-party telemetry)
2. DSGVO-konform (client-side encryption for any sync)
3. German UI + README, English source code
4. MIT license
5. One web app, one Cloudflare Worker
6. Specs live in `docs/specs/`

### `## When to consult which reference`

A table mapping topics to the reference files above. The body says
explicitly: "Don't read all references upfront — pick what's relevant to the
current task."

### `## Anti-patterns`

Rejected approaches with a one-line rationale each (mirroring
`07-conventions.md`).

### `## When this skill is wrong`

Explicit deviations are fine but must be documented in the app's
`docs/specs/`.

## Reference files: content guidance

Each reference is a complete description of its topic, not a tutorial. Code
examples are normative. References stay aligned with the matching CLI template.
An installed skill cannot reach web-base's `docs/specs/`, so references link
to specs by their GitHub URL, never by a bare path.

- `tech-stack.md` — the pins (deep-equal to `pins.json`, guarded), the
  `package.json` template, `tsconfig.app.json`, the vite skeleton.
- `app.md` — what `init` writes and the steps after it.
- `oxc.md` — the shipped oxlint/oxfmt configs and the migration from Biome.
- `hygiene.md` — LICENSE, CONTRIBUTING, SECURITY, `.editorconfig`.
- `layout-system.md` — the terse version of `04-layout-system.md`: components
  and props, tokens, the hue table (guarded against 04), a11y rules.
- `storage.md` — the opener and migration ladder, `useLiveQuery`, writes and
  `notifyMutation`, recipes from Dexie and localStorage.
- `testing.md` — the Vitest setup, fake-indexeddb, the `matchMedia` mock.
- `pwa.md` — the VitePWA block, the service worker split, the update prompt,
  push and background-sync handlers.
- `router.md` — the layout route, the error pages, adding a route.
- `worker.md` — `routeRequest`, SPA mode, `public/_headers`, R2 and
  rate-limit bindings (`SYNC`, `SYNC_RATE_LIMIT`), local dev.
- `backup.md` — `BackupCard`, the file format, restore semantics.
- `sync.md` — protocol v2, pairing, the client API, the threat model.
- `ci.md` — the reusable workflows' inputs, caller pattern, release pinning.

## Distribution

The skill is installed manually:

1. **Symlink** `~/.claude/skills/daniel-rck-web-app` (personal) or an app's
   `.claude/skills/daniel-rck-web-app` (project) to `<cloned-web-base>/skill/`.
   Updates are immediate.
2. **Copy** the `skill/` directory there instead. Updates require re-copying —
   fine for stable phases.

**Decision: no `install-skill` command (yet).** A CLI command that writes the
skill into a Claude config directory would have to track Claude Code's config
layout; a symlink already gives instant updates.

## Maintenance

When a convention changes:
1. Update the CLI template in the same PR
2. Update the matching skill reference in the same PR
3. If the change affects the body (a new section, an anti-pattern), update
   SKILL.md too
