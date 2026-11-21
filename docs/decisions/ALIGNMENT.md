# Cross-component alignment: panel, Agents pane, file tree (2026-11-21)

DEGRADED: single-context (no sub-agent tool was available in this run, so the design review and the detector ran in one context; the design review was finished before the detector ran).

**Verdict:** after the fixes below it reads as one product. Before them it did not: the two locked mockups disagreed on facts, on the crab, on what red is allowed to do, and on motion.

**Composite:** `design/mockups-all.html` shows the aligned result. Every deviation from the locked mockups is tagged `ALIGN <id>` in its source. The locked mockups were not edited.

**Colour decision (decided 2026-11-21):** the panel and the Agents pane use fixed colours and never follow the active skin. There is no new app-wide skin. The file tree stays on its upstream colours, with no skins patch. The token table below is therefore final for the panel and the pane.

## Misalignments, ranked

"Panel" is `panel-above-prompt.html`. "Pane" is `agents-pane-roster.html`.

### P0: the parts contradict each other or a locked rule

| ID | What | Before | After | Changes |
|---|---|---|---|---|
| D1 | The two parts show different facts for the same crew | Panel: 3 agents, "~6m left", names "implement" and "review c1", task "docs" not started. Pane: 4 agents plus 2 helpers, "crew ~9m left", names "savvy-progress implement" and "cache-tax review c1", "docs pass" already ended | One dataset feeds both. Same names, same counts, one time-left figure ("~9m left") in the plan line, the plan column and the pane summary | Both. In the build, both read one atom; neither derives its own time left |
| M1 | Eased loops | Pane: 3 eased prop bobs (`pb 1s ease-in-out`) and an eased 3s ring over a 384×62px row. Panel: stepped only | No eased loops. The prop rides the body's stepped bob. The ring is stepped | Pane |
| M2 | Loop count and who walks | Pane ran 4 loops (3 walkers plus the ring), against its own lock of 3 slots. A helper walked while a top-level agent stood still. Chips and rows could animate different agents | 2 walkers while someone needs you, else 3. The same agents walk in the chip and in the row. Helpers walk only if a slot is free. Measured in the composite: 6 looping drawings, 0 eased (full panel with the Agents tab); 1 and 0 (folded panel with the Files tab) | Pane, and the shared rule |

### P1: the same thing is drawn or said two ways

| ID | What | Before | After | Changes |
|---|---|---|---|---|
| C2 | Two different crabs | Pane crab: full props, done flag, an extra pixel on the design hat, no failed eyes. Panel crab: simplified props, failed eyes, no done flag. Six sizes: .7, .75, .8, .9, 1.1, 1.6 | One drawing function: the pane's props and flag plus the panel's failed eyes. Three sizes: S .75 (chips, one-line, helper and ended rows), M 1.0 (pane rows, folded column), L 1.5 (empty state) | Both |
| K1 | Red has two jobs and one stray value | Toggle dot `#ff6a52`, in no token set (2.68:1 on the light panel). Deep red `#b3261e` used bare for bar segments, step blocks and the mini bar: 2.37:1 on the dark panel, under the 3:1 bar for graphics | `red #b3261e` is a fill under white text only (chip, count badge, "?" bubble). Every bare needs-you mark uses `er` (`#ff7a66` dark, 6.07:1; `#b3261e` light, 6.20:1) | Both |
| N1 | The needs-you costume is hidden in two places | Folded column: the count badge (`top:-3px`) sits on the crab's "?" bubble. Red chip: the red bubble disappears on the red fill | Badge moves to the crab's bottom corner (`bottom:-3px`), with 6px clear of the number. On an alert chip the bubble inverts: white fill, red "?" | Panel |
| N2 | Three needs-you tempos | Chip pulse 1.2s stepped; folded crab hop 1.0s stepped; pane ring 3s eased, growing 6px outside the row | One beat: 1.2s `steps(2)`. The pane ring is inset (2px, `er` at 60%), because a Client clips anything outside its box | Pane, and the hop |
| P1 | Two segmented bars with different rules | Plan bar: 8px tall, running = 28% tint plus fill, needs-you = solid full. Crew bar: 6px tall, running = neutral track plus fill, needs-you = partial fill. Mini bar gap 1.5px. Step blocks 7px | Full tier (plan bar, crew bar): 8px, radius 3, gap 2. Compact tier (mini bar, step blocks): 6px, radius 2, gap 2. One fill rule: a live segment is a 28% tint of its colour plus a solid fill to progress, minimum 8%. Done is solid green. Not started is the track | Both |
| W1 | Time-left wording | Pane: "~2m left", "<1m left". Panel chips: "3/5 · ~2m". Folded column: "next: implement ~2m" | Always "~Nm left", or "<1m left". Chips read "3/5 · ~2m left"; the column reads "next: implement · ~2m left" | Panel |
| W3 | What "running" counts | Folded column: "3 running", counting the agent that is waiting. Pane: "1 needs you · 3 running" | The column reads "N agents". "Running" never includes a waiting or failed agent | Panel |
| C1 | The pane draws its own card | Pane: its own `#252424` card, radius 12, 400px wide, title "Agents" 15/600. The file tree in the next tab sits bare on the side-pane surface, and the tab already says "Agents" | No card, no radius, no fixed width. The title becomes the crew name, "Hydra · retro fixes", at 13/600, matching the plan line in the panel | Pane |
| K3 | Green text fails in light | `#2e8c61` as text on `#faf9f5`: 3.96:1 ("+38", "179", ended time) | Text uses `okText #237550` (5.34:1). Fills keep `ok` | Both |

### P2: drift in type, radius, motion and a missing word

| ID | What | Before | After | Changes |
|---|---|---|---|---|
| A1 | "Slower" is colour-only in the pane | Chip: amber plus the word "slower". Pane row: amber time, no word | The row's activity line starts with "slower ·" in amber | Pane |
| T1 | Weights and one odd size | Weights 400, 500, 600, 650 and 700 in use. Role tag 10.5px. Headline value 16/650 | 400 and 600 only; 700 for 10px micro labels (count badge, role tag). Role tag 10px. Headline value 16/600 | Both |
| R1 | Radii | Panel 12, row 10, chip 8, button 7, toggle 6 | Container 10 (the host's real value), row and chip 8, controls 6 | Both |
| M3 | Durations and curves | .36s, .34s, .32s, .3s, .28s, .24s; `ease-out` mixed with the shared curve | 150ms hover, 300ms fold and reveal, 600ms bar fill, 900ms needle settle; one curve, `cubic-bezier(.2,.8,.2,1)` | Both |
| K2 | Hover wash | Panel 6% white / 5% black. Pane 4.5% / 3.5% | 6% / 5% | Pane |
| F1 | Focus ring | Three styles: outline with 1px or 2px offset, a 2px box-shadow, an inset box-shadow | One: 2px accent outline, 2px offset; inset by 2px on full-width rows | Both |

### P3: small

| ID | What | Before | After | Changes |
|---|---|---|---|---|
| I1 | Icon strokes | Chevron 1.6 at 12px, check 1.7 at 11px, check 2.0 at 8px | One set: 12-unit grid, 1.6 stroke, round caps, drawn at 12px or 10px | Both |
| I2 | A glyph used as an icon | "⌀ 14m per turn" | "avg 14m per turn" | Panel |
| W2 | A running clock written as an estimate | "4m 10s so far" | "4:10 so far". Rule: a ticking clock is m:ss, an estimate is "~Nm", an age is "Ns" or "Nm" | Pane |
| S1 | Off-scale spacing | 5, 7, 11, 14, 18px | 6, 6, 10, 12, 16px | Both |
| F2 | Toggle target | 22×22px | 24×24px | Panel |

### Left as is

- **The crab's body colour** (`#D97757`) is 2.96:1 on the light panel and 2.09:1 on the red chip. It is the brand colour and the eyes and props carry the shape. Not changed.
- **Role fills in light** sit at 3.03 to 3.05:1. They pass the 3:1 bar for graphics, barely.
- **The agents column divider** curves at its top and bottom, because the cell has a radius for its focus ring. Visible only up close.

## Open decisions

1. **Does a failed chip pulse?** `LOCKED.md` says a needs-you or failed chip pulses. The panel mockup pulses only for needs-you. A failed agent can sit there after the session goes idle, and a pulse would then break "nothing moves when idle". Recommendation: failed is solid red and still.
2. **The pane has no failed row.** The panel has a failed chip and failed eyes; the pane mockup has neither. The unified crab now carries the eyes. The row itself still needs a design. Suggested: the needs-you row's tint and layout, "failed after 2:10" in the reading column, no pulse.
3. **The pane's title.** C1 replaces "Agents" with the crew name because the tab already says it. For plain subagents with no Hydra crew, the title needs a name. "Subagents" is the obvious one.

## Unified tokens (final for the panel and the pane)

Surface colours are drawn by the host. They are listed for reference; the mods cannot set them.

### Colour

| Token | Dark | Light | Used for |
|---|---|---|---|
| `fg` | `#ecebe6` | `#1f1e1d` | reading text, dial needle |
| `muted` | `#a3a29b` | `#5f5e58` | labels, secondary text, chevrons |
| `track` | white 10% | black 9% | empty bar segments, dividers, tree lines |
| `wash` | white 6% | black 5% | chip fill, row hover |
| `accent` | `#7aa2f7` | `#2959aa` | current phase, context dial, focus ring, primary button |
| `ok` | `#5fbf8f` | `#2e8c61` | done: fills and icons |
| `okText` | `#5fbf8f` | `#237550` | done and added-lines text |
| `warn` | `#e3a03d` | `#9a5c00` | ahead of pace, slower |
| `er` | `#ff7a66` | `#b3261e` | needs-you and failure: text and bare marks |
| `red` | `#b3261e` | `#b3261e` | needs-you fill, only under white text |
| `needTint` | `#b3261e` at 16% | `#b3261e` at 8% | needs-you row background |
| `crab` / `crabInk` | `#D97757` / `#1F1E1D` | same | crab body and eyes |
| role: implement | `#1FA8B8`, text `#4cc3d1` | `#1d9ead`, text `#12707c` | bar fills; role tag text |
| role: review | `#C4479B`, text `#e483c6` | `#C4479B`, text `#a0337c` | |
| role: test | `#8AA62A`, text `#a9c454` | `#809a27`, text `#566916` | |
| role: explore | `#8A929C`, text `#adb4bd` | `#89919a`, text `#5a6169` | |
| role: design | `#C98AF0`, text `#d6a8f5` | `#b179d3`, text `#874fae` | |
| host: window / surface / prompt | `#191919` / `#252424` / `#303030` | `#f0eee6` / `#faf9f5` / `#ffffff` | reference only |

Colour roles, everywhere: hue = role; green = done; amber = warning; red = needs you or failed; accent blue = current or interactive.

Measured contrast on the surface, dark then light: `fg` 12.97 / 15.80; `muted` 6.04 / 6.17; `accent` 6.15 / 6.42; `warn` 6.90 / 5.10; `er` 6.07 / 6.20; `okText` 6.88 / 5.34; white on `red` 6.54; `er` on `needTint` 5.60 / 5.45.

### Type

One family. In drawn images that is SF Pro (`-apple-system`); host text is Anthropic Sans.

| Token | Size / line | Weight | Used for |
|---|---|---|---|
| headline | 16 / 28 | 600 | gauge values |
| body | 13 / 18 | 400; 600 for titles | row titles, one-line panel, pane title |
| small | 12 / 16 | 400; 600 for names | chips, plan line, activity line, summaries, section heads |
| caption | 11 / 15 | 400 | gauge labels and so-what lines, log ages, drawer footer |
| micro | 10 / 14 | 400; 700 for the badge and role tag | task names, count badge, role tag (uppercase, tracking .06em) |

Numbers are always tabular.

### Spacing, size and radius

| Token | Value |
|---|---|
| spacing scale | 2, 4, 6, 8, 10, 12, 16px |
| radius | container 10; row and chip 8; control 6; bar 3; block 2; badge pill |
| bar, full tier | 8px tall, gap 2, radius 3 |
| bar, compact tier | 6px tall, gap 2, radius 2 (mini bar, step blocks 6×6) |
| crab | S 25.5×21, M 34×28, L 51×42 |
| icons | 12-unit grid, 1.6 stroke, round caps; drawn at 12px or 10px |
| heights | chip 26; row 48; needs-you row 62; helper row 32; ended row 30; toggle 24 |
| focus | 2px `accent` outline, 2px offset |

### Motion

| Token | Value |
|---|---|
| curve | `cubic-bezier(.2,.8,.2,1)` for everything that eases |
| one-shots | 150ms hover; 300ms fold, drawer, chevron; 600ms bar fill; 900ms needle settle |
| walk | .5s `steps(1)`; legs alternate, body and prop bob 1px |
| needs-you beat | 1.2s `steps(2)`: chip halo, row inset ring, folded crab hop |
| loop budget, window-wide | 0 eased loops. Walkers: 3, or 2 while someone needs you. Nothing loops when idle |
| reduced motion | all animation and transition off |

## The file tree next to them

It is upstream's and stays that way, so these are observations, not fixes.

- **It sits well structurally.** Drawn icons, a quiet 24px row, tabular dates, and blue for "switched on". It reads as a denser neighbour, not a different product, once the Agents pane drops its own card (C1).
- **Two blues.** Upstream accent `#3b82f6` against ours, `#7aa2f7` dark and `#2959aa` light.
- **Three reds.** Upstream `#e5484d` against our `er` and `red`.
- **Hue clashes with our roles.** Upstream purple means "Claude is reading" (`#b07ce8`); ours means the design role (`#C98AF0`). Upstream amber means "modified" and "writing"; ours means warning. Both are common conventions and they sit in different tabs.
- **Flat rows against rounded rows.** Upstream selection is a full-width flat band; our rows are 8px rounded. Accepted.
- **Its contrast on our measured surface** (the host may differ): muted `#85858c` is 4.22:1 dark and 3.48:1 light; the write colour `#d99a1e` is 2.32:1 in light; the read colour `#b07ce8` is 2.89:1 in light.
- **Its spinner** is a linear, every-frame rotation (SMIL, 24×24px). That is the only eased loop in the window while the Files tab is in front. How its row shimmer animates in the desktop app was not checked.

## Detector

A design lint run found nothing on all three files:

| File | Findings |
|---|---|
| `design/mockups-all.html` | 0 |
| `panel-above-prompt.html` | 0 |
| `agents-pane-roster.html` | 0 |

An empty result is not a clean bill: the detector does not judge layout or cross-component drift. Everything above came from reading the source and looking at the renders.

Also checked in headless Chrome: no console errors; the page's own loop check passes in all four windows; no external requests in the file.


## Not buildable as drawn in the real renderer

1. **The panel's surface is the host's.** Its fill (5% white in dark), 10px radius and 8px padding are set by the app. The mockup's `#252424` and `#faf9f5` are what that looks like on today's theme, not something a mod sets. With fixed text colours, the mods still need to know light from dark, and a skin with a mid-tone surface could break contrast.
2. **The side pane's surface and its tabs are the host's.** The composite's tab bar is a guess at their look.
3. **Text inside a drawn image is SF Pro, not Anthropic Sans**, and there are no web fonts. Weight 650 is out for the same reason (T1 already moves it to 600).
4. **A drawn image has no hover, no focus ring and no tooltip.** The toggle, the folded agents column and the pane rows need a Client. A Button cannot hold the toggle's picture, the crab or the red dot, because Buttons hold only text.
5. **Height changes do not animate.** The fold between the three sizes, and the drawer if each row is its own Client, will jump. Content inside one Client can still animate. The drawer and helper folds animate only if the whole pane is one Client.
6. **A Client clips its overflow.** The original ring grew 6px outside the row; N2 makes it inset. The chip's 3px halo needs 3px of padding inside its image.
7. **No ellipsis or line clamp in a drawn image.** Truncation and the two-line question need a Client, or manual cutting against a guessed cell width (about 9.2px, and it varies with zoom).
8. **Transitions cannot run across a redraw of an image.** The needle settle and the bar fills must be one-shot keyframes with the start value baked in, on a Client with constant props so a redraw does not restart them.
9. **Column count cannot use pixels.** "One column per 128px" becomes about one per 14 cells of `bodyColumns`.
10. **Box colours take only hex, rgb, hsl or a theme key.** The `color-mix()` tints (28% segment tint, 35% halo, 60% ring) must be pre-computed.
11. **Dim Buttons fold into the "…" menu.** "Compact now" has to stay non-dim.
12. **Selection colour and scrollbars** are the host's.

## Not checked

- Nothing here was seen in the real app. Every render is headless Chrome.
- The loop budget is still the provisional one from `ANIMATION-LIMIT.md`; no CPU measurement exists.
- The states not shown in the composite: failed, context at 90%, plain subagents, idle, empty pane, and the one-line size (it is reachable by clicking the toggle, but was not screenshotted).
- Widths other than 880px for the panel and 400px for the pane.
- The file tree is redrawn from one light screenshot and upstream's constants. Its dark look is inferred.

## Failed state (2026-11-21)

Shown in `design/mockups-all.html?state=failed` (and `?state=both`, which keeps a needs-you agent beside the failure). Every change is tagged `ALIGN F3` to `ALIGN F12` in the source; `F1` and `F2` were already taken by the focus ring and the toggle target. This section replaces items 1 and 2 under "Open decisions" and the "failed" entry under "Not checked".

No new colour, size, radius or duration. The only new motion is the folded crab's stagger, which runs on the existing needs-you beat.

### The two kinds

| Kind | Data | Reads as | Colour |
|---|---|---|---|
| Ended failed | `status: 'failed'`, `endedAt`, `heldDone` until the next prompt | "failed" | `er` text and marks, `red` chip fill, `needTint` row |
| Struggling | `status: 'running'`, `failedAttempts >= 3` | "N failed tries" | `warn` words only; everything else stays as a running agent |

Red stays reserved for "it is over" and "it is blocked on you". A struggling agent is live and may recover, so it is a warning, like "slower". If it then ends failed, it turns red.

### What each surface shows

| Surface | Ended failed | Struggling |
|---|---|---|
| Pane section | Its own section, **Failed N** (`er`, 12/600), between Needs you and Running. The order matches the crab costume order. After the next prompt the run moves to Ended | Stays in Running, sorted first. Counted as running |
| Pane row | The needs-you row: 62px, `needTint`, four columns. Crab M with dizzy eyes, no prop, still. Role tag in `er`. The reason takes the question's place: 12/16, 600, `er`, two-line clamp. Reading column, three lines: "failed" (13/16, 600, `er`), "after 2:10" (12/16, 400, `fg`, tabular), step blocks filled in `er` up to the last finished step. **No ring** (A) | Normal 48px row, no tint. The activity line starts with "3 failed tries ·" in `warn`, the same slot as "slower ·" (it replaces it). Time left and blocks unchanged. Walks if it holds a slot |
| Helper row | 32px, `needTint`, crab S with dizzy eyes, name, then the reason in `er` 600 (ellipsis). Reading column: "failed" (12, 600, `er`). No duration; the parent's log carries "Helper … failed after 0:48: reason". The toggle reads "2 helpers · 1 failed" with the count in `er`, so it shows while folded | Same rule as the top-level row, at helper size |
| Log drawer | First entry, `er` 600: "Failed at step 3 of 4: run the login flow test", with its age. Under it the worker's error line, verbatim: 11/15 monospace, `fg` on `wash`, radius 6, padding 4/8, wraps anywhere. Then the tries, newest first ("Try 3 failed: …"), then the earlier steps. Footer adds "tries 3" and "ran 2:10" beside steps, context, cost and usually | The tries appear as ordinary entries, newest first. Footer adds "tries 3" |
| Crew bar segment | Solid `er`, full width. Rule: an ended segment is solid (done `ok`, failed `er`); a live segment is the 28% tint plus fill | Live segment in its role colour, unchanged |
| Summary line | "1 failed" in `er`, after "N needs you" and before "N running" | Counted in "N running" |
| Plan task segment | Solid `er`. The task name gets the cross icon (10px, same grid and stroke as the check) and reads "fixtures failed" in `er` 600. Mini bar: an `er` segment | Unchanged |
| Chip | `red` fill, white text: dizzy crab S, name, "failed · reason" (the same sentence as the row; reason clipped at 300px). Pulses while armed. Sorted after needs-you chips, before the rest | Normal `wash` chip. The reading turns `warn` and ends "· 3 failed tries": "1/4 · ~4m left · 3 failed tries". No pulse |
| Folded agents column, one-line size | Dizzy crab (M in the column, S on the line), red count badge, "e2e tests failed" in `er` 600. The toggle carries its red dot. While armed the crab staggers 2px sideways on the beat | Costume order gains one step: needs you, failed, **struggling**, finishing next. The crab keeps its tool and walks; the line reads "cache-tax review c1 · 3 failed tries" in `warn` |
| Ended row (after the next prompt) | 30px row: dizzy crab S, name, then the cross icon and "failed after 2:10" in `er` | n/a |

Wording: "failed after m:ss" is a stopped clock, so m:ss. Log ages read `<1m` or `Nm`, per LOCKED "Build decisions: decided 2026-11-21". Every failed mark carries the word "failed", or the cross icon next to a name; none is colour alone. Bar segments get it from their `aria-label` and from the summary line under them.

### Pulse and timer

- **Beat:** the needs-you beat, 1.2s `steps(2)`. Chip: the 3px `red` 35% halo. Folded crab: `translateX(2px)`, where needs-you hops `translateY(-3px)`.
- **Armed** while a turn runs, and for 10 minutes after the session goes idle. Then the chip is solid red and the crab stands still. A new turn re-arms it.
- **A, recommended: the pane row does not pulse.** In the pane a ring keeps one meaning, "answer me", so with a waiter and a failure on screen the ring points at the one that unblocks work. It also keeps the idle exception to a 26px chip and a 34px crab, not a 384×62px row.
- **B: the row shares the beat**, with the needs-you inset ring (2px, `er` 60%) under the same 10-minute limit. Shown beside A in the specimen at the top of the failed state.
- **Loop budget:** the armed failed pulse takes the same one slot as the needs-you beat, and they share it when both are up, so walkers are 2 while either is armed and 3 otherwise. Measured in the composite: failed, 5 looping drawings with the full panel and the Agents tab, 1 with the panel folded and the Files tab; failed plus needs you, 7 and 1; all 0 eased. B adds one. The default state still measures 6 and 1.
- Struggling never pulses.

### Not buildable as drawn, or needs data

1. **There is no error text in `AgentRun`.** It holds `failedAttempts` and the last `stepNote`, and the end reason is only "answer" or not. The reason sentence, the error line and the per-try log need the worker to send them through the step tool, and the run to keep them (for example `failNote` and a short attempts list). Without that, the row and chip can only say "failed after 2:10" and "3 failed tries".
2. **The 10-minute limit needs a clock tick while idle** (one redraw at idle + 10 minutes) and the idle start time kept in state. The limit must be a prop of the looping Client, so the pulse stops by a redraw, not by a timer inside the image.
3. **Two pulsing chips are two images with two clocks.** With a waiter and a failure both up, the beats drift apart unless the chip row is one Client.
4. **"A new prompt re-arms it" rarely applies as the data stands:** the next prompt clears `heldDone`, so the run moves to Ended and its chip goes. Re-arming only happens on a turn that starts without a prompt (a wakeup, a background task finishing).
5. **The two-line reason and the wrapping error line** need a Client, as the needs-you question does. The monospace line assumes a system face (Menlo) resolves inside a drawn image; not checked.
6. **The helper's reason is cut by ellipsis** at pane width; its full text is only in the parent's log, since helpers have no drawer.
7. The halo needs 3px of padding inside the chip's image, and the stagger 2px inside the crab's, because a Client clips its overflow.

### Detector and screenshots

A design lint run on `mockups-all.html` finds nothing. No console errors in headless Chrome in the default, failed and both states.

Screenshots: run `bash scripts/preview.sh` for the README previews; other states render from the URL params above.

### Not checked

- Nothing was seen in the real app.
- The idle scene is shown only as chip and crab specimens, not as a whole window: the pane has no locked design for held, finished runs to draw around it.
- The dizzy eyes are a 3-pixel change and are hard to tell from normal eyes at S size; the words carry the state.
- A Hydra crew that replaces a dead agent: the task segment would go live again while the old run stays in Failed.
- Widths other than 880px and 400px.
