/**
 * Storage fakes for the sync client. Structural on purpose: they satisfy the
 * template's `StorageLike` (getItem / setItem / removeItem) without importing it.
 */

export type MemoryStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** Everything currently stored, for assertions. */
  readonly data: Map<string, string>;
};

/** An in-memory `localStorage`. Share one instance to simulate a page reload. */
export function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

/**
 * A storage whose calls throw like Safari's private mode or a blocked-cookies
 * policy (`SecurityError` / `QuotaExceededError`). Pick which side fails.
 */
export function throwingStorage(fail: { read?: boolean; write?: boolean } = {}): MemoryStorage {
  const inner = memoryStorage();
  return {
    data: inner.data,
    getItem: (key) => (fail.read === false ? inner.getItem(key) : boom()),
    setItem: (key, value) => (fail.write === false ? inner.setItem(key, value) : boom()),
    removeItem: (key) => (fail.write === false ? inner.removeItem(key) : boom()),
  };
}

function boom(): never {
  throw new DOMException("The operation is insecure.", "SecurityError");
}
