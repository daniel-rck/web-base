# Worker reference

Cloudflare Worker scaffolding. One Worker per app. The Worker serves the
static SPA bundle (via Workers Assets) and handles any `/api/*` endpoints.

## worker/index.ts

```typescript
export interface Env {
  ASSETS: Fetcher;
  // Add bindings here as needed:
  // SYNC: R2Bucket;
  // SYNC_KV: KVNamespace;
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

## Bindings (R2, KV)

Sync (or any other R2/KV feature) binds buckets and namespaces:

```toml
[[r2_buckets]]
binding = "SYNC"
bucket_name = "<app-name>-sync"

[[kv_namespaces]]
binding = "SYNC_KV"
id = "<kv-namespace-id>"
```

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
