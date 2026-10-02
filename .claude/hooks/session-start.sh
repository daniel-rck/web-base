#!/bin/bash
# Install dependencies in Claude Code cloud sessions so `bun run typecheck`,
# `bun run lint` and `bun run test` work (CLAUDE.md runs them after every change).
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
bun install --frozen-lockfile
