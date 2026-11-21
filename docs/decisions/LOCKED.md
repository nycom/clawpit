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
- **Crew bar:** a helper that waits on you gets a red segment of its own, after the top-level needs-you ones, so the bar adds up to the summary's counts.
- **Ages, everywhere:** whole minutes, "<1m" or "Nm" (the drawer, the waiting age, the tests column's "<1m ago"). This replaces ALIGNMENT W2's "Ns".
- **Alert chips that do not fit:** red chips fill one row; any further needs-you or failed agents collapse into a red "+N need you" chip of their own (white on red), never into the muted "+N more", which stays for normal chips.
- **The Agents pane opens by itself once per session,** on the first agent of the session. Once closed it stays closed until the folded agents column is pressed, or the next session. A pane that re-opens by itself narrows the app header and hides its buttons.
- **Helpers of helpers** nest one more level under their helper, on the same tree line.
- **Step blocks:** at most 11 in the reading column; more steps fill them in proportion.
- **Pane summary:** when it does not fit one line, the cost and the time left move to a second line.
- **Context so-what:** "learning your pace" only under 3 recorded turns. After that, with no growth to estimate from, it shows only the msgs share ("34% msgs"), or nothing.
- **Chip tooltips:** a chip whose text is cut with "…" shows its full text as a tooltip. Only cut chips carry it (the image is then drawn in the app's sandboxed frame, which costs more than a plain image); in the shared alert-chip image each chip has its own. This replaces ALIGNMENT "Not buildable" 4 for chips. Since every chip opens the Agents pane (below), a chip is a plain image again: the sandboxed frame takes the pointer, so a framed chip could not be pressed. The press wins; chips keep the `<title>`, which this app build does not show over an image.
- **Count badge:** the folded agents crab shows its count badge only for 2 or more agents; one agent needs no number.
- **Chips open the Agents pane:** a press on any chip opens it, as the folded agents column does.
- **No orphan ellipses (pane):** a text cut to fewer than 8 characters is dropped instead of shown, with the " · " before it; a bare "…" is never drawn. The role tag and the "slower" or "N failed tries" note stay. The drawer footer wraps at item boundaries and leaves "usually Nm" out first when it alone would take another line.
- **Reading column with no estimate:** the clock plus a muted " so far" ("0:10 so far"), the same words as the activity fallback, instead of a bare clock.
- **Empty pane:** one muted line, "Agents you start show up here", under "No agents yet".
- **Pane tooltips:** a row's cut activity, question or failure reason carries its full text in a `<title>` and in the image's alt text. The row stays an unframed image, so it keeps its press; as with chips, this app build does not show the `<title>` over an image, and screen readers read the alt.
- **Needs you, jump in:** pressing a needs-you row (or a helper that waits on you) puts "@" and the agent's title into the prompt at the cursor, once; the row still opens its drawer (a helper has none). The engine gives a plugin no way to focus the prompt box, so the person clicks into it.
- **Session cost board:** the Agents pane has a costs view: the last 20 main turns, newest first, each "turn N" with its $X right-aligned (layout per "Cost list", updated 2026-11-21), under the session total, with a back row to the agents. The press `costs` opens it, from the panel's session column.
- **Pointer:** asked for over chips, the folded agents column and the toggle; not buildable in this app build. The desktop gives plugin elements no cursor setting, and draws its own buttons with the arrow, not the pointer. Unframed chips should show the arrow, not the text cursor (unchecked in the app).
- **Compact button:** from 50% context a small "Compact" Button sits right of the context value, on its line, inside the context column (no extra row); in alarm it reads "Compact now" and the value and so-what turn `er`. A press runs `/compact`, once per press. Never `dimColor`. Below 50%, no Button. Where the column is too narrow to hold it, the context column widens by what the Button needs and the other columns share the rest (replaced 2026-11-21 by "Column widths follow need": the Button takes its room from the column with the most slack). This replaces "Compact now appears" (alarm only, after the columns) above.
- **Chip opens its agent:** a chip press opens the Agents pane with that agent's row drawer open, on the crew view even from the cost list. The shared alert-chip image presses the chip under the pointer (a press zone per chip); a key press on it opens the first alert. "+N more" and "+N need you" open the pane only, as the folded agents column does.
- **Limit columns run /usage:** a press on the 5h or 7d column runs `/usage`.
- **Context column runs /context:** a press on the context dial and value runs `/context`.
- **Session column opens the cost list:** a press on the session column opens the Agents pane on its per-turn cost list.
- **Failed tests named:** after a failed test run the tests column's so-what reads the first failing test's name; its alt and its tooltip list up to 5. The column is not pressable.
- **Plan bar names its tasks:** the plan bar and the folded mini bars carry each task and its state ("schema done, api done, … merge not started") in their alt and tooltip.
- **Alert line keeps its words:** the folded agents column's alert line cuts only the agent's name and keeps " needs you" or " failed" whole; with under 6 name characters left it reads only "needs you" or "failed".
- **So-whats drop whole clauses:** a so-what of clauses joined by " · " (context, this turn, session, the limits) drops whole clauses right to left; a clause that does not fit goes whole, so a number is never cut.
- **Cuts keep meaning:** a note never takes an ellipsis, a cut never splits a number, and a helper row keeps its title over its reason. A failed helper's reason that will not fit beside its title wraps to a second er line under it (updated 2026-11-21).
- **Cost list:** amounts right-aligned in the reading column, only the total bold, under a 'Last N turns' header.
- **Empty pane:** the title in fg, the hint muted.
- **Column widths follow need:** columns share the row by what their text needs; warnings claim spare width first; the Compact button takes its room from the column with the most slack.
