/**
 * One HTTP round trip with a deadline, and the mapping from transport and
 * status failures to `SyncError` codes.
 */
import { SyncError, type SyncErrorCode } from "./errors.ts";
import type { SyncEnvelope } from "./types.ts";

export type SendOptions = {
  fetch: typeof fetch;
  method: "GET" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  signal?: AbortSignal;
};

/** A response read in full, so the timeout covers the body too. */
export type SyncResponse = { status: number; headers: Headers; text: string };

export async function send(url: string, options: SendOptions): Promise<SyncResponse> {
  const external = options.signal;
  if (external?.aborted) throw new SyncError("aborted", { cause: external.reason });
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new DOMException("Sync request timed out.", "TimeoutError")),
    options.timeoutMs,
  );
  const { signal, dispose } = anySignal(deadline.signal, external);
  try {
    const response = await options.fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal,
      cache: "no-store",
    });
    const text = await response.text();
    return { status: response.status, headers: response.headers, text };
  } catch (cause) {
    if (external?.aborted) throw new SyncError("aborted", { cause });
    if (deadline.signal.aborted) throw new SyncError("timeout", { cause });
    // fetch rejects with a TypeError for DNS, TLS, CORS and connection failures.
    throw new SyncError("offline", { cause });
  } finally {
    clearTimeout(timer);
    dispose();
  }
}

/** `AbortSignal.any`, with a listener-based fallback for Safari < 17.4. */
function anySignal(
  deadline: AbortSignal,
  external: AbortSignal | undefined,
): { signal: AbortSignal; dispose(): void } {
  if (!external) return { signal: deadline, dispose: () => {} };
  if (typeof AbortSignal.any === "function") {
    return { signal: AbortSignal.any([deadline, external]), dispose: () => {} };
  }
  const both = new AbortController();
  const onDeadline = () => both.abort(deadline.reason);
  const onExternal = () => both.abort(external.reason);
  deadline.addEventListener("abort", onDeadline, { once: true });
  external.addEventListener("abort", onExternal, { once: true });
  return {
    signal: both.signal,
    dispose: () => {
      deadline.removeEventListener("abort", onDeadline);
      external.removeEventListener("abort", onExternal);
    },
  };
}

export function statusError(response: SyncResponse): SyncError {
  const { status } = response;
  const retryAfter =
    status === 429 ? parseRetryAfter(response.headers.get("retry-after")) : undefined;
  return new SyncError(statusCode(status), { status, retryAfter });
}

function statusCode(status: number): SyncErrorCode {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409 || status === 412) return "conflict";
  if (status === 413) return "too_large";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return status >= 400 ? "bad_request" : "bad_response";
}

/** Seconds from a `Retry-After` header (delta-seconds or an HTTP date). */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

/** The `ETag` a successful response must carry, or `bad_response`. */
export function requireEtag(response: SyncResponse): string {
  const etag = response.headers.get("etag");
  if (!etag) throw new SyncError("bad_response", { status: response.status });
  return etag;
}

const IV = /^[\w-]{16}$/;
const CT = /^[\w-]{22,}$/;

/** Parse and shape-check an envelope; the content is checked by `open()`. */
export function readEnvelope(text: string): SyncEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (cause) {
    throw new SyncError("bad_response", { cause });
  }
  if (typeof value !== "object" || value === null) throw new SyncError("bad_response");
  const { v, iv, ct } = value as Record<string, unknown>;
  if (typeof v !== "number") throw new SyncError("bad_response");
  if (v !== 2) throw new SyncError("unsupported_version");
  if (typeof iv !== "string" || !IV.test(iv) || typeof ct !== "string" || !CT.test(ct)) {
    throw new SyncError("bad_response");
  }
  return { v: 2, iv, ct };
}
