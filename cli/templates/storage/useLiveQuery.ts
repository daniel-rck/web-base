import { useEffect, useEffectEvent, useState } from "react";
import { mutationChannel } from "./mutations.ts";

export type LiveQueryResult<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
};

const LOADING: LiveQueryResult<never> = Object.freeze({
  data: undefined,
  loading: true,
  error: undefined,
});

type Settled<T> = { key: readonly unknown[]; result: LiveQueryResult<T> };

/**
 * Reactive IndexedDB query. Runs `query` on mount, whenever `storeName` or
 * `deps` change, and whenever `notifyMutation(storeName)` or
 * `notifyMutation("*")` fires — in this tab or another one.
 *
 * - Until the first run for the current `[storeName, ...deps]` settles, the
 *   result is `{ loading: true, data: undefined }`, never the previous key's
 *   data. Re-runs after a mutation keep the current data until the new arrives.
 * - A failed run keeps the last good data for the same key and sets `error`.
 * - The returned object keeps its identity until the result changes.
 */
export function useLiveQuery<T>(
  storeName: string,
  query: () => Promise<T>,
  deps: unknown[] = [],
): LiveQueryResult<T> {
  const key = [storeName, ...deps];
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  // Always the newest `query`, without re-subscribing on every render.
  const runQuery = useEffectEvent(() => query());

  useEffect(() => {
    let cancelled = false;
    // Latest-wins. A mutation can start a run while an earlier one is still
    // awaiting, and IndexedDB doesn't order them — without this token the
    // slower, older run could resolve last and overwrite fresh data.
    let runToken = 0;

    const run = async () => {
      const token = ++runToken;
      try {
        const data = await runQuery();
        if (cancelled || token !== runToken) return;
        setSettled({ key, result: { data, loading: false, error: undefined } });
      } catch (err) {
        if (cancelled || token !== runToken) return;
        setSettled((prev) => {
          const data = prev && sameKey(prev.key, key) ? prev.result.data : undefined;
          return { key, result: { data, loading: false, error: toError(err) } };
        });
      }
    };

    void run();
    if (typeof BroadcastChannel === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    // Deduped, so a caller passing "*" doesn't run every query twice.
    const names = new Set([mutationChannel(storeName), mutationChannel("*")]);
    const channels = [...names].map((name) => new BroadcastChannel(name));
    const onMutation = () => void run();
    for (const channel of channels) channel.addEventListener("message", onMutation);

    return () => {
      cancelled = true;
      for (const channel of channels) channel.close();
    };
    // oxlint-disable-next-line react/exhaustive-deps -- `deps` is the caller's dependency list, forwarded as-is
  }, [storeName, ...deps]);

  return settled && sameKey(settled.key, key) ? settled.result : LOADING;
}

function sameKey(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err), { cause: err });
}
