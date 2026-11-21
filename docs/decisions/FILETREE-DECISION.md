# Filetree: keep the fork, go back to upstream, or replace (2026-11-21)

Two independent research passes were made. Both were read-only; nothing was installed or changed.

## Verdict
- **Replace it?** No. Nothing beats filetree for the desktop Code tab.
  - Marius-Adam's files-pane (40★) is the only serious alternative. Its colours are hard-coded, so it ignores skins. It also runs four smooth, every-frame loops, which breaks the animation rule.
  - The app's built-in Files and Changes panes browse files and diffs, but they don't mark live reads and edits. They complement filetree rather than replace it; use Cmd+Shift+D to review diffs.
- **Fork or upstream?** **Go back to upstream** (`data-goblin/claude-code-filetree`), then re-add skins theme sync as a small patch.

## Why upstream
| | The old fork (0.2.25, `d176dc7`) | Upstream (v0.8.5, `1fdc3a9`, 465★) |
|---|---|---|
| Distance | 32 commits ahead, **423 behind** (base 10-05) | 6 releases from 11-05 to 11-17; 0.9.0 in progress (module split) |
| Follows the skins theme | **Yes** (only the fork has this) | No |
| Desktop drawing | one text-row client, Unicode glyphs | native rows, vector icons, git columns, readable in light mode, page-size budget |
| Features | tree, follow, sizes, dates | + search, marks and multi-select, previews, treemap, diff groups, jump, a `shimmer` toggle |
| Tests (2.1.325) | 77 pass | 324 pass |
| Merging upstream in | 8 of 9 touched files conflict; effectively a rewrite | — |

## Plan for filetree (folded into the build plan)
1. Install upstream from its own marketplace and **pin a tag** (v0.8.5, or 0.9.0 once it ships).
2. Settings:
   - `start=off`, so it doesn't take the side-pane front tab from the Agents pane at session start.
   - `work=off`, so it doesn't `/cd` on its own.
   - `shimmer=on`. The shimmer runs only while Claude works and stops on its own when idle.
3. Uninstall the maintainer's fork (from the fork's own marketplace), and archive it: no deletion, keep the repo.
4. After 0.9.0: write a small **skins theme-sync module** for upstream, using the fork's skins tests as the spec. Offer it upstream as a PR, which needs the maintainer's OK before it goes out. Until then the pane uses the app's colours, not the skin's.
5. By eye in the app: the Agents pane and filetree share the side pane without stealing the front tab, light mode is readable, and nothing moves when idle.

## Risks
- Upstream moves fast, so pin a tag.
- Upstream's Desktop page is heavier: up to 150 row clients plus up to 4 shimmer clients, against the fork's 1.
- Skins colours are lost until the patch lands.

## Unverified
- Neither option has been seen running in the Desktop app.
- Whether a hidden tab keeps shimmering.
- Whether skins re-themes the app colours upstream uses.
- Whether upstream would accept a skins PR.
