# Testing reference

Vitest with jsdom, Testing Library and fake-indexeddb. Shipped by the
`testing` template, which is part of `core`.

| File | Policy | What it holds |
|---|---|---|
| `vitest.config.ts` | scaffold | merges `vite.config.ts` with the test settings |
| `src/test/setup.ts` | owned | fake IndexedDB, jest-dom matchers, cleanup, a `matchMedia` stub |
| `src/test/environment.test.tsx` | owned | asserts the setup works; keeps `vitest run` non-empty |

Scripts (written by `init`; add them by hand in older apps):

```json
{
  "test": "vitest run",
  "test:watch": "vitest"
}
```

## vitest.config.ts

```typescript
import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
      restoreMocks: true,
    },
  }),
);
```

- Tests go through the app's Vite config, so the React plugin, aliases and
  virtual modules resolve as in the build.
- If `vite.config.ts` exports a function, call it first:
  `mergeConfig(viteConfig({ mode: "test", command: "serve" }), …)`.
- `tsconfig.node.json` must include `vitest.config.ts` next to `vite.config.ts`.
- An app with its own Vitest setup (e.g. projects with
  `@cloudflare/vitest-pool-workers`) keeps it and adds
  `"./src/test/setup.ts"` to `setupFiles`. pool-workers 0.23 still needs
  Vitest 4, so such an app stays behind the Vitest 5 pin; prefer in-memory
  fakes for worker tests in new code.
- App-specific setup goes in its own file, listed after `./src/test/setup.ts`.
  Never edit `setup.ts` — `web-base update` overwrites it.

## What setup.ts provides

| Piece | Why |
|---|---|
| `fake-indexeddb/auto` | jsdom has no IndexedDB. `indexedDB`, `IDBKeyRange` & co. become globals, so `getDB()` and the storage hooks run unmodified. |
| `@testing-library/jest-dom/vitest` | `toBeInTheDocument()`, `toHaveTextContent()`, … on vitest's `expect`, with types. |
| `afterEach(cleanup)` | Testing Library only unmounts by itself when vitest's `globals` is on; it isn't. |
| `matchMedia` stub | jsdom has none, and `useTheme`/`useInstallPrompt` call it. Every query reports `matches: false`. |

**BroadcastChannel needs nothing.** In the jsdom environment the global is
Node's built-in, which delivers between instances — `notifyMutation()` re-runs
`useLiveQuery` in tests exactly as in the browser. Close any channel a test
opens itself (the hook closes its own on unmount, which `cleanup` triggers).

## IndexedDB in tests

The fake database lives in memory, one per test file. `getDB()` caches its
connection across the tests of a file, so reset the data, not the connection:

```typescript
import { beforeEach } from "vitest";
import { clearAll } from "../lib/db/index.ts";

beforeEach(async () => {
  await clearAll();
});
```

## Testing a useLiveQuery component

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearAll, getDB, notifyMutation } from "../../lib/db/index.ts";
import { TenantList } from "./TenantList.tsx";

describe("TenantList", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("shows tenants and follows writes", async () => {
    const db = await getDB();
    await db.put("tenants", { id: "1", name: "Erika Mustermann", createdAt: 0 });
    render(<TenantList />);
    expect(await screen.findByText("Erika Mustermann")).toBeInTheDocument();

    await db.put("tenants", { id: "2", name: "Max Mustermann", createdAt: 0 });
    notifyMutation("tenants");
    expect(await screen.findByText("Max Mustermann")).toBeInTheDocument();
  });

  it("adds a tenant through the button", async () => {
    const user = userEvent.setup();
    const onAdded = vi.fn<(name: string) => void>();
    render(<TenantList onAdded={onAdded} />);
    await user.click(await screen.findByRole("button", { name: "Mieter hinzufügen" }));
    expect(await screen.findByText("Neuer Mieter")).toBeInTheDocument();
    expect(onAdded).toHaveBeenCalledWith("Neuer Mieter");
  });
});
```

- Use `findBy…` (it waits) for anything that appears after a query settles;
  `getBy…` only for what is there synchronously.
- Query by role and German accessible name, as a user would:
  `getByRole("button", { name: "Speichern" })`.
- Prefer `userEvent.setup()` over `fireEvent` — it types and clicks like a
  user, focus and keyboard included.

For a hook alone, `renderHook` from `@testing-library/react`:

```typescript
const { result } = renderHook(() =>
  useLiveQuery("tenants", async () => (await getDB()).count("tenants")),
);
await waitFor(() => expect(result.current.data).toBe(0));
```

## Mocks

- `vi.fn` needs a type parameter — the oxlint `vitest` plugin errors on a bare
  `vi.fn()` (`require-mock-type-parameters`): `vi.fn<(id: string) => void>()`.
- `restoreMocks: true` restores every `vi.spyOn` before each test, so spies
  never leak into the next one.
- Override `matchMedia` per test by spying on the stub:

```typescript
const stub = window.matchMedia("(prefers-color-scheme: dark)");
vi.spyOn(window, "matchMedia").mockReturnValue({ ...stub, matches: true });
```

## Anti-patterns

- An app without a single test file: `vitest run` exits 1. Keep
  `src/test/environment.test.tsx`.
- Polyfilling BroadcastChannel or IndexedDB by hand next to `setup.ts`.
- `globals: true` just to get Testing Library's auto-cleanup — `setup.ts`
  already cleans up.
- Mocking `getDB()` to test a component. Write real records into the fake
  database instead; it is fast and exercises the same code as production.
