import { describe, expect, it } from "vitest";
import { readEnvelope, statusError } from "../../templates/sync/client/http.ts";

const response = (status: number, headers: Record<string, string> = {}) => ({
  status,
  headers: new Headers(headers),
  text: "",
});

describe("statusError", () => {
  it("maps HTTP statuses to stable codes", () => {
    const table: [number, string][] = [
      [400, "bad_request"],
      [401, "unauthorized"],
      [403, "forbidden"],
      [404, "not_found"],
      [405, "bad_request"],
      [409, "conflict"],
      [412, "conflict"],
      [413, "too_large"],
      [428, "bad_request"],
      [429, "rate_limited"],
      [500, "server_error"],
      [503, "server_error"],
      [302, "bad_response"],
    ];
    const mapped = table.map(([status]) => [status, statusError(response(status)).code]);
    expect(mapped).toEqual(table);
    expect(statusError(response(418)).status).toBe(418);
  });

  it("reads Retry-After as seconds or as an HTTP date", () => {
    expect(statusError(response(429, { "retry-after": "17" })).retryAfter).toBe(17);
    const date = new Date(Date.now() + 30_000).toUTCString();
    const seconds = statusError(response(429, { "retry-after": date })).retryAfter ?? 0;
    expect(seconds).toBeGreaterThan(25);
    expect(seconds).toBeLessThanOrEqual(30);
    expect(statusError(response(429, { "retry-after": "soon" })).retryAfter).toBeUndefined();
    expect(statusError(response(503, { "retry-after": "5" })).retryAfter).toBeUndefined();
  });

  it("uses German messages", () => {
    expect(statusError(response(429)).message).toBe("Zu viele Anfragen. Bitte warte einen Moment.");
  });
});

describe("readEnvelope", () => {
  const iv = "A".repeat(16);
  const ct = "B".repeat(22);

  it("accepts a well-formed v2 envelope and drops extra fields", () => {
    expect(readEnvelope(JSON.stringify({ v: 2, iv, ct, extra: 1 }))).toEqual({ v: 2, iv, ct });
  });

  it("rejects anything else", () => {
    const bad = ["", "null", "[]", '"x"', JSON.stringify({ iv, ct })];
    bad.push(JSON.stringify({ v: 2, iv: `${iv}=`, ct }), JSON.stringify({ v: 2, iv, ct: "short" }));
    const codes = bad.map((text) => {
      try {
        readEnvelope(text);
        return "accepted";
      } catch (error) {
        return (error as { code?: string }).code;
      }
    });
    expect(codes).toEqual(bad.map(() => "bad_response"));
    expect(() => readEnvelope(JSON.stringify({ v: 3, iv, ct }))).toThrow(
      expect.objectContaining({ code: "unsupported_version" }),
    );
  });
});
