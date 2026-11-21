# In-app checks

The real renderer cannot be driven from a test (the technical design, section 12), so each hook-in is checked in the
running app by scripted window capture plus a pixel diff. Shots land in the git-ignored `artifacts/app-checks/<task>/`
and are never committed: they show real session content.

## One-time setup

- **Screen Recording.** `screencapture -l` needs it for the terminal that runs the script. The maintainer grants it
  once in System Settings → Privacy & Security → Screen Recording.
- Swift ships with the command line tools; `scripts/window-id.swift` needs nothing else.

## The procedure

1. **Sync.** Run the maintainer's local mods-check script for `clawpit` and `savvy-progress` (it validates, tests and
   copies each checkout over its installed copy), then `/reload-plugins` in the app.
2. **Reach each state** the task owns, by fixture first (below). Use computer use only for what a prompt cannot do:
   clicking the fold toggle, a pane row, a helpers toggle.
3. **Capture** each state: `bash scripts/app-capture.sh <task> <state>`. For light mode the maintainer flips the system
   appearance and each state is captured again with the suffix `-light`.
4. **Idle check.** With nothing running, capture `idle-1`, `idle-2`, `idle-3` two seconds apart, then
   `npm run app-diff -- <task> --idle`. Expected: 0 changed pixels in the panel and pane regions.
5. **Diff.** `npm run app-diff -- <task>`. A first run reports every state as `new`. A `fail` is a defect to fix, or a
   change to review; its `<state>.<region>.diff.png` sits beside the shot.
6. **Compare** each shot with `design/mockups-all.html` and the Playwright baseline of the same state: nothing clipped;
   the lead column aligned across rows; the right edge flush; no text cut mid-word without an ellipsis; each colour the
   right token; section order; wording; the count badge clear of the "?" bubble.
7. **Accept.** Once every diff has been looked at: `npm run app-diff -- <task> --accept`.
8. **By-eye gate.** The maintainer looks only at what steps 5 and 6 flagged as unsure, plus the task's own short list.

Capture cannot measure CPU or frame time; the animation measurement covers that.

## Regions and masks

`regions.json` holds the panel and pane crop boxes as fractions of the window (0 to 1), and per `<task>/<state>` any
region override and the masks (fractions of their region, each with a `why`). Mask only what legitimately changes:
the turn clock, costs, token counts, the system clock.

## Fixture prompts

Run these from the session under test, so the window being captured is its own.

- **Three running agents.** Spawn three general-purpose agents, each told: "Call the savvy-progress `step` tool with
  `done: 0, total: 4`, then run `date` and `sleep 20` four times, calling `step` with the next `done` and a one-line
  `note` after each."
- **Needs you.** One of them is told instead: "After the first step, call `step` with
  `blocked: 'Postgres or SQLite for the fixture?'` and wait for the answer."
- **Failed.** One agent is told: "Call `step` three times with `failed: true`,
  `reason: 'Could not reach Postgres on :5432'` and `error: 'connect ECONNREFUSED 127.0.0.1:5432'`, then stop."
- **A plan.** The session calls the savvy-progress `progress` tool with seven tasks
  (`schema, api, fold, fixtures, review, release, merge`), `done: 2`, phase `delegate`.
