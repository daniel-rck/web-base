# Worker reference

Cloudflare Worker scaffolding. One Worker per app. The Worker serves the
static SPA bundle (via Workers Assets) and handles any `/api/*` endpoints.

| File | Policy | What it holds |
|---|---|---|
| `worker/base.ts` | owned | `routeRequest()` + `json()`: healthz, the `/api` error boundary, the stale-asset 404, Worker response headers |
| `worker/index.ts` | scaffold | `Env`, the default export, `handleApi()` |
| `wrangler.toml` | scaffold | name, compatibility date, assets + SPA mode, bindings |
| `public/_headers` | scaffold | CSP, HSTS, framing, permissions, immutable caching for `/assets/*` |
| `tsconfig.worker.json` | scaffold | strict TS for `worker/**` with the Workers types |

Edit `index.ts`, never `base.ts` — `web-base update` overwrites it.

## worker/index.ts

```typescript
import { json, routeRequest } from "./base.ts";

export interface Env {
  ASSETS: Fetcher;
  // Add bindings here as needed, e.g. for the sync template:
  // SYNC: R2Bucket;
  // SYNC_RATE_LIMIT?: RateLimit;
}

export default {
  fetch: (request, env, ctx) => routeRequest(request, env, ctx, handleApi),
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith("/api/tenants/")) return handleTenants(request, env, ctx);
  return json({ error: "not_found" }, 404);
}
```

What `routeRequest` (in `base.ts`) does:

| Request | Response |
|---|---|
| `/healthz` | `200 { ok: true }` |
| `/api`, `/api/*` | `handleApi(...)`; a throw → `console.error("[api]", message)` + `500 { error: "internal" }` |
| `/assets/*` (only reaches the Worker when no file matched) | `404` — never `index.html` served as JavaScript |
| anything else | `env.ASSETS.fetch(request)` — the SPA fallback |

Every response the Worker generates gets `X-Content-Type-Options: nosniff`
and `Cache-Control: no-store` unless the handler set its own (a `101`
WebSocket upgrade passes through untouched).

## wrangler.toml

```toml
name = "<app-name>"
main = "worker/index.ts"
compatibility_date = "2026-08-31" # today's date when you create the app; >= 2025-04-01

[assets]
directory = "./dist"
binding = "ASSETS"
not_found_handling = "single-page-application"
```

- **`compatibility_date`** must be a real date — a placeholder breaks
  `wrangler dev` and `wrangler deploy --dry-run`. From 2025-04-01 on, a
  navigation that matches no file gets `index.html` without invoking the
  Worker. Raise it per app, in its own PR, with a deploy check.
- **No `compatibility_flags`.** Add `nodejs_compat` only when the worker
  imports a Node built-in (`node:buffer`, `node:crypto`, …).
- **SPA mode** makes reloading `/mieter/123` work. Non-navigation misses
  (`fetch("/api/…")`, a monitor on `/healthz`, a stale `/assets/*.js`) still
  reach the Worker.
- **No `run_worker_first`.** With any patterns there, every path the list
  doesn't match gets the SPA fallback — a stale `/assets/*.js` becomes
  `index.html` with a 200 and a year of immutable caching. The flip side of
  leaving it out: a browser *navigating* to `/api/…` gets `index.html`. Only
  an app that needs that (OAuth callback, download link) adds
  `run_worker_first = ["/api/*"]`.

The build pipeline produces `./dist` via `vite build` (which copies
`public/_headers` into it), then `wrangler deploy` uploads both the worker
code and the assets directory.

## public/_headers

Cloudflare applies `_headers` to static-asset responses — `index.html`, its
SPA fallback, `/assets/*`, icons, the service worker — and never to responses
the Worker generates. The template sets, for `/*`:

```txt
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()
Cross-Origin-Opener-Policy: same-origin
```

and `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`.

The CSP is per app. Widen it deliberately and only as far as needed:

| Need | Change |
|---|---|
| An external API or sync host | add it to `connect-src` |
| Images from another origin | add it to `img-src` |
| Camera (QR scanner) | `Permissions-Policy: camera=(self)` |
| An inline `<script>` | don't — move it to a file in `public/` (as `theme-init.js` does) |

`script-src 'self'` works because `theme-init.js`, Vite's module scripts and
vite-plugin-pwa's `registerSW.js` are same-origin files. React `style` props
go through the CSSOM, which `style-src` doesn't restrict. Don't add
`upgrade-insecure-requests`: it breaks `wrangler dev` on `http://localhost`.

## Bindings (R2, rate limiting, KV)

The `sync` template needs one R2 bucket and, optionally, a Rate Limiting
binding. It uses no KV namespace.

```toml
[[r2_buckets]]
binding = "SYNC"
bucket_name = "<app-name>-sync"

# Optional: limits requests per sync object (never per IP).
[[ratelimits]]
name = "SYNC_RATE_LIMIT"
namespace_id = "1001"   # any positive integer, unique within the account

[ratelimits.simple]
limit = 60
period = 60             # seconds; must be 10 or 60
```

Route `/api/sync/*` to `handleSync(request, env)` from `worker/sync.ts`, and
set `"allowImportingTsExtensions": true` in `tsconfig.worker.json` (the sync
worker files import each other with `.ts` extensions). Other features may bind
KV under `[[kv_namespaces]]` as usual.

Add the binding fields to the `Env` interface in `worker/index.ts` so
they're typed at the call site.

## Local development

```bash
bun run worker:dev   # wrangler dev
```

Wrangler proxies `/api/*` to your local handler and serves `./dist` for
static routes. Run `bun run build` first so `./dist` exists.

## Deployment

We use **Cloudflare Workers Builds** with Git integration: pushing to
`main` triggers a build + deploy from the dashboard. CI's job is to gate
the PR, not to deploy. There's no `wrangler deploy` step in CI.

If you want to deploy locally:

```bash
bun run worker:deploy
```

## Patterns

- **`handleApi(request, env, ctx)`** is a small switch over the URL path.
  When it grows past ~50 lines, split into per-route handlers in
  `worker/api/<route>.ts`.
- **JSON responses.** Use `json(data, status)` from `./base.ts` rather than
  hand-writing `Content-Type`.
- **Error shapes.** `json({ error: "<code>" }, 400)` with a stable lowercase
  error code. Don't leak internal messages. Unexpected errors can simply
  throw — `routeRequest` logs the message and answers `500 { error: "internal" }`.
- **Logging.** Worker `console.log` ends up in Workers logs. Avoid logging
  request bodies (DSGVO).
- **Headers.** A handler that sets its own `Cache-Control` (e.g. a cacheable
  public resource) keeps it; everything else gets `no-store`.

## Anti-patterns

- One Worker shared across apps. Not done. Each app's Worker is its own
  thing.
- Reading `request.body` twice. Use `request.clone()` if you need to.
- Hand-rolling static file serving. Use `env.ASSETS.fetch(request)`.
- Editing `worker/base.ts`. It is owned; route in `handleApi` instead.
- `nodejs_compat` "just in case". It changes the runtime; add it only for a
  Node built-in the worker actually imports.
- Security headers on Worker responses via `_headers`. They don't apply there.
