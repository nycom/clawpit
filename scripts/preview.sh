#!/usr/bin/env bash
# Regenerates the README preview images from the mockup.
# Run after every visual change: bash scripts/preview.sh
set -eu
cd "$(git rev-parse --show-toplevel)"
chrome="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
src=design/mockups-all.html
[ -f "$src" ] || { echo "preview: $src not found" >&2; exit 1; }
[ -x "$chrome" ] || { echo "preview: Chrome not found, set CHROME=<path>" >&2; exit 1; }
for theme in dark light; do
  out="design/preview-$theme.png"
  : > "$out"  # empty it first, so a silent Chrome failure cannot leave a stale image
  "$chrome" --headless=new --screenshot="$(pwd)/$out" --window-size=1440,1400 \
    --virtual-time-budget=3000 --hide-scrollbars \
    "file://$(pwd)/$src?theme=$theme" >/dev/null 2>&1
  [ -s "$out" ] || { echo "preview: Chrome wrote nothing for $out" >&2; exit 1; }
  echo "preview: wrote $out"
done
