#!/usr/bin/env bash
# Writes the gauges plugin's copies of clawpit's files from plugin/. With --check it writes nothing and exits 1 on
# any copy that differs, a types prefix that differs, or a file under gauges/hooks/ that is neither a copy nor its own.
set -euo pipefail
ROOT=${GAUGES_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
cd "$ROOT"

# The one list of copied files, relative to plugin/hooks/ and gauges/hooks/.
FILES=(draw.ts crab.ts icons.ts tokens.ts text.ts model.ts client/image.tsx
  panel/draw.ts panel/columns.ts panel/fold.ts
  track/activity.ts track/context.ts track/pace.ts track/turn.ts track/tests.ts track/code.ts)
OWN=(register.tsx hooks.json)

# The shared types: everything before the `declare module 'claude-code'` block; the block after it is each plugin's own.
prefix() { sed "/^declare module 'claude-code'/,\$d" "$1"; }
block() { sed -n "/^declare module 'claude-code'/,\$p" "$1"; }

bad=0
if [[ ${1:-} == --check ]]; then
  for f in "${FILES[@]}"; do
    cmp -s "plugin/hooks/$f" "gauges/hooks/$f" || { echo "differs: gauges/hooks/$f"; bad=1; }
  done
  [[ "$(prefix plugin/types/index.d.ts)" == "$(prefix gauges/types/index.d.ts)" ]] || { echo "differs: the shared part of gauges/types/index.d.ts"; bad=1; }
else
  for f in "${FILES[@]}"; do mkdir -p "gauges/hooks/$(dirname "$f")"; cp "plugin/hooks/$f" "gauges/hooks/$f"; done
  { prefix plugin/types/index.d.ts; block gauges/types/index.d.ts; } > gauges/types/index.d.ts.new
  mv gauges/types/index.d.ts.new gauges/types/index.d.ts
fi

while IFS= read -r p; do
  rel=${p#gauges/hooks/}
  [[ " ${FILES[*]} ${OWN[*]} " == *" $rel "* ]] || { echo "not a copy or the plugin's own: $p"; bad=1; }
done < <(find gauges/hooks -type f | sort)

(( bad == 0 )) || { echo "run: bash scripts/sync-gauges.sh"; exit 1; }
