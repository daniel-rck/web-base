/**
 * `fetch` fakes for the sync client. Every request is recorded so tests can
 * assert on URLs and headers (e.g. that the secret never leaves the device).
 * Both fakes honour `init.signal` the way real `fetch` does: an abort rejects
 * the pending promise with `signal.reason`.
 */

export type RecordedRequest = {
  url: string;
  method: string;
  /** Lower-cased header names, as `Headers` normalizes them. */
  headers: Record<string, string>;
  body: string | null;
};

export type Responder = (request: RecordedRequest) => Response | Promise<Response>;

export type FakeFetch = {
  fetch: typeof fetch;
  requests: RecordedRequest[];
};

/** Answers the n-th request with the n-th responder; a surplus request rejects. */
export function scriptedFetch(...responders: Responder[]): FakeFetch {
  const requests: RecordedRequest[] = [];
  const queue = [...responders];
  const fake = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const request = record(input, init);
    requests.push(request);
    const responder = queue.shift();
    if (!responder) {
      return Promise.reject(new Error(`unexpected request: ${request.method} ${request.url}`));
    }
    return abortable(init.signal, () => responder(request));
  };
  return { fetch: fake, requests };
}

/**
 * Routes requests into a Worker-style handler, adding the `content-length` a
 * real client would send. Relative URLs resolve against `base`.
 */
export function handlerFetch(
  handler: (request: Request) => Promise<Response>,
  base = "https://app.test",
): FakeFetch {
  const requests: RecordedRequest[] = [];
  const fake = (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const recorded = record(input, init);
    requests.push(recorded);
    const headers = new Headers(init.headers);
    if (recorded.body !== null) {
      headers.set("content-length", String(new TextEncoder().encode(recorded.body).byteLength));
    }
    const request = new Request(new URL(recorded.url, base), {
      method: recorded.method,
      headers,
      body: recorded.body,
    });
    return abortable(init.signal, () => handler(request));
  };
  return { fetch: fake, requests };
}

/** A reply with optional JSON-ish body and headers. */
export function reply(
  status: number,
  options: { body?: string; headers?: Record<string, string> } = {},
): Responder {
  return () => new Response(options.body ?? null, { status, headers: options.headers });
}

/** What `fetch` does when the network is down: reject with a `TypeError`. */
export function networkError(): Responder {
  return () => Promise.reject(new TypeError("Failed to fetch"));
}

/** A server that never answers; only an abort settles the request. */
export function hang(): Responder {
  return () => new Promise<Response>(() => {});
}

function record(input: RequestInfo | URL, init: RequestInit): RecordedRequest {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const body = typeof init.body === "string" ? init.body : null;
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  return { url, method: init.method ?? "GET", headers, body };
}

function abortable(
  signal: AbortSignal | null | undefined,
  run: () => Response | Promise<Response>,
): Promise<Response> {
  if (signal?.aborted) return Promise.reject(abortReason(signal));
  return new Promise<Response>((resolve, reject) => {
    signal?.addEventListener("abort", () => reject(abortReason(signal)), { once: true });
    Promise.resolve().then(run).then(resolve, reject);
  });
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}
