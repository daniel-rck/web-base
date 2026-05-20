# 05 — Claude Code Skill

The skill at `skill/` documents the conventions for these web apps. It's a
Claude Code skill (Markdown frontmatter + body), referenced by the apps via
symlink or by a global Claude config.

## File layout

```
skill/
├── SKILL.md
└── references/
    ├── tech-stack.md
    ├── layout-system.md
    ├── storage.md
    ├── pwa.md
    ├── worker.md
    ├── sync.md
    ├── ci.md
    └── repo-hygiene.md
```

`SKILL.md` is loaded into Claude's context when the skill triggers. References
are loaded on demand when SKILL.md instructs Claude to read them.

## SKILL.md frontmatter

The `description` field is the trigger. It must be specific enough to fire on
work in these web app repos but broad enough to catch related tasks. Pushy
phrasing per the skill-creator guidelines.

```yaml
---
name: daniel-rck-web-app
description: Conventions and patterns for the personal web apps under daniel-rck (Hausverwaltung, Tennisturnier, ErinnerMich, and future apps). Stack is React 19 + Vite 8 + Tailwind 4 + TypeScript 6 + Bun + Cloudflare Workers + idb + injectManifest PWA + react-router-dom 7 + Biome. Use this skill whenever working in any of these repos, scaffolding a new app in the same style, migrating an existing app to the shared baseline, or whenever the user mentions "my web apps", "Hausverwaltung", "Tennisturnier", "ErinnerMich", or similar personal browser-based PWAs. Also use whenever the @daniel-rck/web-base CLI is mentioned or when copy-pasting shared layout, storage, PWA, worker, or sync code between these repos.
---
```

## SKILL.md body

The body has these sections, in order:

### `# daniel-rck Web App Conventions`

One-paragraph statement of purpose.

### `## The apps in scope`

A table of the three apps with their URL and one-line description.

### `## The baseline stack`

A bulleted summary of the stack. Names only — no version pins (those live in
`references/tech-stack.md` so they can be updated without touching the body).

### `## The CLI`

Brief description of `@daniel-rck/web-base` plus the most common commands as a
code block. Explicitly states: "When working in any of these web app repos,
prefer running the CLI over hand-copying snippets. The CLI is the source of
truth; this skill documents the why and when."

### `## Architecture invariants`

Numbered list of hard rules:

1. Lokal-first (no account, no email, no third-party telemetry)
2. DSGVO-konform (client-side encryption for any sync)
3. German UI + README, English source code
4. MIT license
5. One web app, one Cloudflare Worker
6. Specs live in `docs/specs/`

### `## When to consult which reference`

A table mapping topics to reference files:

| Working on… | Reference |
|---|---|
| Dependency versions, package.json template, biome config | `tech-stack.md` |
| AppShell, design tokens, per-app accent | `layout-system.md` |
| idb patterns, useLiveQuery, migration recipes | `storage.md` |
| injectManifest, sw.ts skeleton, Workbox precache | `pwa.md` |
| /api/* routing, R2/KV bindings, wrangler local dev | `worker.md` |
| Hausverwaltung sync architecture | `sync.md` |
| Reusable workflow caller pattern | `ci.md` |
| LICENSE, CONTRIBUTING, SECURITY, package.json metadata | `repo-hygiene.md` |

The body says explicitly: "Don't read all references upfront. Pick what's
relevant to the current task."

### `## Anti-patterns`

A list of rejected approaches with one-line rationale each:

- ESLint + Prettier → Biome (one tool, faster)
- Dexie → idb (lighter, less magic)
- localStorage for app data → idb (only settings in localStorage)
- generateSW → injectManifest (custom message handlers needed)
- Skipping react-router → always include it (cheap to add, painful to retrofit)
- Per-repo CI duplication → reusable workflow from web-base
- Starter template repo for existing apps → the CLI handles updates too

### `## When this skill is wrong`

Closing section noting that explicit deviations are fine but must be documented
in the app's `docs/specs/`.

## Reference files: content guidance

Each reference is a complete description of its topic, not a tutorial. Code
examples are normative. References stay aligned with the matching CLI template
under `cli/templates/<name>/`.

### `references/tech-stack.md`

- Exact version pins for production deps and devDeps
- The full `package.json` template (with `<placeholders>`)
- The `biome.json` content (matches `cli/templates/biome/biome.json`)
- The `tsconfig.app.json` content (strict, `noUncheckedIndexedAccess`)
- The `vite.config.ts` skeleton with VitePWA injectManifest config

### `references/layout-system.md`

Mirrors `docs/specs/04-layout-system.md`. The skill reference is more terse —
it shows the imports and the prop interface for each component, plus the
theme.css. The full spec is for implementers; the skill reference is for
people *using* the layout day-to-day.

### `references/storage.md`

- The idb opening pattern (`openDB<AppSchema>`, schema interface)
- The `useLiveQuery` hook signature and usage example
- Migration recipes:
  - From Dexie: how to map Dexie tables to idb stores, how `dexie-react-hooks` maps to `useLiveQuery`
  - From localStorage: when to move data to idb, when to leave it in localStorage (settings only)
- Indexing patterns: when to add an `index`, how to query by it

### `references/pwa.md`

- The `vite.config.ts` injectManifest block
- The sw.ts skeleton (precache, activate, claim clients, optional message handler stub)
- How to add notification handlers (for ErinnerMich)
- How to add background sync (for Hausverwaltung if it ever needs it)
- The `tsconfig.sw.json` separate config (lib: WebWorker)

### `references/worker.md`

- The `worker/index.ts` routing pattern
- How `__STATIC_CONTENT_MANIFEST` works in Workers Assets
- R2 and KV binding conventions (`SYNC` for R2, `SYNC_KV` for KV, etc.)
- Local dev with `wrangler dev`
- Deployment via Workers Builds (Git integration in the Cloudflare dashboard)

### `references/sync.md`

The full Hausverwaltung-style sync architecture:
- R2 object layout
- AES-GCM key derivation (HKDF-SHA256 from device secret)
- Pairing protocol (6-digit OTP, KV slot, AES-GCM wrap of secret)
- Conflict resolution (R2 ETag with If-Match / If-None-Match, automatic merge)
- Rate limiting (KV token buckets, the specific limits documented in `03-templates.md`)
- DSGVO compliance: server never sees plaintext, no user account, no email

### `references/ci.md`

- The reusable workflow's inputs (`bun-version`, `run-tests`, `run-build`)
- The caller pattern (one-screen `.github/workflows/ci.yml`)
- How to extend with additional jobs (e.g. deploy)
- How to pin to a tag vs `@main`

### `references/repo-hygiene.md`

- The LICENSE text (MIT, year placeholder)
- The CONTRIBUTING.md template with branch strategy + PR checklist
- The SECURITY.md template (GitHub Security Advisories path)
- The package.json metadata fields (keywords, author, repository, bugs, homepage, packageManager)

## Distribution

The skill is installed manually. Recommended approaches:

1. **Symlink** from `~/.config/claude/skills/daniel-rck-web-app` to
   `<cloned-web-base>/skill/`. Updates are immediate.
2. **Copy** the `skill/` directory into the Claude config dir. Updates require
   re-copying — fine for stable phases.
3. **Future: bundled with the CLI.** A `web-base install-skill` command could
   write the skill to the appropriate path. Defer until the skill is stable.

## Maintenance

When a convention changes:
1. Update the CLI template in the same PR
2. Update the matching skill reference in the same PR
3. If the change affects the body (a new section, an anti-pattern), update
   SKILL.md too

The CI for this repo runs a lint check that fails if `cli/templates/<name>/`
exists but `skill/references/<name>.md` doesn't (or vice versa). This is one
job in `tools-ci.yml` — see `06-workflows.md`.
