# Template tests

Tests for template code that needs a real app around it — React, jsdom,
fake-indexeddb, the Vite plugins. They are **not** run by this repo's vitest:
`tools-ci.yml`'s `scaffold` job runs `web-base init`, copies this directory to
`<app>/src/__base_tests__/`, and runs the app's own `bun run test` (with the
`testing` template's setup) and `bun run lint` on it.

Imports are written relative to that destination: `../../lib/ui/…` from
`src/__base_tests__/<template>/`. Pure-TypeScript template code (the sync
client) is tested in this repo instead, under `cli/test/`.
