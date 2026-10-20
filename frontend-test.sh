#!/usr/bin/env bash
# Frontend unit/component tests need Node >= 20.19 (jsdom 29). Uses local node if new enough,
# otherwise runs Vitest inside a node:22 container.
set -euo pipefail
cd "$(dirname "$0")/frontend"
if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)'; then
  exec npx vitest run "$@"
fi
# The repo root is mounted (not just frontend/) because the app imports /shared.
exec docker run --rm -u "$(id -u):$(id -g)" -v "$PWD/..:/app" -w /app/frontend -e NO_COLOR=1 node:22.12-bookworm-slim npx vitest run "$@"
