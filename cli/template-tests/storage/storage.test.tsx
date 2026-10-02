import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { type DBSchema, deleteDB, openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDB } from "../../lib/db/db.ts";
import { clearStores, mutationChannel, notifyMutation } from "../../lib/db/mutations.ts";
import { createDBOpener } from "../../lib/db/open.ts";
import { useLiveQuery } from "../../lib/db/useLiveQuery.ts";

interface TestSchema extends DBSchema {
  tenants: { key: string; value: { id: string; name: string } };
}

const one = async () => 1;
let dbCounter = 0;
function tenantsOpener(onVersionChange?: () => void) {
  const name = `test-${++dbCounter}`;
  return {
    name,
    getDB: createDBOpener<TestSchema>({
      name,
      version: 1,
      upgrade(db, oldVersion) {
        if (oldVersion < 1) db.createObjectStore("tenants", { keyPath: "id" });
      },
      onVersionChange,
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createDBOpener", () => {
  it("caches one connection", async () => {
    const { getDB: open } = tenantsOpener();
    const [a, b] = await Promise.all([open(), open()]);
    expect(a).toBe(b);
    expect(await open()).toBe(a);
    a.close();
  });

  it("retries after a failed open instead of caching the rejection", async () => {
    const name = `test-${++dbCounter}`;
    (await openDB(name, 2)).close();
    const open = createDBOpener<unknown>({ name, version: 1, upgrade: undefined });
    await expect(open()).rejects.toMatchObject({ name: "VersionError" });
    await deleteDB(name);
    const db = await open();
    expect(db.version).toBe(1);
    db.close();
  });

  it("closes on a newer version elsewhere, so that upgrade isn't blocked", async () => {
    const onVersionChange = vi.fn<() => void>();
    const { name, getDB: open } = tenantsOpener(onVersionChange);
    await open();
    const blocked = vi.fn<() => void>();
    const newer = await openDB(name, 2, { blocked });
    expect(newer.version).toBe(2);
    expect(blocked).not.toHaveBeenCalled();
    expect(onVersionChange).toHaveBeenCalledTimes(1);
    // The old code can't use the new schema: it fails, and keeps retrying.
    await expect(open()).rejects.toMatchObject({ name: "VersionError" });
    await expect(open()).rejects.toMatchObject({ name: "VersionError" });
    newer.close();
  });

  it("reloads by default when no onVersionChange is given", async () => {
    const { name, getDB: open } = tenantsOpener();
    const reload = vi.fn<() => void>();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload });
    await open();
    (await openDB(name, 2)).close();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("mutations", () => {
  it("names channels db:<store>", () => {
    expect(mutationChannel("tenants")).toBe("db:tenants");
    expect(mutationChannel("*")).toBe("db:*");
  });

  it("delivers notifyMutation although the sender closes right away", async () => {
    const listener = new BroadcastChannel("db:tenants");
    const got = new Promise((resolve) => listener.addEventListener("message", resolve));
    notifyMutation("tenants");
    await expect(got).resolves.toBeDefined();
    listener.close();
  });

  it("clearStores empties every store and notifies '*'", async () => {
    const { getDB: open } = tenantsOpener();
    const db = await open();
    await db.put("tenants", { id: "1", name: "A" });
    const listener = new BroadcastChannel("db:*");
    const got = new Promise((resolve) => listener.addEventListener("message", resolve));
    await clearStores(db);
    expect(await db.count("tenants")).toBe(0);
    await expect(got).resolves.toBeDefined();
    listener.close();
    db.close();
  });

  it("clearAll on the scaffold db.ts (no stores yet) is a no-op", async () => {
    await expect(clearAll()).resolves.toBeUndefined();
    expect((await getDB()).objectStoreNames.length).toBe(0);
  });
});

describe("useLiveQuery", () => {
  const { getDB: open } = tenantsOpener();

  beforeEach(async () => {
    await clearStores(await open());
  });

  function TenantList() {
    const { data, loading } = useLiveQuery("tenants", async () => (await open()).getAll("tenants"));
    if (loading) return <p>Lädt…</p>;
    return (
      <ul>
        {data?.map((t) => (
          <li key={t.id}>{t.name}</li>
        ))}
      </ul>
    );
  }

  it("re-runs after notifyMutation", async () => {
    render(<TenantList />);
    expect(screen.getByText("Lädt…")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Lädt…")).not.toBeInTheDocument());
    await (await open()).put("tenants", { id: "1", name: "Erika Mustermann" });
    notifyMutation("tenants");
    expect(await screen.findByText("Erika Mustermann")).toBeInTheDocument();
  });

  it("returns LOADING, not the previous key's data, when deps change", async () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useLiveQuery("tenants", async () => `data-${id}`, [id]),
      { initialProps: { id: "a" } },
    );
    await waitFor(() => expect(result.current.data).toBe("data-a"));
    rerender({ id: "b" });
    expect(result.current).toEqual({ data: undefined, loading: true, error: undefined });
    await waitFor(() => expect(result.current.data).toBe("data-b"));
  });

  it("keeps the last good data on error and normalizes non-Error throws", async () => {
    let fail = false;
    const { result } = renderHook(() =>
      useLiveQuery("tenants", async () => {
        if (fail) throw "kaputt";
        return 42;
      }),
    );
    await waitFor(() => expect(result.current.data).toBe(42));
    fail = true;
    act(() => notifyMutation("tenants"));
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
    expect(result.current).toMatchObject({ data: 42, loading: false });
    expect(result.current.error?.message).toBe("kaputt");
  });

  it("keeps the result object's identity across renders", async () => {
    const { result, rerender } = renderHook(() => useLiveQuery("tenants", one));
    expect(result.current.loading).toBe(true);
    const loading = result.current;
    rerender();
    expect(result.current).toBe(loading);
    await waitFor(() => expect(result.current.data).toBe(1));
    const settled = result.current;
    rerender();
    expect(result.current).toBe(settled);
  });

  it("latest wins: a slow earlier run can't overwrite a newer one", async () => {
    const runs: ReturnType<typeof deferred<string>>[] = [];
    const { result } = renderHook(() =>
      useLiveQuery("tenants", () => {
        const d = deferred<string>();
        runs.push(d);
        return d.promise;
      }),
    );
    await waitFor(() => expect(runs).toHaveLength(1));
    act(() => notifyMutation("tenants"));
    await waitFor(() => expect(runs).toHaveLength(2));
    await act(async () => runs[1]?.resolve("new"));
    await act(async () => runs[0]?.resolve("old"));
    expect(result.current.data).toBe("new");
  });

  it("runs once per mutation when the store name is '*'", async () => {
    const query = vi.fn<() => Promise<number>>(async () => 1);
    renderHook(() => useLiveQuery("*", query));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(1));
    act(() => notifyMutation("*"));
    await waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(query).toHaveBeenCalledTimes(2);
  });
});
