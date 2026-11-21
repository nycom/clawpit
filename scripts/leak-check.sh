#!/usr/bin/env bash
# Fails if tracked or staged files carry local paths, emails, agent-tooling traces or the fork's personal marketplace name.
# Run before every push: bash scripts/leak-check.sh
set -u
cd "$(git rev-parse --show-toplevel)"
pat='/Users/[A-Za-z]|/home/[A-Za-z]|/private/tmp|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}|Co-Authored-By|Generated with|\.claude/|nati[-]mods'
hits=$(git ls-files -co --exclude-standard | grep -v '^scripts/leak-check.sh$' | xargs grep -nIE "$pat" 2>/dev/null)
if [ -n "$hits" ]; then echo "leak-check: FAIL"; echo "$hits"; exit 1; fi
echo "leak-check: clean"
