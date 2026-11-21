# Locked decisions

## Agents pane: locked 2026-11-21

**Design:** "Roster with a log", polished. The mockup is `agents-pane-roster.html`. Rules:

- **Sections:** Needs you, then Failed, then Running, then Ended (folds away). See "Failed state" below.
- **Rows:** every row uses the same four columns: crab (38px), title plus role tag and activity, a fixed 88px reading column (time left over step blocks), then a chevron.
- **Needs-you row:** 62px tall, so the question wraps to two lines and is never cut off. It carries a soft red ring pulse.
- **Log drawer:** a click opens it. Entries are newest first and stagger in; a footer shows steps, context, cost, and the usual time.
- **Helpers:** nested under their parent on a tree line, with a "N helpers" toggle.
- **Crew bar:** one segment per agent, filled to that agent's progress. Hue = role, red = needs you, green = done.
- **Crabs:** each holds the prop for what it's doing (search, read, write, think, wait "?", done flag). Only the 3 newest walk. While an agent waits on you, the ring pulse takes one of the 3 loop slots.
- **Motion:** the same ease-out curve everywhere, and reduced motion turns it all off. SVG icons, no glyphs.

Plan writing is deferred: the maintainer asked to do the panel above the prompt first.

## Panel above the prompt: locked 2026-11-21

**Mockup:** `panel-above-prompt.html`. ponytail's band is switched off. Its information is kept (context, cost, tokens, agent time); its buttons are not.

**Dynamic columns.** Each column appears only when it has something to say, ranked by priority. The column count fits the width: about one per 128px, between 2 and 6.
- **context:** always shown. A dial with a grey base arc; the so-what reads "~N turns · M% msgs". At 90% and above it turns red and reads "auto-compacts at 97%", and "Compact now" appears.
- **this turn:** only while busy. The clock, +/− lines, and ≈ cost.
- **5h and 7d:** low priority while calm. They jump forward when ≥ 50% or ahead of pace, in amber. Each dial has a dashed ghost needle at the on-pace point.
- **session:** cost and last-turn cost.
- **tokens and agent time:** after 3 turns. These step aside first.
- **tests:** once a test has run since the last change.
- **reuse and callers open (decided 2026-11-21, M5):** kept from ponytail's band as the two lowest-priority columns. They show only when the width has room after every other column, and step aside first.

**Agents section.** Applies to plain subagents and Hydra crews alike.
- One chip per agent: crab, name, steps and time left. A slow agent shows "slower" in amber.
- A needs-you or failed chip turns solid red with its question or failure, and pulses (stepped).

**Hydra plan.** Shown only in Hydra mode.
- A phase stepper: plan → delegate → review → close.
- "N/M tasks · ~Xm left".
- A segmented task bar, one segment per task: done green, running fills in the agent's role colour, needs-you red, not started faint. Task names sit under the segments.

**Three sizes,** stepped by one state-showing icon at the top-right. The icon is a tiny picture of the panel, and it gets a red dot while folded if an agent needs you. Only user presses change the size, and the choice is remembered.
1. **Everything:** columns, then the plan, then chips.
2. **Agents folded:** the gauges stay. The plan becomes a column (mini bar, "N/M", phase). The agents become the right-most column: one animated crab with a count badge.
3. **One line:** context dial, any hot limit, the plan's mini bar (or session cost), and the agents crab at the far right.

**Agents crab costume, in order:**
1. the agent that needs you (its "?", hopping, red badge);
2. else a failed agent (dizzy eyes);
3. else the agent finishing next (walking with its tool).

**Animation:** stepped loops only, plus one-shot needle settles; see `ANIMATION-LIMIT.md`. Still when idle.

**Failed chip (decided 2026-11-21):** pulses on the needs-you beat (1.2s `steps(2)`). It keeps pulsing while a turn runs, then for up to 10 minutes after the session goes idle, then turns solid red and still. A new prompt or turn re-arms it. This is the one exception to "still when idle", and it is time-boxed.

## Filetree: decided 2026-11-21

The maintainer chose **upstream + skins patch**. See `FILETREE-DECISION.md` for the details.
- Install `data-goblin/claude-code-filetree`, pinned (v0.8.5, or 0.9.0 once it ships).
- Settings: `start=off`, `work=off`, `shimmer=on`.
- Uninstall `filetree@nati-mods` and archive the fork.
- ~~Skins theme-sync module~~: skipped for now (see "Colours" below).

## Colours: decided 2026-11-21
- The panel and the Agents pane use **fixed app colours**: the mockups' contrast-checked tokens, final values in `ALIGNMENT.md`. They do not follow the active skin.
- skins keeps styling the transcript rows only. **No new app-wide skin.**
- The filetree skins theme-sync patch is **skipped for now**. Upstream filetree uses the app's own colours.

## Failed state: decided 2026-11-21
Design: `ALIGNMENT.md`, "Failed state"; mockup `mockups-all.html?state=failed`.
- **Pane row stays still** (option A). Only the panel chip and the folded crab pulse, under the 10-minute idle cap.
- **Struggling** (still running, 3+ failed tries) is amber words, "N failed tries", in the "slower" slot. Red is kept for failed or needs you. Costume order: needs you, then failed, then struggling, then finishing next.
- **Sections:** Needs you, then Failed, then Running, then Ended. A failed run moves to Ended after the next prompt.
- **Failure reason:** workers send a reason and an error line through savvy's step tool. The build plan adds the fields and the brief line. Re-arming stays as the data allows (a turn that starts without a prompt).

## Build decisions: decided 2026-11-21
Taken by the maintainer while the build ran, after seeing each behaviour drawn.
- **Log drawer:** one image holds the lines and their ages; ages read in whole minutes ("<1m", "3m"), as the waiting age does. The drawer opens still. When a line arrives, only that line fades in from the right (300 ms, 100 ms late) while the lines below slide down one row; nothing else moves. The image changes only when a line arrives or an age crosses a minute, so nothing replays on the clock. Reduced motion: no movement. This replaces the drawer's open reveal and "entries stagger in" above.
- **A helper that waits on you** needs you: it counts in "N needs you", its row is tinted and reads "waiting Nm" with its question, and a folded helpers toggle reads "N helpers · M needs you" in `er`, so an alert always points at something visible. It stays under its parent; the ring stays on top-level rows.
- **A helper that failed** gets no chip of its own in the panel's chip row: only a helper that waits on you does. A failed helper still dresses the folded crab, lights the toggle's red dot and is named in its alt text, and shows in the pane under its parent.
- **Helpers of helpers** nest one more level under their helper, on the same tree line.
- **Step blocks:** at most 11 in the reading column; more steps fill them in proportion.
- **Pane summary:** when it does not fit one line, the cost and the time left move to a second line.
- **Context so-what:** "learning your pace" only under 3 recorded turns. After that, with no growth to estimate from, it shows only the msgs share ("34% msgs"), or nothing.
