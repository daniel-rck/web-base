import { afterEach, describe, expect, it, vi } from "vitest";
import { guardStorage, safeLocalStorage, SyncStore } from "../../templates/sync/client/storage.ts";
import type { SyncState } from "../../templates/sync/client/types.ts";
import { memoryStorage, throwingStorage } from "./fakes/storage.ts";

const KEY = "web-base-sync";
const STATE: SyncState = {
  v: 2,
  code: "080020G30G2GC1R81450P30D1R7WVC8",
  etag: '"abc"',
  fp: "fingerprint",
};
const unavailable = { name: "SyncError", code: "storage_unavailable" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SyncStore", () => {
  it("round-trips a v2 state", () => {
    const store = new SyncStore(memoryStorage(), KEY);
    store.save(STATE);
    expect(store.load()).toEqual(STATE);
    store.setVersion(STATE.code, null, null);
    expect(store.require()).toEqual({ ...STATE, etag: null, fp: null });
    store.clear();
    expect(store.load()).toBeNull();
  });

  it("throws not_enabled from require() when nothing is stored", () => {
    const store = new SyncStore(memoryStorage(), KEY);
    expect(store.load()).toBeNull();
    expect(() => store.require()).toThrow(expect.objectContaining({ code: "not_enabled" }));
  });

  it("ignores a version for a secret that is no longer stored", () => {
    const store = new SyncStore(memoryStorage(), KEY);
    store.save(STATE);
    store.setVersion("some-other-code", '"stale"', "other");
    expect(store.load()).toEqual(STATE);
  });

  it("reads a state without a fingerprint as fp: null (never trusted for a 304)", () => {
    const { fp: _fp, ...legacy } = STATE;
    const store = new SyncStore(memoryStorage({ [KEY]: JSON.stringify(legacy) }), KEY);
    expect(store.load()).toEqual({ ...STATE, fp: null });
  });

  it("clears corrupt JSON", () => {
    const raw = memoryStorage({ [KEY]: "{not json" });
    expect(new SyncStore(raw, KEY).load()).toBeNull();
    expect(raw.data.has(KEY)).toBe(false);
  });

  it("clears v1 and malformed states", () => {
    const shapes = [
      { deviceSecret: "00".repeat(32), etag: null },
      { ...STATE, v: 1 },
      { ...STATE, code: "too-short" },
      { ...STATE, code: 42 },
      { ...STATE, etag: 7 },
      { ...STATE, fp: 7 },
      null,
      [],
      "string",
    ];
    const left = shapes.map((shape) => {
      const raw = memoryStorage({ [KEY]: JSON.stringify(shape) });
      return [new SyncStore(raw, KEY).load(), raw.data.size];
    });
    expect(left).toEqual(shapes.map(() => [null, 0]));
  });
});

describe("guarded storage", () => {
  it("reads null when getItem throws", () => {
    expect(new SyncStore(throwingStorage(), KEY).load()).toBeNull();
    expect(guardStorage(throwingStorage()).getItem(KEY)).toBeNull();
  });

  it("fails writes with storage_unavailable", () => {
    const store = new SyncStore(throwingStorage({ read: false }), KEY);
    expect(() => store.save(STATE)).toThrow(expect.objectContaining(unavailable));
    expect(() => store.clear()).toThrow(expect.objectContaining(unavailable));
  });

  it("safeLocalStorage survives a missing or hostile localStorage", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(safeLocalStorage().getItem(KEY)).toBeNull();
    expect(() => safeLocalStorage().setItem(KEY, "x")).toThrow(
      expect.objectContaining(unavailable),
    );
    vi.stubGlobal("localStorage", throwingStorage());
    expect(new SyncStore(safeLocalStorage(), KEY).load()).toBeNull();
  });

  it("safeLocalStorage uses the real localStorage when it works", () => {
    const backing = memoryStorage();
    vi.stubGlobal("localStorage", backing);
    new SyncStore(safeLocalStorage(), KEY).save(STATE);
    expect(backing.data.get(KEY)).toBe(JSON.stringify(STATE));
    expect(new SyncStore(safeLocalStorage(), KEY).load()).toEqual(STATE);
  });
});
