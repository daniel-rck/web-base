import { useCallback, useEffect, useState } from "react";

export type StorageStatus = {
  /** Whether the browser promised not to evict the data; undefined if unknown. */
  persisted: boolean | undefined;
  usage: number | undefined;
  quota: number | undefined;
};

export async function getStorageStatus(): Promise<StorageStatus> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  const [persisted, estimate] = await Promise.all([
    storage?.persisted?.().catch(() => undefined),
    storage?.estimate?.().catch(() => undefined),
  ]);
  return { persisted, usage: estimate?.usage, quota: estimate?.quota };
}

/**
 * Ask the browser to keep the data even under storage pressure. Not done
 * automatically: Firefox shows a permission prompt, which belongs behind a
 * button the user pressed.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

const UNITS = ["Bytes", "kB", "MB", "GB", "TB"];

/** `1234567` → „1,2 MB" (decimal units, de-DE). */
export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 ? 0 : 1;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: digits }).format(value)} ${UNITS[unit]}`;
}

export function useStorageStatus(): { status: StorageStatus | undefined; refresh: () => void } {
  const [status, setStatus] = useState<StorageStatus>();
  const refresh = useCallback(() => {
    void getStorageStatus().then(setStatus);
  }, []);
  useEffect(refresh, [refresh]);
  return { status, refresh };
}
