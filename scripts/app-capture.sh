#!/usr/bin/env bash
# Captures the Claude app's window into artifacts/app-checks/<task>/current/<state>.png.
# Usage: bash scripts/app-capture.sh <task> <state> [--dry-run]
# The window id comes from scripts/window-id.swift, or from $WINDOW_ID_CMD when set (the test seam).
set -u
cd "$(dirname "$0")/.."
task="${1:-}" state="${2:-}" dry="${3:-}"
if [ -z "$task" ] || [ -z "$state" ] || { [ -n "$dry" ] && [ "$dry" != "--dry-run" ]; }; then
  echo "usage: app-capture.sh <task> <state> [--dry-run]" >&2; exit 2
fi
app="${CLAWPIT_APP:-Claude}"
if [ -n "${WINDOW_ID_CMD:-}" ]; then raw=$(bash -c "$WINDOW_ID_CMD" 2>/dev/null); else raw=$(swift scripts/window-id.swift "$app" 2>/dev/null); fi
id=$(printf '%s\n' "$raw" | head -n1 | tr -cd '0-9')
if [ -z "$id" ]; then echo "app-capture: no window for $app" >&2; exit 3; fi
out="artifacts/app-checks/$task/current/$state.png"
if [ -n "$dry" ]; then echo "screencapture -l $id -o -x $out"; exit 0; fi
mkdir -p "$(dirname "$out")"
screencapture -l "$id" -o -x "$out" && echo "$out"
