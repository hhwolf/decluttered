#!/bin/bash
# One-command local test run for Decluttered.
# Usage:  ./run.sh          (installs deps if needed, starts dev server)
#         ./run.sh test     (runs the full test suite instead)
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it first:  brew install node"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies (first run only)…"
  npm install
fi

if [ "$1" = "test" ]; then
  npm test
else
  echo "Starting Decluttered at http://localhost:5173 — Ctrl+C to stop."
  npm run dev
fi
