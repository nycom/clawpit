# The "≤ 3 loops" animation limit: root cause (research, 2026-11-21)

**Verdict (before measuring): an unmeasured guess**; see "Measured (2026-11-21)" below for the numbers and the budget now in force. The app enforces no animation cap. "Nothing moves when idle" is well-founded; the number 3 is not.

## History
| Date | Commit | What happened |
|---|---|---|
| 2026-10-10 14:35 | claude-kit `bb95c3c` | Cap introduced: "each looping image is redrawn on the page's main thread every frame" |
| 2026-10-10 14:39 | claude-skins `edaf1fd` | Same cap added to skins |
| 2026-10-10 15:13 | `f8c6399`, `a4210f3` | Cap removed 38 minutes later, with no rationale |
| 2026-11-20 14:54 | claude-kit `2ccfb6c` | Cap restored in savvy only, after a code audit; no numbers |

**Skins has no cap today.**

**Evidence:** a single by-eye remark from the maintainer on 10-10, in a session confounded three ways:
- every redraw restarted every animation;
- a ~2,300-cell twinkle veil looped forever;
- render timeouts were later traced to orphaned `yes` processes.

**The code already exceeds 3:** 6 looping Clients for 3 agents, plus the band glow and the band crab. Skins' spinner, tool arcs and jog rings are uncapped.

**What the cap also did:** it kept the pane tree under the engine's ~1e5-character limit at 10+ agents. That is a real limit, but a size limit, not an animation one.

## What the app does (renderer `c2719cf1b`, `c95e4d2cf`)
- A mod Svg is drawn as `<img src="data:image/svg+xml,…">`. A Client loop is the same image; the Client only stops it restarting on each redraw.
- There is no cap, throttle or budget.
- The only guards are a 10 s Client load timeout and a message-flood kill.
- Animation is stripped only on the Backdrop surface, under software compositing or `!shouldAnimate`.

## What a loop costs (Chromium source, inference, not measured)
- SVG-in-img animations never run on the compositor (`svg_image.cc:801`), so `transform`/`opacity` buys nothing.
- Each animated image runs a 60 Hz timer (`svg_image_chrome_client.cc:42`). Each tick runs style and layout for that small document; a visible change repaints its rectangle on the host.
- Images that aren't visible pause themselves.
- **The cost is a step, then a slope.** The first loop keeps the window producing frames. Each extra loop adds a small style pass plus a repaint.
- **Timing function and area matter more than count.** A `steps()` loop (crab legs, blinks) changes pixels 2–4×/s; an eased loop changes them every frame.

## Proposed rule (provisional until measured)
1. Zero loops unless work is running or the user is needed. This stays a hard rule, with tests.
2. Budget by kind:
   - stepped loops ≤ ~32×32px: about 8 window-wide;
   - eased, every-frame loops: at most 2, each under ~100×30px;
   - no large-area loops.
3. Keep the other invariants: constant props on a looping Client, and the tree-size budget test.
4. Hold skins to the same rule.

## Measurement (≈20 min, at the Mac)
1. Run a fixture with N = 0, 1, 3, 6, 12 running crabs.
2. In Activity Monitor, watch "Claude Helper (Renderer)" and "Claude Helper (GPU)": %CPU and Energy over a 30 s average per N. Check `uptime` first for stray processes.
3. Optional: DevTools via `{"allowDevTools": true}` in `~/Library/Application Support/Claude/developer_settings.json` (path untested). Record a Performance trace and turn on Paint flashing.
4. At N = 3, compare all-stepped against all-eased.

**Pass bar:**
- CPU within 3–5 points of N = 1
- no frames over 16.7 ms while typing
- no paint flashes while idle

## Design impact
- **Agents pane:** fine as designed. Make the needs-you pulse stepped, or small and eased, and only while flagged.
- **Panel above the prompt:**
  - Dial needles become one-shot settles, so they don't count as loops.
  - Walking crabs are stepped, so the number of race lanes or crabs can follow the row budget instead of 3.
  - The needs-you hop uses `steps()`.
  - The Fable costume's eased float gets a stepped variant.
- **Plan text:** replace "≤ 3 loops" with the by-kind budget, but only after the measurement.

## Not verified
- No CPU, frame or energy number exists anywhere.
- Whether a stepped loop skips repaints between steps.
- Whether identical `data:` sources share one document.
- Whether Electron 45's Chromium matches `main`.
- Whether skins' context-ring chase loops while idle (its lowest tier starts at 0%; if so, it already breaks the idle rule).

## Measured (2026-11-21)
Desktop app, MacBook Pro, dark mode. `/clawpit-bench n` drew n M-size walking crab Clients in the Agents pane; CPU sampled every ~4 s with `top` on the main window's Renderer and the GPU process, averaged per 45 s window after a 10 s settle.

| Loops | Renderer CPU | GPU CPU |
|---|---|---|
| 0 | 0.9% | 0.3% |
| 1 | 8.9% | 3.4% |
| 3 | 11.9% | 4.7% |
| 6 | 14.2% | 5.1% |
| 12 | 14.7% | 7.1% |
| 3, eased | 13.8% | 7.9% |

- The cost is a step, then a slope, as predicted: the first loop costs ~8 points (the window keeps producing frames), each further stepped loop under a point.
- Eased loops cost more than stepped ones, mostly on the GPU (+3 points at 3 loops). Stepped loops only, 0 eased, stays.
- Typing in the prompt at 6 loops: no stutter (maintainer).
- **Budget, maintainer's call:** `max` 12 loops window-wide (was 8); walkers 3, or 2 while someone needs you, unchanged.
- Not measured: Energy, the paint-flash trace, and whether some of the 12 crabs were scrolled out of view (paused), which would undercount that row. Other sessions were running during the measurement.
