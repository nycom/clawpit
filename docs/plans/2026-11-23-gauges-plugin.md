# The panel above the prompt on its own: `clawpit-gauges`

Status: design, Fable review PASS (2026-11-23). No code yet.

## Why

The skins upgrade plans to remove skins' usage band ("The usage band leaves skins", skins `LOCKED.md`, 2026-11-21; the upgrade is on hold until a decision after 2026-11-28, section 11). A skins user who does not run clawpit then loses the context and limit readings above the prompt. clawpit's panel draws them, but clawpit also brings the Agents pane, savvy-progress's takeover and the setup offers. This plugin draws the gauges alone: context with its compact chip, the 5h and 7d limits, session cost, and the extras the panel already shows (this turn, tests, tokens, agent time, reuse, callers).

## Decisions

### 1. Where it lives: a second plugin in this repository

`gauges/` beside `plugin/`, with a second entry in `.claude-plugin/marketplace.json`.

- **Why not its own repo:** the plugin is mostly copies of clawpit files (section 3). In one repository a test can hold every copy to its original on every push. Across two repositories nothing would see drift.
- **Merge clash with the Background section work:** that work edits `plugin/hooks/register.tsx`, the pane, previews and the README. This change adds new files (`gauges/`, a sync script and its test, new Playwright baselines) and touches only these existing ones: `plugin/hooks/panel/draw.ts`, `plugin/hooks/model.ts` and `plugin/hooks/loops.ts` (section 2), `plugin/tests/build.ts`, `plugin/tests/model.test.ts`, `plugin/tests/panel-draw.test.ts`, `tests/visual/panel.spec.ts`, `.claude-plugin/marketplace.json`, `README.md`, `AGENTS.md`, `docs/decisions/LOCKED.md` and `design/mockups-all.html`. It leaves `register.tsx` and the pane alone.
- **No image conflicts, by rule:** without the flag clawpit draws exactly as today, and `scripts/preview.sh` shoots only `?theme=`, so a new `?state=gauges` leaves both preview PNGs as they are. `git diff --diff-filter=M --name-only main -- '*.png'` must print nothing; a changed existing image means the flag leaked into clawpit's drawing, and is a bug. A preview rewritten with different bytes but no visible change is restored from main, not committed.
- **Second to merge:** `git merge main` into the branch (merge commits only, AGENTS.md), resolve the text files by hand, then run `bash scripts/sync-gauges.sh`, `claude plugin test gauges`, `claude plugin validate gauges`, `claude plugin test plugin` and `npm run test:visual`. The gauges test and validate are local gates (CI does not run `claude plugin test`), and they are what catches a `PanelView`, `Stats`, `Ui` or `Crew` change that the byte check cannot.

### 2. What the panel draws when it runs alone

The gauges plugin draws with clawpit's own `panelTree`, given a crew with no agents, no plan and no session need. With that crew the panel already draws only the gauge columns: no chips, no plan rows, no agents column, no crab, no loops, and the toggle's red dot never shows (it comes only from the crew).

One thing in that drawing still points at the Agents pane: the session column and the one-line session item press `costs`, which opens the pane's cost list. `PanelView` gains one optional flag, `alone?: true`, which only the gauges plugin sets; with it, both carry no press. Without the flag nothing in clawpit's drawing changes. clawpit's tests pin that, and a new test pins the change.

The empty crew and the still loop plan are exported once, from `plugin/hooks/model.ts` (`EMPTY_CREW`, `STILL`), so the gauges register, `plugin/tests/build.ts` and the visual suite all pass the same values, and a new `Crew` field changes all three at once. A test in `plugin/tests/model.test.ts` pins that `crewOf` with no runs, no flow and no need equals `EMPTY_CREW`, so a field added in `crewOf` cannot leave it stale.

The toggle stays clawpit's (maintainer, 2026-11-23): three sizes, the same icon and alt text, the same `nextSize` and `parseSize`. With no crew, "everything" and "agents folded" draw the same columns.

Presses kept: context runs `/context`, the 5h and 7d columns run `/usage`, the compact chip runs `/compact`, the toggle steps the size.

### 3. What is copied, and how the copies stay in sync

A plugin cannot import another plugin's files, so the gauges plugin carries copies. The copies are byte-for-byte; nothing is edited in `gauges/`.

Copied from `plugin/hooks/` to `gauges/hooks/` (the panel's drawing and the trackers it reads):

```
draw.ts  crab.ts  icons.ts  tokens.ts  text.ts  model.ts  client/image.tsx
panel/draw.ts  panel/columns.ts  panel/fold.ts
track/activity.ts  track/context.ts  track/pace.ts  track/turn.ts  track/tests.ts  track/code.ts
```

`crab.ts` comes along only because `panel/draw.ts` imports it. `model.ts` is imported by `panel/draw.ts` and by the gauges register (`EMPTY_CREW`, `STILL`). Their crew paths never run with an empty crew.

`gauges/types/index.d.ts` is clawpit's `plugin/types/index.d.ts` up to its `declare module 'claude-code'` block, followed by the gauges plugin's own block:

```ts
declare module 'claude-code' {
  interface PluginState {
    'clawpit-gauges': { stats: Stats; size: Size; tick: number }
    ponytail: { band: PonytailBand }
  }
}
```

(Checked: `claude plugin validate` passes with this split.)

Written by the gauges plugin, not copied: `gauges/hooks/register.tsx`, `gauges/hooks/hooks.json`, `gauges/.claude-plugin/plugin.json`, `gauges/tests/`.

How they stay in sync:
- `scripts/sync-gauges.sh` writes every copy, and the types prefix, from `plugin/`. The file list lives in that script and nowhere else. `sync-gauges.sh --check` writes nothing and exits non-zero on any difference.
- `scripts/gauges-sync.test.mjs`, run by `npm run test:scripts` (CI runs it on every push and PR), runs `--check`. It fails when a copy differs from its original, when the types prefix differs, when a relative import in `gauges/hooks/` points at a file that is not in `gauges/`, or when a file under `gauges/hooks/` is neither in the list nor `register.tsx` or `hooks.json` (a renamed original cannot leave a stale copy). Its message names the script to run.
- clawpit's names travel in the copies: the root key `clawpit-panel` and the error text `clawpit: image …`. Harmless; the gauges tests look for `clawpit-panel`.
- So a change to a shared file in `plugin/` fails CI until the sync script has run. The gauges plugin then picks up the change in the same PR.

### 4. No double drawing

Each plugin draws its own row above the prompt (`AbovePrompt` is asked once per plugin; `AbovePromptList` stacks the rows). With both installed, clawpit's row and the gauges row would both show.

The gauges plugin hooks `ui.render` on `AbovePromptList` and passes on every row except its own whenever a row from the plugin `clawpit` is in `e.props.rows`:

```ts
on('ui.render', { component: 'AbovePromptList' }, ($, e, next) =>
  e.props.rows.some(r => r.plugin === 'clawpit')
    ? next({ ...e, props: { ...e.props, rows: e.props.rows.filter(r => r.plugin !== 'clawpit-gauges') } })
    : next(e))
```

Why this and not an atom like `takeover`:
- It is decided from what is actually drawn, in the same frame, so there is no window where both rows show. `takeover` is written by clawpit's observers after boot, so a reader can see it late, and it says nothing about whether clawpit's row drew.
- It needs no change in clawpit.
- If clawpit's row is missing (a survey holds the band, or the engine refused clawpit's tree), the gauges row shows. A refused clawpit row then still leaves the gauges in place.
- clawpit's "could not draw this panel" line is still a clawpit row, so the gauges stay hidden behind it.

Cost when both are installed: the gauges plugin still runs its observers and its 1 Hz tick during turns, and its row is built and then dropped. Accepted as a known limit. The fix if it shows up: skip the tick while the last list render saw a clawpit row.

savvy-progress is not touched. The gauges plugin writes no `takeover`, so savvy's band keeps drawing for a gauges user who runs savvy: it shows agents, not gauges.

### 5. The gauges plugin's wiring (`gauges/hooks/register.tsx`)

A cut-down, hand-made copy of clawpit's usage wiring, about 150 lines. Unlike section 3 this copy is **not** held in sync by any test: a fix to clawpit's usage wiring (`statsOf`, `takeUsage`, the tick, `liveOf`, the `tool.call`, `turn.start`, `turn.complete` and `session.measure` bodies, the await-ordering in `tool.call`) does not reach the gauges plugin by itself. Moving that wiring into a copied module would edit `register.tsx`, which the Background section work is changing now, so it is a follow-up after both merge (see "Not covered"). Until then, a change to those parts of clawpit's register says in its PR whether the gauges register needs the same.

The wiring:
- **Atoms** (its own, plugin `clawpit-gauges`): `stats`, `size`, `tick`.
- **Reads:** `$.session.usage({ breakdown: 'summary' })` at boot and on `session.measure`, and the cost on `tool.call`, `turn.start` and `turn.complete`, as clawpit does. Tests and lines changed from `tool.call`. ponytail's `band` atom for reuse and callers, missing read as none.
- **Tick:** 1 Hz while a main turn runs; once a minute while a tests reading or a limit is shown; else none. Nothing loops while idle.
- **Render:** desktop only, and passes while a survey holds the band, as clawpit's panel does. It builds the `PanelView` with the empty crew, `alone: true`, a fixed loop plan with nothing moving, `armed: false`, and `settles` and `still` from the `animations` setting.
- **Presses** (`ui.message`): `size` (clawpit's `nextSize`), `context`, `usage`, `compact`. Anything else is ignored.
- **Store:** `size` only.
- **Failure:** a render that throws draws one line, "clawpit-gauges could not draw this panel: <kind>", as clawpit does.

Terminal, VS Code and mobile get no row: the panel is SVG drawn for the desktop, as clawpit's is. Known limit, and the same as clawpit's.

### 6. Options

| Option | Gauges plugin | Why |
|---|---|---|
| `animations` (boolean, on) | yes | the needle settles; LOCKED "Animations switch" |
| `bench` | no | it draws crabs in the Agents pane |
| setup offers, `/clawpit-setup` | no | they are about clawpit and savvy settings |

### 7. LOCKED rulings that follow the panel

They hold for the gauges plugin as they stand, because it draws with the same code: "Panel above the prompt" (dynamic columns, the core five), "Stable column order", "Column widths follow need", "Slack counts from the floor", "So-whats drop whole clauses", "Cuts keep meaning", "Compact chip", "First column inset", "Context column runs /context", "Limit columns run /usage", "Failed tests named", "Colours", "Animation", "Animations switch", and the AGENTS.md design guardrails.

They do not apply (they are about the crew or the pane): the Agents pane, Hydra plan, agents section, chips, crab costume, failed chip, session need, session cost board, "Session column opens the cost list", setup, takeover.

A new ruling for `LOCKED.md`, with the maintainer's OK, dated: **"Gauges alone"**, the contents of sections 2 and 4.

### 8. Tests

- **clawpit** (`plugin/tests/`, test first): with `alone`, the session column and the one-line session item carry no press. `crewOf` of nothing equals `EMPTY_CREW`. Without `alone`, today's trees are unchanged (the existing tests).
- **gauges** (`gauges/tests/`, `claude plugin test gauges`): desktop draws the gauge columns and no crew; terminal and a survey pass; the size press steps full, gauges, line and is stored; each press runs its one command; `AbovePromptList` drops the gauges row when a clawpit row is present and keeps all rows when it is not; animations off sends no settles; the tick is off while idle, 1 Hz in a turn.
- **Sync:** `scripts/gauges-sync.test.mjs` (section 3).
- **Visual:** `tests/visual/panel.spec.ts` gains `@shot` cases for `panelTree(viewOf(s, { crew: EMPTY_CREW, loops: STILL, alone: true }))` (the idle, busy, context90 and limitAhead fixtures), sizes `full` and `line`, 60 and 96 cells, dark and light, plus a structural case that nothing loops. It draws clawpit's `panelTree`, which the copy matches byte for byte. `EMPTY_CREW` and `STILL` come from `model.ts` (section 2).
- **Gate additions:** `claude plugin test gauges` and `claude plugin validate gauges` join the quality gate in `AGENTS.md`.

### 9. Mockup and previews

`design/mockups-all.html` gains one state, `?state=gauges`: the panel with no crew and no pane. Then `bash scripts/preview.sh` and `npm run refresh:visual`, per the preview rule.

### 10. Name and install line

Name: `clawpit-gauges` (folder `gauges/`, marketplace `clawpit`).

```
/plugin marketplace add nycom/clawpit
/plugin install clawpit-gauges@clawpit
```

README: a short "Gauges only" section under Install. clawpit users do not need it, and having both is harmless (section 4). It needs no savvy-progress. It says to turn skins' band off (`/skin band off`, skins 0.2.0) while skins still has one, and ponytail's (`/ponytail band off`, ponytail 5.3.3), since both draw the same readings. The same two lines join clawpit's own Install section, which lacks them today.

### 11. Timing with skins

The skins upgrade is on hold (skins `LOCKED.md`, "On hold", 2026-11-21): nothing is built until a decision after a week of the app's default, about 2026-11-28, and one path ("today's look with the polish") keeps the band. This build goes ahead now anyway, as the maintainer asked: the plugin must be installable before skins could drop the band, and if skins keeps its band, `clawpit-gauges` is simply an optional install that a skins user can skip.

If the band does leave (skins Task 13), these skins places name `clawpit-gauges@clawpit` instead of "a later standalone panel plugin" or "moved to clawpit":
- the technical design's removal row (`2026-11-21-skins-upgrade-technical-design.md:304`);
- the `/skin band` reply for one release (technical design `:312`, build plan M3);
- build plan Task 13, steps 5 and 6 (the README note);
- skins `LOCKED.md:26`.

Those changes are in the skins repository and are not part of this work.

## Not covered

- Holding `gauges/hooks/register.tsx` in sync with clawpit's usage wiring (section 5). Follow-up once both PRs merge: move the shared usage wiring into a copied module.
- Whether `r.plugin` is the bare `clawpit` in the live desktop app (the test kit says yes), and whether a large crew's tree can push clawpit's row past the band's limits so the gauges row shows instead. Both are checked in the app.
- The gauges on the terminal, VS Code and mobile.
- Stopping the gauges plugin's own work while clawpit draws (section 4).
- Windows: install only, nothing measured there.
