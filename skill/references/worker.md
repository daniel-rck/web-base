# Worker reference

Cloudflare Worker scaffolding. One Worker per app. The Worker serves the
static SPA bundle (via Workers Assets) and handles any `/api/*` endpoints.

## worker/index.ts

```typescript
export interface Env {
  ASSETS: Fetcher;
  // Add bindings here as needed, e.g. for the sync template:
  // SYNC: R2Bucket;
  // SYNC_RATE_LIMIT?: RateLimit;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/healthz") return Response.json({ ok: true });

    if (url.pathname.startsWith("/api/")) return handleApi(request, env, ctx);

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
```

## wrangler.toml

```toml
name = "<app-name>"
main = "worker/index.ts"
compatibility_date = "<today>"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "./dist"
binding = "ASSETS"
```

The build pipeline produces `./dist` via `vite build`, then `wrangler deploy`
uploads both the worker code and the assets directory.

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
- **JSON responses.** Use `Response.json(data, { status })` rather than
  hand-writing `Content-Type`.
- **Error shapes.** `Response.json({ error: "<code>" }, { status: 400 })`
  with a stable lowercase error code. Don't leak internal messages.
- **Logging.** Worker `console.log` ends up in Workers logs. Avoid logging
  request bodies (DSGVO).

## Anti-patterns

- One Worker shared across apps. Not done. Each app's Worker is its own
  thing.
- Reading `request.body` twice. Use `request.clone()` if you need to.
- Hand-rolling static file serving. Use `env.ASSETS.fetch(request)`.
