# Locked decisions

## Agents pane: locked 2026-11-21

**Design:** "Roster with a log", polished. The mockup is `agents-pane-roster.html`. Rules:

- **Sections:** Needs you, then Failed, then Running, then Ended (folds away). See "Failed state" below. (amended 2026-11-23 by "Background section": Background sits after Running)
- **Rows:** every row uses the same four columns: crab (38px), title plus role tag and activity, a reading column (time left over step blocks) as wide as the widest reading in view plus 6, 88px at most (replaces the fixed 88px, 2026-11-21; see "Narrow pane"), then a chevron.
- **Model:** the reading column's third line is the agent's model, muted: "Opus 5.5", or the family word alone where the edge has no room. The word is never cut and sets the edge's floor; a longer name never widens it. It is read from the id's shape, with no family table, so an unknown id shows trimmed, and an empty one draws nothing. Effort shows in the drawer and the alt only, and only when the run has one. Decided 2026-11-22.
- **Needs-you row:** 62px tall, so the question wraps to two lines and is never cut off (narrowed 2026-11-21 by "Narrow pane"). It carries a soft red ring pulse.
- **Log drawer:** a click opens it. Entries are newest first and stagger in; a footer shows steps, context, cost, and the usual time.
- **Helpers:** nested under their parent on a tree line, with a "N helpers" toggle.
- **Crew bar:** one segment per agent, filled to that agent's progress. Hue = role, red = needs you, green = done.
- **Crabs:** each holds the prop for what it's doing (search, read, write, think, wait "?", done flag). Only the 3 newest walk. While an agent waits on you, the ring pulse takes one of the 3 loop slots.
- **Motion:** the same ease-out curve everywhere, and reduced motion turns it all off. SVG icons, no glyphs.

Plan writing is deferred: the maintainer asked to do the panel above the prompt first.

## Panel above the prompt: locked 2026-11-21

**Mockup:** `panel-above-prompt.html`. ponytail's band is switched off. Its information is kept (context, cost, tokens, agent time); its buttons are not.

**Dynamic columns.** Each column appears only when it has something to say, ranked by priority. The column count fits the width: about one per 128px, between 2 and 6. (ranking replaced 2026-11-21 by "Stable column order")
- **context:** always shown. A dial with a grey base arc; the so-what reads "~N turns · M% msgs". At 90% and above it turns red and reads "auto-compacts at 97%", and "Compact now" appears (replaced 2026-11-21 by "Compact chip").
- **this turn:** only while busy. The clock, +/− lines, and ≈ cost.
- **5h and 7d:** low priority while calm. They jump forward when ≥ 50% or ahead of pace, in amber. Each dial has a dashed ghost needle at the on-pace point. (ranking replaced 2026-11-21 by "Stable column order")
- **session:** cost and last-turn cost.
- **tokens and agent time:** after 3 turns. These step aside first. (ranking replaced 2026-11-21 by "Stable column order")
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
3. **One line:** context dial, any hot limit, the plan's mini bar (or session cost), and the agents crab at the far right. (Updated 2026-11-23 by "One line keeps alarm and ahead in words and shape": the compact chip's icon in alarm, an up arrow on a limit ahead of pace.)

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
- Uninstall the maintainer's fork (from the fork's own marketplace) and archive it.
- ~~Skins theme-sync module~~: skipped for now (see "Colours" below).

## Colours: decided 2026-11-21
- The panel and the Agents pane use **fixed app colours**: the mockups' contrast-checked tokens, final values in `ALIGNMENT.md`. They do not follow the active skin.
- skins keeps styling the transcript rows only. **No new app-wide skin.**
- The filetree skins theme-sync patch is **skipped for now**. Upstream filetree uses the app's own colours.

## Failed state: decided 2026-11-21
Design: `ALIGNMENT.md`, "Failed state"; mockup `mockups-all.html?state=failed`.
- **Pane row stays still** (option A). Only the panel chip and the folded crab pulse, under the 10-minute idle cap.
- **Struggling** (still running, 3+ failed tries) is amber words, "N failed tries", in the "slower" slot. Red is kept for failed or needs you. Costume order: needs you, then failed, then struggling, then finishing next.
- **Sections:** Needs you, then Failed, then Running, then Ended. A failed run moves to Ended after the next prompt. (amended 2026-11-23 by "Background section": Background sits after Running)
- **Failure reason:** workers send a reason and an error line through savvy's step tool. The build plan adds the fields and the brief line. Re-arming stays as the data allows (a turn that starts without a prompt).

## Build decisions: decided 2026-11-21
Taken by the maintainer while the build ran, after seeing each behaviour drawn.
- **Log drawer:** one image holds the lines and their ages; ages read in whole minutes ("<1m", "3m"), as the waiting age does. The drawer opens still. When a line arrives, only that line fades in from the right (300 ms, 100 ms late) while the lines below slide down one row; nothing else moves. The image changes only when a line arrives or an age crosses a minute, so nothing replays on the clock. Reduced motion: no movement. This replaces the drawer's open reveal and "entries stagger in" above.
- **A helper that waits on you** needs you: it counts in "N needs you", its row is tinted and reads "waiting Nm" (only the age where its title would not fit beside it, narrowed 2026-11-21 by "Narrow pane") with its question, and a folded helpers toggle reads "N helpers · M needs you" in `er`, so an alert always points at something visible. It stays under its parent; the ring stays on top-level rows.
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
- **No orphan ellipses (pane):** a text cut to fewer than 8 characters is dropped instead of shown, with the " · " before it; a bare "…" is never drawn. The role tag and the "slower" or "N failed tries" note stay (narrowed 2026-11-21 by "Narrow pane": where both will not fit, the note takes the tag's slot and the tag goes). The drawer footer wraps at item boundaries and leaves "usually Nm" out first when it alone would take another line.
- **Reading column with no estimate:** the clock plus a muted " so far" ("0:10 so far"), the same words as the activity fallback, instead of a bare clock (narrowed 2026-11-21 by "Narrow pane").
- **Empty pane:** one muted line, "Agents you start show up here", under "No agents yet".
- **Pane tooltips:** a row's cut activity, question or failure reason carries its full text in a `<title>` and in the image's alt text. The row stays an unframed image, so it keeps its press; as with chips, this app build does not show the `<title>` over an image, and screen readers read the alt.
- **Needs you, jump in:** pressing a needs-you row (or a helper that waits on you) puts "@" and the agent's title into the prompt at the cursor, once; the row still opens its drawer (a helper has none). The engine gives a plugin no way to focus the prompt box, so the person clicks into it.
- **Session need:** the main session can need you; it is a row titled "Claude" in Needs you, a red chip, and the folded crab's face; it is not an agent, gets no crew-bar segment, and is not pressable (the jump-in ruling applies to agents only). Decided 2026-11-22.
- **Session cost board:** the Agents pane has a costs view: the last 20 main turns, newest first, each "turn N" with its $X right-aligned (layout per "Cost list", updated 2026-11-21), under the session total, with a back row to the agents. The press `costs` opens it, from the panel's session column.
- **Pointer:** asked for over chips, the folded agents column and the toggle; not buildable in this app build. The desktop gives plugin elements no cursor setting, and draws its own buttons with the arrow, not the pointer. Unframed chips should show the arrow, not the text cursor (unchecked in the app).
- **Compact button (replaced 2026-11-21 by "Compact chip"):** from 50% context a small "Compact" Button sits right of the context value, on its line, inside the context column (no extra row); in alarm it reads "Compact now" and the value and so-what turn `er`. A press runs `/compact`, once per press. Never `dimColor`. Below 50%, no Button. Where the column is too narrow to hold it, the context column widens by what the Button needs and the other columns share the rest (replaced 2026-11-21 by "Column widths follow need": the Button takes its room from the column with the most slack). This replaces "Compact now appears" (alarm only, after the columns) above.
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
- **Column widths follow need:** columns share the row by what their text needs; warnings claim spare width first; the Compact button (the compact chip since 2026-11-21) takes its room from the column with the most slack.
- **Slack counts from the floor:** a column that cannot fit its whole so-what gives up everything above its floor, so the alarm state keeps the 7d warning and the last turn.
- **Narrow alert wraps:** measured in the app on 2026-11-21, the width model is right and "<title> needs you" does not fit one line at 60 cells; the alert keeps its two-line form there and goes to one line where it fits.
- **Stable column order:** context, 5h, 7d, tokens, session, then this turn, tests, agent, reuse, callers, with the folded plan and agents last. The core five keep their slots over every extra and drop from the right when narrow; extras fill what is left. Decided 2026-11-21. (Order updated 2026-11-23 by "Session before tokens": context, 5h, 7d, session, tokens.)
- **Compact chip:** from 50% context a drawn chip right of the value: a squeeze icon and the word "compact", 10 cells (measured), on the wash; the icon takes the dial's tone, and in alarm the word turns er 600 on needTint. Its own press runs /compact once. Icon only where the column is narrow. Replaces the native Button, which the desktop draws too large. Decided 2026-11-21.
- **First column inset:** the first column draws 4 units in from the band's left edge, so the context dial does not touch it. Decided 2026-11-21.
- **Failed end:** an agent whose last step reported failed ends as failed, red with its reason, even when it ended on its own; a later ok step clears it. Decided 2026-11-21.
- **Plan count:** the plan's done count is the main session's accepted count; runs mark their own tasks running, waiting or failed but never tick them. Decided 2026-11-21.
- **Plan ticks by title:** tasks named done by savvy tick first; the rest of the session's count ticks in plan order, skipping tasks with a live run. "Plan count" stands. Decided 2026-11-22.
- **Plan line next: clause:** when no task is live, waiting or failed, and the bar is not naming its tasks, the plan line's right-hand text gains a clause, "12/47 tasks · next: <first not-started task>" (next: is the word the folded agents line already uses), muted, 12 px, same baseline. It follows "So-whats drop whole clauses": next: drops first, a clause is never cut mid-number, and the task name inside it may be cut with "…" but not under 8 characters, else the clause drops. Alt: "<title>, phase <phase>, 12 of 47 tasks, next: <full task name>". Decided 2026-11-22.
- **Narrow pane:** running rows and helpers share one reading edge: the widest reading in view plus 6, 88 at most, at every width. Where a title would cut under 8 characters there, the edge pulls in to keep 8 of it, down to the widest number-only reading ("~1m", "0:30") or model word ("Sonnet"), and readings that no longer fit read only their number; a title that still will not fit runs over its reading, so a title never drops and grows as the pane widens. Alert rows size their own column: 88 where the title and the first 16 characters of the why fit, else the column's words, else the age alone ("<1m"; a failed row drops "after 2:10") over the model word, never narrower than that word; the alt keeps the words. The why's second line wraps under the role tag, from the title's x. A note that will not fit beside the role tag takes the tag's slot. A run never shows as a lone "…", it drops instead. Decided 2026-11-21, updated 2026-11-21; the model word joined both floors 2026-11-22 (see "Model").
- **One folded agent:** with one agent, the folded agents column shows its name in the value slot and only its state under it, never "1 agents". Decided 2026-11-21.
- **Animations switch:** a plugin setting, "animations" (on by default), turns every clawpit loop and transition off, the same way reduced motion does; for runs where the screen stays on with nobody watching. Decided 2026-11-21.
- **Filetree opens at start:** the maintainer set upstream filetree's `start` back to on (2026-11-21), replacing the plan's `start=off`; check that the Agents pane still gets its once-per-session open.
- **Final review fixes (2026-11-21):** agent time under a minute reads <1m; a needs-you task on the plan bar carries a ? mark like failed's ✕; the plan bar grows only when the plan first appears; a needle sweep continues, not restarts, when its column redraws.
- **One agent reads its name:** at the one-line and folded sizes a lone agent shows its name and its state, using the room the row has; "next:" is only for two or more. The one-line row's room is reckoned at the measured 9.1 px a cell (its items are not stretched; Windows still to be measured); the stretched columns keep 8.5. Folded at 60 cells the name is cut, since no column has cells to spare there; it shows whole when the row is wider. Decided 2026-11-21.
- **Takeover outside the terminal:** clawpit takes over from savvy-progress in every session but a terminal one, from its start, because a session one session starts has no surface until the desktop attaches, often after its first agent. Accepted limit: a session opened only in VS Code or on mobile gets no savvy pane auto-open and an empty clawpit pane; savvy's band still draws there. Decided by the maintainer 2026-11-22.
- **Background section (decided 2026-11-23; redrawn the same day as "Now and next"):** savvy-progress's background work (shells, monitors, crons, wakeups) gets its own section in the Agents pane. This amends "Sections" (both lists above): Needs you, then Failed, then Running, then Background, then Ended. It reverses M4, which kept background work in savvy's `/agents-info` pane only. Done and stopped rows hide; savvy's own pane (`/agents-info savvy`) keeps the history. **Order:** failed rows first, on the needs-you tint, with a cross, the word "failed" in er and "after 1m", until the next composer or bridge prompt, with no Stop; then running rows (shells, monitors), newest first; then, under a 1 px hairline across the row and its Stop, the waiting rows (crons, wakeups), soonest due first, a cron with no next time last by title. **Readings,** on the agents' reading edge: running work reads back, the age in whole minutes over "since 14:20"; waiting work reads forward, "in 7m" (or "due") over "at 14:39"; a cron with no next time reads its schedule abbreviated ("every 5m", "every 10m", "hourly", "every 2h", "daily"; the full wording in the tooltip and the alt, the kind word where even that will not fit), and a cron with a next time reads "in 4m" over its schedule. The kind word is not in the row; the icon (shell, monitor, a repeat cycle for a cron, an hourglass for a wakeup) and the alt name it. Narrow, the second line drops first. Clock times follow Claude Code's `timeFormat` setting, else the locale's hour cycle, in the machine's zone; a change in /config shows at the next render. **Track:** a wakeup draws a still 2 px track under its title to the reading, filled in muted by the share of its wait used (accent stays for the phase, the dial, focus and the primary button); it moves only on the minute repaint. A cron draws none until savvy gives its period. **Stop:** a 20 px wash button, radius 6, with the standard filled square, centred on the agents' chevron; its press is the whole 28 px slot right of the row (a failed row's slot only ends its tint) (TaskStop, CronDelete, or ScheduleWakeup's stop, which ends every wakeup, with a consent line; an error is toasted and the row stays, except the engine's "already gone" answer, which hides the row without a toast (decided 2026-11-23); a second press while a stop runs does nothing). **Counts:** the section header reads the active count and names the failed apart, "Background 4 · 1 failed" ("Background · 1 failed" with only failed rows), as the folded column does; both alts state both numbers. The full-size chip names what fires next instead of the waiting count, "2 running · wakeup in 7m · 1 failed" (or "1 waiting" with no timed row), so its number can differ from the header and the column on purpose. **Reach:** with no agents, background work reaches the pane through the folded column (labelled "background", the next kind's icon in the crab's slot, the cross in er when only failed rows show, the active count, then "1 failed · next 7m"), the one-line row (that icon, then "4 · next 7m · 1 failed") and, at full size, the chip; each opens the pane. Where the panel has no room for every clause, they drop whole from the right and the failed clause stays: the next clause goes first, then the count shortens or goes, and at one line the icon stands bare last. The pane's head is drawn as it is with no agents. Background work is not an agent: it is in no count, the crew bar, the alerts, the loops or the ETA. Rows are still (no loop) and read in whole minutes, so the pane repaints once a minute while a row runs or a wakeup counts down.
- **One Agents pane:** on the desktop, `/agents-info` opens clawpit's Agents pane instead of savvy-progress's, so the two tabs named Agents become one; `/agents-info savvy` still opens savvy-progress's pane (its ended background history, planned rows and /status line). Sessions with no desktop attached are unchanged. Decided by the maintainer 2026-11-23.
- **Savvy missing:** with no savvy-progress to read, the empty pane reads "savvy-progress is not installed" (muted) in place of "Agents you start show up here", then, in monospace in fg, `/plugin install savvy-progress --marketplace nycom/claude-kit`, on one line where it fits and on two, broken at its option, where not; never cut. It names savvy-progress and not clawpit, because installing clawpit again from claude-kit would leave `clawpit@claude-kit` and `clawpit@clawpit` both enabled. It shows only while savvy-progress has written no `stages` atom (it writes one at boot) and /config lists no setting of it; an unreadable list shows nothing. Not pressable. With savvy-progress present nothing changes. Decided by the maintainer 2026-11-25.

## Gauges alone and the panel review: decided 2026-11-23

Taken by the maintainer after a design review and a design critique of the gauges plugin. Design: `docs/plans/2026-11-23-gauges-plugin.md`.
- **Gauges alone:** a second plugin, `clawpit-gauges` (folder `gauges/`, marketplace `clawpit`), draws the panel above the prompt with clawpit's own `panelTree`, an empty crew and `alone` set; no Agents pane, no savvy-progress. Its drawing and trackers are byte copies of clawpit's, held by `scripts/sync-gauges.sh` and its test. One setting, `animations`.
- **One panel at a time:** with clawpit installed the gauges row steps out of the band whenever a clawpit row is in it (an `AbovePromptList` hook in the gauges plugin). clawpit is unchanged by it.
- **Toggle, alone:** three sizes as in clawpit, with its icons. Alone, the alts never name agents: "Panel: gauges. Press twice for one line", "Panel: gauges. Show one line", "Panel: one line. Show the gauges".
- **Session column, alone:** not pressable; there is no pane to open. Its alt names no action.
- **Limit resets:** a limit's so-what names when the window resets, in skins' band's words ("10:40am", "tmrw 9:00am", "Tue 8:00am", "next Fri 9:00am"; nothing once past). A calm limit leads with it ("resets 10:40am · on pace for 58%"); one ahead of pace leads with its pace ("on pace for 131% · resets Tue 8:00am"). The second clause drops whole when narrow (So-whats drop whole clauses).
- **Session before tokens:** the core order is context, 5h, 7d, session, tokens, and a narrow row drops tokens before session: the cost outlives the token count. At 60 cells the four columns are context, 5h, 7d, session, so in alarm the compact chip shows its icon alone there.
- **One line keeps alarm and ahead in words and shape:** in alarm the one-line row keeps the compact chip, its icon alone, after the context item; a limit ahead of pace carries an up arrow (a new 12-grid icon, `ahead`) after its label, in amber. Both alts carry the so-what. Colour is never the only signal.
- **Alts name the action:** a pressable column's alt ends with what a press does: "Runs /context", "Runs /usage", "Opens the cost list". Plain columns name none.
- **State words whole or not at all:** at the one-line size only an agent's name is ever cut, never its state ("needs you", "~2m left", "3 failed tries"). A row too narrow for the name and the state keeps the state alone, whole, or nothing; with two or more agents ("next: …") the name is cut to no fewer than 6 characters; short of that the time drops and the name stays. A whole name, however short, is never dropped for being short (Cuts keep meaning).
