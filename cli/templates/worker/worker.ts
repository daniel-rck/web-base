import { json, routeRequest } from "./base.ts";

export interface Env {
  ASSETS: Fetcher;
  // Add bindings here, matching wrangler.toml.
}

export default {
  fetch: (request, env, ctx) => routeRequest(request, env, ctx, handleApi),
} satisfies ExportedHandler<Env>;

/**
 * Everything under `/api`. Route per feature and keep each handler in its own
 * file once it grows (`worker/api/<feature>.ts`), e.g.:
 *
 *   const { pathname } = new URL(request.url);
 *   if (pathname.startsWith("/api/<feature>/")) return handleFeature(request, env, ctx);
 *
 * A throw here becomes a logged 500 `{ error: "internal" }` (see base.ts).
 */
async function handleApi(_request: Request, _env: Env, _ctx: ExecutionContext): Promise<Response> {
  return json({ error: "not_found" }, 404);
}
