# clawpit: technical design

Date: 2026-11-21 · Status: draft for the maintainer's review · Build plan: [`2026-11-21-clawpit-build-plan.md`](2026-11-21-clawpit-build-plan.md)

The look is locked in [`docs/decisions/`](../decisions/) and drawn in [`design/mockups-all.html`](../../design/mockups-all.html). This document says how the mod is built to match it. Where the real renderer cannot draw the mockup, the difference is listed under "Deviations from the mockup".

Engine facts are cited as `d.ts:<line>`: the engine's own type file, `claude-code.d.ts`, as written by Claude Code 2.1.325 (the version the desktop app bundles). Re-check the lines after an app update.

## 1. Scope

clawpit is one plugin with two surfaces:

- **The panel**: an `AbovePrompt` row with dynamic gauge columns, the plan row, agent chips, and three sizes.
- **The Agents pane**: a `Pane` with the sections Needs you, Failed, Running and Ended, a log drawer, nested helpers and a crew bar.

It is a view. The crew data (the flow, the agent runs, the step reports) stays in savvy-progress, which keeps its two tools and its atoms. clawpit reads those atoms and gathers the session figures itself.

Out of scope: terminal drawing (on the terminal surface every clawpit hook returns `next(e)`), background shells and crons (they stay in savvy's own pane, see decision M4 in the build plan), Hebrew and RTL, any new model call.

## 2. Architecture and data flow

```
 savvy-progress (unchanged owner of the crew data)            the engine
 ┌───────────────────────────────────────────────┐   ┌───────────────────────────────┐
 │ tools: progress, step (+ reason, error)       │   │ session.measure  turn.start   │
 │ atoms: flow, agents, background, panel,       │   │ turn.complete    tool.call    │
 │        mainTurn                               │   │ agent.spawn      prompt.submit│
 └──────────────┬────────────────────────────────┘   │ state.set        $.session    │
     read flow, │agents          reads clawpit       │ $.store          $.clock      │
                │                `takeover`          └──────────────┬────────────────┘
                ▼                     ▲                             │ observers (never fail a call)
 ┌───────────────────────────────────────────────────────────────────────────────────┐
 │ clawpit  hooks/register.tsx  (wiring only)                                        │
 │                                                                                   │
 │  trackers (module memory, pure reducers)         atoms clawpit owns               │
 │   activity  steplog  eta  turn  tests            takeover  stats  ui  tick        │
 │   pace  context                                  idleSince                        │
 │        │                                              │                           │
 │        ▼                                              ▼                           │
 │  model.ts: crewOf(flow, agents, facts, now) ─► Crew   Stats, Ui                   │
 │        │                                              │                           │
 │        ├── loops.ts: pickLoops(crew, ui, busy, armed) ─► LoopPlan (one budget)    │
 │        │                                                                          │
 │        ├── panel/columns.ts + panel/fold.ts ─► panel/draw.ts ─► RenderElement     │
 │        └── pane/layout.ts ─► pane/draw.ts ─► RenderElement                        │
 │                                                                                   │
 │  ui.render AbovePrompt ──► panel tree      ui.render Pane ──► pane tree           │
 │  ui.message (Client presses) ──► ui atom, $.store, $.ui.open                      │
 └───────────────────────────────────────────────────────────────────────────────────┘
        │ Svg, Box, Button, Client(image.tsx)
        ▼
   desktop renderer: every Svg is an <img>; light/dark and reduced motion are CSS
   media queries inside each SVG document
```

Three rules hold the shape together:

1. **Everything below `register.tsx` is pure.** No `$`, no `h`, no value import from `claude-code`. Each module takes plain data and returns plain data or a plain `RenderElement` object (`{ type, props, children }`). That makes every module testable under `claude plugin test` and importable by the Node render harness (section 12).
2. **One dataset feeds both surfaces** (ALIGNMENT D1). `crewOf` runs once per render event and both draw modules take its `Crew`. Neither derives its own counts or time left.
3. **Facts that change per tool call live in module memory, not atoms.** A tool call writes no atom. The `tick` atom repaints them.

## 3. Plugin layout

The repo root is the dev workspace; the plugin lives in `plugin/`, so Node tooling (`node_modules`, Playwright) never sits inside the folder the engine loads.

```
.claude-plugin/marketplace.json      lists ./plugin
package.json                         dev only: Playwright, pixelmatch, pngjs (exact pins)
playwright.config.ts
plugin/
  .claude-plugin/plugin.json         name "clawpit", types "./types/index.d.ts", no userConfig
  hooks/hooks.json                   { "modules": ["./register.tsx"] }
  hooks/register.tsx                 atoms, observers, the two render hooks, ui.message
  hooks/tokens.ts                    colour, type, size, motion tokens; cssOf(used)
  hooks/text.ts                      oneLine, clip, xml, textWidth, fit, wrap, fmt*
  hooks/icons.ts                     icon set, toggle icon, dial, segmented bars, step blocks
  hooks/crab.ts                      the one crab
  hooks/track/activity.ts            tool call -> Activity, lines changed
  hooks/track/steplog.ts             agents-atom diff -> log lines
  hooks/track/tests.ts               Bash result -> TestStat
  hooks/track/eta.ts                 history, estimate, usually
  hooks/track/turn.ts                this turn, session totals, idleSince
  hooks/track/pace.ts                limit forecast
  hooks/track/context.ts             turns left, auto-compact, msgs share
  hooks/model.ts                     crewOf, roleOf, planOf
  hooks/loops.ts                     pickLoops, BUDGET
  hooks/panel/columns.ts             candidates, ranking, fit
  hooks/panel/fold.ts                size machine, settle
  hooks/panel/draw.ts                panelTree
  hooks/pane/layout.ts               sections, rows, budget
  hooks/pane/draw.ts                 paneTree
  hooks/client/image.tsx             the one Client module
  types/index.d.ts                   every shared type + PluginState
  tests/*.test.ts                    unit tests (claude plugin test)
  tests/fixtures/states.ts           named fixture states, shared with the visual suite
tests/visual/                        Playwright: harness, specs, baselines
tests/app-check/regions.json         crop boxes and masks for in-app screenshots
scripts/app-diff.mjs                 pixel diff for in-app screenshots
scripts/leak-check.sh, preview.sh    existing
```

## 4. Atoms

### Owned by clawpit (`plugin: 'clawpit'`)

| Key | Type | Written when | Read by |
|---|---|---|---|
| `takeover` | `boolean` | `true` at `session.start` on a desktop surface | savvy-progress (section 14) |
| `stats` | `Stats` | `session.measure`, main `turn.start`/`turn.complete`, at most once per second from the turn tracker while a main turn runs | panel |
| `ui` | `Ui` | Client presses (`view` by the `costs` and `crew` presses), pane open/close, `session.start` (restores `size` from `$.store`) | panel, pane |
| `tick` | `number` | 1 Hz while a main turn or any agent runs; once a minute while a tests column, an armed failed chip or a limit column is on screen; never otherwise | panel, pane |
| `idleSince` | `number \| null` | main `turn.complete` sets it, main `turn.start` clears it | failed-chip arming |

### Read from savvy-progress (`plugin: 'savvy-progress'`)

| Key | Type (declared in clawpit's `types/index.d.ts`, as savvy declares skins') | Used for |
|---|---|---|
| `flow` | `SavvyFlow \| null` | the plan row, the pane title, task states |
| `agents` | `SavvyRun[]` | every agent row and chip |

### Read from ponytail (`plugin: 'ponytail'`, decision M5)

| Key | Type | Used for |
|---|---|---|
| `band` | `PonytailBand` (`reused`, `created`, `openCallers`, all `string[]`) | the reuse and callers columns; read at render, so it needs no observer |

`background`, `panel` and `mainTurn` are not read: clawpit hears `turn.start` itself, keeps its own fold state, and leaves background tasks to savvy's pane. Cross-plugin reads are an engine rule ("any plugin reads any value; its owner alone writes it", `d.ts:3629-3635`), and savvy's read of `{ plugin: 'skins', key: 'theme' }` shows it working today.

### `$.store` (persisted, per plugin, 4 MiB, `d.ts:3603-3627`)

| Key | Value | Rule |
|---|---|---|
| `size` | `Size` | written only by a toggle press |
| `eta:<key>` | `number[]`, the last 20 durations in ms | written on a recorded run; loaded into memory at `session.start`, never read during render |
| `paneAutoOpenedFor` | the session id (`$.session.id()`) | written when the pane opens by itself; that session never opens it by itself again, a reload included |

Drawer and helper-fold state is in the `ui` atom only and is never persisted.

## 5. Data model

All in `plugin/types/index.d.ts`.

```ts
export type Role = 'implement' | 'review' | 'test' | 'explore' | 'design'
export type Prop = 'search' | 'read' | 'write' | 'think' | 'wait' | 'fail' | 'done' | 'none'
export type Size = 'full' | 'gauges' | 'line'
export type CrabSize = 'S' | 'M' | 'L'                       // .75, 1, 1.5 of 34x28

export type ActivityKind = 'search' | 'read' | 'edit' | 'run' | 'browse' | 'think' | 'wait' | 'spawn' | 'other'
export type Activity = { kind: ActivityKind; verb: string; target: string; at: number }
export type LogKind = 'step' | 'try' | 'fail' | 'ask' | 'helper'
export type LogLine = { kind: LogKind; text: string; at: number }

export type Eta = { kind: 'none' } | { kind: 'left'; minutes: number; slow: boolean } | { kind: 'over' }

export type CrewState = 'need' | 'failed' | 'running' | 'ended'
export type CrewAgent = {
  id: string; title: string; role: Role; model: string
  state: CrewState; struggling: boolean; tries: number
  prop: Prop; activity: Activity | null
  question?: string; reason?: string; errorLine?: string
  stepDone: number; stepTotal: number
  eta: Eta; usuallyMin: number | null
  startedAt: number; endedAt?: number; waitingSince?: number
  contextPct: number; costUsd: number
  parentId?: string; helpers: CrewAgent[]; log: LogLine[]
}
export type PlanPhase = 'plan' | 'delegate' | 'review' | 'close'
export type PlanTask = { name: string; state: 'done' | 'live' | 'need' | 'failed' | 'todo'; role?: Role; fill: number }
export type Plan = { title: string; phase: PlanPhase; done: number; total: number; tasks: PlanTask[] }
export type Crew = {
  title: string                      // flow title, or "Subagents"
  agents: CrewAgent[]                // top level, in section order: need, failed, running
  ended: CrewAgent[]
  counts: { need: number; failed: number; running: number; done: number }
  costUsd: number; leftMin: number | null
  plan: Plan | null
}

export type ContextStat = { pct: number; msgsPct: number | null; turnsLeft: number | null; autoPct: number | null; alarm: boolean }
export type LimitStat = { kind: 'five_hour' | 'seven_day'; pct: number; pacePct: number | null; projected: number | null; ahead: boolean; hot: boolean }
export type TurnStat = { startedAt: number; added: number; removed: number; costUsd: number | null }
export type TestStat = { passed: number; failed: number; at: number; failedNames?: string[] }   // up to 5, only when the run named any
export type CodeStat = { reusePct: number | null; reused: number; created: number; callers: string[] }
export type SessionStat = { costUsd: number | null; lastTurnUsd: number | null; turns: number; tokens: number; agentMs: number; turnCosts?: number[] }   // turnCosts: the last 20 main turns' costs, newest last
export type Stats = { context: ContextStat | null; limits: LimitStat[]; turn: TurnStat | null; tests: TestStat | null; session: SessionStat; code: CodeStat | null }

export type ColumnKey = 'context' | 'turn' | '5h' | '7d' | 'plan' | 'session' | 'tests' | 'tokens' | 'agent' | 'reuse' | 'callers' | 'agents'
export type Column = { key: ColumnKey; priority: number }
export type Ui = { size: Size; open: string | null; shut: string[]; paneOpen: boolean; view?: 'crew' | 'costs' }   // view: the pane's; absent reads as crew
export type Mascot = 'hop' | 'sway' | 'walk' | 'still'
export type LoopPlan = { walkers: string[]; chipPulse: boolean; ring: string | null; mascot: Mascot; count: number }
export type Settle = { from: number; to: number }
export type ImageProps = { source: string; alt: string; width: number; height: number; press?: string; hover?: boolean; interactive?: boolean; zones?: { to: number; press: string }[] }

export type SavvyRun = { /* the fields of savvy's AgentRun that clawpit reads */
  id: string; agentId?: string; type: string; description: string; model: string
  status: 'running' | 'done' | 'failed'; startedAt: number; endedAt?: number
  contextTokens: number; contextMax: number; costUsd: number
  stepDone?: number; stepTotal?: number; stepNote?: string
  failedAttempts?: number; blocked?: string; heldDone?: boolean
  failNote?: string; failLine?: string }
export type PonytailBand = { reused: string[]; created: string[]; openCallers: string[] }
export type SavvyFlow = { title: string; total: number; done: number; phase: 'plan' | 'design' | 'delegate' | 'review' | 'close'; isFinished: boolean; tasks: { title: string }[] }
```

### Deriving `Crew` (`model.ts`)

- **State**: `blocked` set and `status === 'running'` → `need`. `status === 'failed'` and `heldDone` → `failed`. `status === 'running'` → `running`. Anything else that has ended → `ended`. So a failed run moves to Ended when savvy clears `heldDone` at the next composer or bridge prompt, which is the locked rule.
- **Struggling**: `state === 'running'` and `failedAttempts >= 3`. `tries` is `failedAttempts ?? 0`.
- **Role** (`roleOf(type, description)`): by type first: `implementer` → implement; `reviewer` or a type ending `code-reviewer` → review; `validator` → test; `designer`, `Plan`, `architect-reviewer` → design; `Explore`, `researcher`, `dev-researcher` → explore. Otherwise by the first match in the lower-cased description: `implement|fix|build|merge|wire` → implement; `review|recheck|audit` → review; `test|validat|e2e|verify` → test; `design|plan|spec` → design. Otherwise explore.
- **Prop**: `need` → `wait`; `failed` → `fail`; ended and done → `done`; else from the activity kind: `search`, `browse` → `search`; `read` → `read`; `edit` → `write`; `think` → `think`; `run`, `spawn`, `other`, none → `none`.
- **Helpers**: a run whose `parentId` names a run that is still `need` or `running` nests under it. A child whose parent has ended is listed flat. A run nests under a live parent up to two levels: a helper of a helper nests under its helper. A waiting or failed helper counts in `alertsOf` over every nested helper (`helpersOf`). The parent link comes from clawpit's own `agent.spawn` observer (`parentAgentId`, `d.ts:341`), kept in a module map; savvy does not record it.
- **Waiting since** (`waitingSince`, set only on `need`): the `at` of the run's newest `ask` log line, else `startedAt`. The pane's "waiting Nm" and the ring's "longest waiter" read it.
- **Order**: need (longest waiting first), failed (newest first), running (struggling first, then newest first). `ended` newest first.
- **`leftMin`**: the largest `minutes` among `running` agents whose `eta.kind === 'left'`; `null` when none has an estimate. This one number is used by the plan line, the plan column and the pane summary.
- **Plan** (`planOf`): `null` when `flow` is `null` or `isFinished`. Phase `design` maps to `plan`. For each flow task, the newest run whose normalised description equals or starts with the task title gives the state: done run → `done`; `need` → `need`; `failed` → `failed`; running → `live` with `fill = max(0.08, stepDone / stepTotal)` (0.08 when no steps). No run → `todo`. If fewer tasks are `done` than `flow.done`, the earliest `todo` tasks are marked `done` until the counts match.
- **Title**: `flow.title` when a plan exists, else `"Subagents"`.

## 6. Trackers: exact rules

Every tracker is a module of pure functions over a plain state object that `register.tsx` holds. Every string that came from outside (paths, commands, notes, questions, error lines) passes `oneLine` (control characters and newlines removed, whitespace collapsed) before it is stored, and `clip` when drawn.

### 6.1 Activity and lines changed (`track/activity.ts`)

Source: a catch-all `tool.call` observer. The input carries the loop's `agentId`, absent on the main loop (`ToolCallInput = ToolCallEnvelope & AgentLoop & ToolRequestMeta`, `d.ts:14637`; `AgentLoop.agentId`, `d.ts:214-224`), so activity is per agent without any guess.

| Kind | Tools | Verb | Target |
|---|---|---|---|
| `search` | Grep, Glob | Searching | the pattern, quoted, then `in <path>` when given |
| `read` | Read | Reading | the path, last two segments |
| `edit` | Edit, Write, MultiEdit, NotebookEdit | Editing | the path, last two segments |
| `run` | Bash | Running | the command, first 40 characters |
| `browse` | WebFetch, WebSearch, any tool whose name contains `browser` or `chrome` | Browsing | the host, or the query |
| `spawn` | Agent | Starting | the description |
| `other` | anything else | the tool's own name | empty |

`think` is set at `turn.step` start for that loop when no tool has run in the step; `wait` is never set here (it comes from the run's `blocked`). Caps per agent: the last activity only, 50 file entries.

Lines changed, from the tool's result once `next(e)` resolves without `isError`:

- Edit and MultiEdit: count `structuredPatch[].lines` starting with `+` and with `-` (`d.ts:23071-23077`).
- Write with `type: 'update'`: the same. Write with `type: 'create'` returns an empty `structuredPatch`: use `gitDiff.additions` when present, else the number of lines in `content` (`d.ts:24062-24088`).
- Bash, notebook and staged (`staged: true`) edits count nothing.

### 6.2 Step log (`track/steplog.ts`)

Source: a `state.set` observer on `{ plugin: 'savvy-progress', key: 'agents' }` (`d.ts:13588-13597`), which hands every written value in order, so no intermediate step is lost to a coalesced render. clawpit never rewrites the value. `diff(prev, next, at)` appends, per run:

| Change | Line |
|---|---|
| `stepNote` changed and non-empty | `step`: the note |
| `failedAttempts` rose | `try`: `Try N failed: <failNote or stepNote>` |
| `blocked` became non-empty | `ask`: `Asked: <question>` |
| `status` became `failed` | `fail`: `Failed at step <stepDone + 1> of <stepTotal>: <failNote or stepNote>` (without "at step…" when there are no steps) |
| a helper's `status` became `failed` | on the parent, `helper`: `Helper "<title>" failed after m:ss: <reason>` |

Cap: 30 lines per agent, oldest dropped. Newest first when drawn. Runs that leave the atom drop their log.

### 6.3 ETA (`track/eta.ts`)

- **Key**: `type · model · stage`, where `stage` is the first of `implement, review, fix, validate, recheck, merge, docs` found as a word in the description, else empty.
- **Record**: on an agent's `turn.complete` with `reason === 'answer'` (`d.ts:15441`), the first time only for that agent id, `durationMs` is appended to all three levels: the full key, `type · model`, `type`. Each list keeps its last 20. Failed, aborted and resumed runs record nothing.
- **Estimate** (`estimate(history, key, elapsedMs)`): take the finest level with at least 3 runs. None → `{ kind: 'none' }`. Let `med` be the median and `p80` the 80th percentile (nearest rank) of that list.
  - `elapsed <= med` → `{ kind: 'left', minutes: ceil((med - elapsed) / 60000), slow: false }`
  - `med < elapsed <= p80` → `{ kind: 'left', minutes: ceil((p80 - elapsed) / 60000), slow: true }`
  - `elapsed > p80` → `{ kind: 'over' }`
- **Wording**: `left` with `minutes >= 1` → `~Nm left`; `minutes` 0 is not possible from `ceil` unless elapsed equals the target, and reads `<1m left`. `slow` adds the word "slower" in `warn`. `over` reads "slower" with no number. `none` shows the running clock, `m:ss`.
- **Usually** (`usually(history, key)`): the median of the same level, in whole minutes, or `null`.
- **Known limit**: two windows doing read-modify-write on one key can lose a sample.

### 6.4 This turn and the session (`track/turn.ts`)

`turn.start` has no timestamp (`d.ts:15492-15516`) and no turn event carries dollars (`TurnCompleteFields`, `d.ts:15383-15429`), so:

- Main `turn.start` (no `agentId`): `startedAt = $.clock.now()`, `cost0 = usage.cost?.usd`, lines zeroed, `idleSince = null`.
- While the turn runs: lines add up from 6.1 for every loop (subagent edits count toward the turn they ran in). Live cost is `usage.cost.usd - cost0`, refreshed on each `session.measure` and after each main-loop tool call; `null` where the host keeps no ledger (`cost?`, `d.ts:13078-13083`).
- Main `turn.complete`: `lastTurnUsd` = the final delta, `turns += 1`, `agentMs += durationMs`, `idleSince = now`, `turn = null`. A delta that is not `null` is pushed onto `turnCosts`, which keeps the last 20.
- Every `turn.complete` (main or agent) with `usage`: `tokens +=` input + output + cache read + cache creation.
- Session figures count from this plugin load; a resumed session starts them at zero. The session cost itself is the engine's running total and is not reset.

### 6.5 Tests (`track/tests.ts`)

On a Bash result (`stdout`, `stderr`, `d.ts:22871-22875`) from any loop:

1. The command must match `/\b(vitest|jest|pytest|playwright|mocha|ava|go test|cargo test|mvn\b.*\btest|gradle\b.*\btest|(npm|pnpm|yarn|bun)( run)? test|claude plugin test)\b/`.
2. In `stdout` then `stderr`, take the last match of `/(\d+)\s+pass(?:ed|ing)?\b/i` and of `/(\d+)\s+fail(?:ed|ing|ures?)?\b/i`. Maven's `Tests run: A, Failures: B, Errors: C` gives passed `A - B - C`, failed `B + C`.
3. With neither count found, nothing is recorded. Otherwise `tests = { passed, failed, at }`. node:test's `ℹ pass N` / `ℹ fail N` count too.
4. When `failed > 0`, `failedNames` keeps up to 5 failing test names, one per line, stdout then stderr, deduplicated, each `oneLine`d and cut to 80: `(fail) <name>` (bun, `claude plugin test`), `✖ <name>` (node:test), `FAILED <id>` (pytest), `✕` or `× <name>` (jest, vitest), `✘ … › <name>` (playwright); a trailing duration is dropped.

**Valid until the next edit**: any successful `edit`-kind tool call from any loop sets `tests = null`. The column shows only while `tests` is non-null. An edit made through Bash is not seen; that is a known gap.

### 6.6 Pace forecast (`track/pace.ts`)

`rateLimits[]` gives `{ kind, percentUsed, resetsAt? }` with `kind` a plain string (`d.ts:12631-12646`); a window past its reset leaves the list. There are no per-model limits.

For `five_hour` (18,000,000 ms) and `seven_day` (604,800,000 ms):

```
start    = Date.parse(resetsAt) - length
elapsed  = clamp((now - start) / length, 0, 1)
pacePct  = elapsed * 100                      // the ghost needle
projected = percentUsed / elapsed             // where the window ends at this rate
ahead    = projected > 100
hot      = percentUsed >= 50 || ahead
```

- **The 10%-elapsed floor**: when `resetsAt` is missing or `elapsed < 0.10`, there is no forecast: `pacePct`, `projected` are `null`, `ahead` is `false`, no ghost needle is drawn, and the so-what line is empty.
- **Wording**: with a forecast the so-what reads `on pace for N%`, `N = round(projected)`, shown as `200%+` past 200. It is in `warn` when `ahead`, else `muted`. It is always an estimate and never a clock time.
- **Colour**: the value and arc are `warn` when `ahead` or `percentUsed >= 80`, else `accent`.
- A kind missing from the list has no column. `spend_limit` is ignored.

### 6.7 Context (`track/context.ts`)

`usage.context` is `{ tokens?, window, percent? }` against the model window, absent before the first response and right after a compaction (`d.ts:12240-12263`). The breakdown measures against the compaction window: `rawMaxTokens`, `percentage`, `autoCompactThreshold?`, `isAutoCompactEnabled`, `categories` (`d.ts:12154-12224`). clawpit asks for `{ breakdown: 'summary' }` on each `session.measure` (after each main turn, `d.ts:4738-4748`), never in render.

- **`pct`**: the breakdown's `percentage` when a breakdown is held, so the dial and the threshold share one scale; else `context.percent`; else the column reads "—" with "no reading yet".
- **Auto-compact %**: `autoPct = round(autoCompactThreshold / rawMaxTokens * 100)` when `isAutoCompactEnabled` and the threshold is present, else `null`.
- **Alarm**: `pct >= min(90, (autoPct ?? 97) - 7)`. In alarm the value turns `er`, the so-what reads `auto-compacts at N%` (or `context nearly full` when `autoPct` is `null`), and the Compact Button reads "Compact now".
- **Turns left**: at each main `turn.complete`, record `totalTokens`. With fewer than 3 recorded turns the so-what reads `learning your pace`; after that, with `turnsLeft` null, the so-what is only `M% msgs`, or empty when the Messages row is missing. Otherwise `growth` = the median of the positive deltas over the last 10 turns, and `turnsLeft = floor((limit - totalTokens) / growth)` with `limit = autoCompactThreshold ?? rawMaxTokens`, floored at 0; no positive delta → `null`. A drop in `totalTokens` (a compaction) clears the history.
- **Msgs share**: `msgsPct = round(tokens of the 'used' row named "Messages" / rawMaxTokens * 100)`. The engine stamps no kind for that row (`ContextCategoryKind`, `d.ts:2226-2232`), so the name is the only handle; when the row is missing the "· M% msgs" part is dropped.
- So-what, calm: `~N turns · M% msgs`.

### 6.8 The failed chip's idle timer

```
armed = a main turn is running
        || (idleSince !== null && now - idleSince < 600_000)
```

- Set by 6.4. At main `turn.complete` one `$.clock.after(600_000)` wake is scheduled; it writes `tick` once, so the chip and the folded crab redraw still. A new turn cancels it.
- `armed` is a prop of the drawing, so the pulse stops by a redraw, never by a timer inside the image.
- A failed run leaves at the next composer or bridge prompt (savvy clears `heldDone`), so re-arming applies only to a turn that starts without a prompt.
- Struggling never pulses.

### 6.9 Reuse and callers open (`track/code.ts`, decision M5)

`codeOf(band)` reads ponytail's `band` atom: anything but an object gives `null`; a field that is not an array counts as empty; non-strings are dropped; each ref is cleaned like any outside string and cut at 120.

- `reusePct = round(reused / (reused + created) * 100)`, `null` under 3 functions (ponytail's own `percent`).
- `callers` = `openCallers`, the `file:line` refs to a removed definition that is still called.

## 7. The panel

### 7.1 Columns (`panel/columns.ts`)

`candidates(stats, crew, size, busy)` returns the columns that have something to say:

| Key | Present when | Priority |
|---|---|---|
| `context` | always | 100 |
| `agents` | `size !== 'full'` and the crew has agents | 99 |
| `plan` | `size !== 'full'` and `crew.plan` | 97 |
| `5h` | a `five_hour` limit exists | 96 hot, 40 calm |
| `turn` | `busy` | 95 |
| `7d` | a `seven_day` limit exists | 90 hot, 35 calm |
| `session` | always | 80 |
| `tests` | `stats.tests` | 20 busy, 45 idle |
| `tokens` | `session.turns >= 3` | 30 |
| `agent` | `session.turns >= 3` | 28 |
| `reuse` | `stats.code.reusePct` is not `null` | 12 |
| `callers` | `stats.code.callers` is non-empty | 10 |

`maxColumns(bodyColumns) = clamp(floor((bodyColumns - 4) / 14), 2, 6)`: one column per 14 cells, 4 cells kept for the toggle (`bodyColumns` is already net of the engine's own mark, `d.ts:11411-11419`). `fit` keeps the top `max` by priority, then lays them out in the fixed order `context, turn, 5h, 7d, plan, session, tests, tokens, agent, reuse, callers, agents`. Reuse and callers are the two lowest: they show only when every other column has room, and step aside first.

### 7.2 Sizes (`panel/fold.ts`)

`nextSize`: full → gauges → line → full. Only a toggle press changes it; the press also writes `$.store`. There is no automatic fold.

| Size | Rows |
|---|---|
| `full` | columns; then the plan row (line, bar, names) when a plan exists; then the chips |
| `gauges` | columns only; plan and agents are columns |
| `line` | one line: context dial, each hot limit, the plan's mini bar (or the session cost when there is no plan), then the agents crab at the far right |

The toggle shows the `er` dot when `size !== 'full'` and any agent is `need` or `failed`.

### 7.3 The tree (`panel/draw.ts`)

`panelTree(view): RenderElement`. Everything coloured is an SVG; the only host element with text is the Compact Button.

- **Row 1**: a Box row. Each column is a Box `width` in cells holding one image (label 11px, value 16/600 with its dial, so-what 11px). Images are drawn at `cells * 8.5` px, which is under the real cell width, so an image never shrinks; text is left-aligned, so the slack is padding. Dials are `image` Clients (the needle settle is a one-shot keyframe, 900 ms, with its start baked in from `settle`); every other cell is a plain Svg. The toggle is an `image` Client, 24×24, `press: 'size'`.
- **Compact**: from `pct >= 50`, a `Button` labelled "Compact" ("Compact now" in alarm) in an absolute Box inside the context column, right of the value on its line; never `dimColor`; `onPress` runs the engine's own `/compact` through `$.command.run`. When the column is narrower than the value plus the Button (guessed at its label plus one cell), the context column widens to fit it and the other columns share the rest.
- **Presses**: the context image presses `context`, the 5h and 7d images `usage`, the session image `costs`, so each is an `image` Client. A so-what of ` · `-joined clauses (context, this turn, session, limits) drops whole clauses right to left; a clause that does not fit goes whole.
- **Plan row** (`full`, with a plan): one image for the line (title, phase stepper, `N/M tasks · ~Xm left`), one for the segmented bar and names. The bar's fills grow by a 600 ms one-shot, so the bar is an `image` Client. Names show while each segment is at least 56px wide and there are at most 8 tasks; past 40 tasks the bar is three proportional parts (done, live, rest).
- **Chips** (`full`): the panel's helpers are every nested helper (`helpersOf`), so a helper of a helper that waits on you gets an alert chip and dresses the folded crab like a direct helper. One image per top-level agent, sorted need, failed, rest. All alert chips share one `image` Client (one clock for the pulse, one looping drawing); the image has 3px of padding for the halo. A walking chip is an `image` Client; a still chip is a plain Svg. Chips that do not fit two rows collapse into a `+N more` chip. A chip presses `open:<id>`; the shared alert image carries `zones` (each chip's right edge in px and its press) and presses the first alert by key; `+N more` and `+N need you` press `open`.
- **Folded agents column and one-line crab**: an `image` Client with `press: 'open'`; the crab's costume and motion come from `LoopPlan.mascot`, with 3px of padding for the hop and the stagger.
- On `hasSurvey` the hook returns `next(e)`. clawpit draws its own tree and does not nest what `next(e)` returns; other plugins' rows are stacked by the band itself (`AbovePromptList`, `d.ts:11453-11462`).

## 8. The Agents pane

### 8.1 Layout model (`pane/layout.ts`)

`paneLayout(crew, ui, loops, columns): PaneLayout` decides what is drawn, top to bottom:

1. the title (`crew.title`, 13/600), the crew bar (one segment per top-level agent, ended first, then needs-you agents followed by each waiting helper at any depth (red, `er`), then failed and running), the summary line (`N needs you · N failed · N running · N done · ≈$X · ~Nm left`, parts with a zero count for need and failed left out); the `N needs you` count includes waiting helpers;
2. **Needs you**: 62px rows;
3. **Failed N**: 62px rows, no ring;
4. **Running N**: 48px rows; under a row, its drawer when `ui.open === id`, then its helper rows (32px) unless its id is in `ui.shut`, then the "N helpers" toggle ("N helpers · M failed"; folded, also "· M needs you", in `er`); helper rows include helpers of helpers one level deeper on the same tree line;
5. **Ended N**: a toggle; 30px rows unless `'ended'` is in `ui.shut`. It starts shut.

With no agents at all the pane draws the empty state: crab L, still, "No agents yet", and under it one muted 12px line, "Agents you start show up here".

**The costs view** (`ui.view === 'costs'`) replaces all of the above: a back row (a left chevron and "Agents", press `crew`), then one plain image with "Session cost" (13/600), the total and the turn count ("$267 · 44 turns", or "no reading yet"), and one line per kept turn, newest first: "turn N · $X" (N counted back from `turns`; finished figures are exact, no "≈"); "No turns yet" when there are none.

**Budget.** Rows are taken in that order while they fit the bounds in section 11. The first that does not fit stops its section and adds `+N more`. Section heads, the title block and an open drawer are fixed and always drawn.

### 8.2 The tree (`pane/draw.ts`)

`paneTree(layout): RenderElement`.

- **A running row**: a Box row of two `image` Clients, both `press: 'row:<id>'`: the crab (38px cell; walks when its id is in `LoopPlan.walkers`) and the body. The body image is as wide as the pane (`columns * 8.5 - 38`) and lays out title, role tag, activity, the 88px reading column and the chevron itself, so the reading column sits at the image's right edge.
- **A needs-you row**: one `image` Client for the whole row (crab with the inverted "?", question, reading column), so the inset ring (2px, `er` 60%, the 1.2 s beat) is one drawing with one clock. Only the row named by `LoopPlan.ring` rings; other needs-you rows are tinted and still.
- **A failed row**: the same single image, tinted, no ring, dizzy eyes, the reason where the question goes, "failed" / "after m:ss" over `er` step blocks.
- **The drawer**: one plain Svg under the row: log lines newest first with ages, the error line in the monospace block when present, and the footer (`steps n/N`, `tries N`, `context N%`, `cost ≈$X`, `ran m:ss` for a failed run, `usually Nm`). The drawer opens still and ages read in whole minutes (`<1m`, `Nm`, the waiting-age format). Only a line under a second old fades in from the right (300 ms, 100 ms late) while older lines slide down one row; the image changes only when a line arrives or an age crosses a minute.
- **A waiting helper row**: tinted, reads `waiting Nm` with its question. The reading column shows at most 11 step blocks. The summary moves cost and time left to a second line when it does not fit.
- **Two-line text**: the question and the reason wrap in `wrap(text, widthPx, 2)` from `text.ts`, which measures with a per-character width table and ends the second line with "…".
- **Cuts**: a run cut to fewer than 8 characters before its "…" is dropped, with the " · " before it; a bare "…" is never drawn. A struggling or slow note is kept, cut if it must be. A cut activity, question or reason carries its full text (up to 300 characters) in a `<title>` around it and in the image `alt`; the image stays unframed, so it keeps its press.
- **Reading column with no estimate**: the clock (600) and a muted " so far", the activity fallback's words.
- **Drawer footer**: whole items per line; "usually Nm" is left out when it alone would take another line.
- **Jump in**: a needs-you row's `row:<id>` press also names the agent in the prompt; a helper that waits on you is pressable with `ask:<id>`, which only does that. The text is `@<title> `, inserted at the cursor with `$.prompt.fill`, and skipped when the draft already holds `@<title>`. The engine has no call that focuses the prompt box (`$.ui.focus` reaches only a plugin's own sites), so the person clicks into it.
- **Hover**: the `image` Client wraps its Svg in a Box with a `#80808014` background while the pointer is over it.

## 9. The Client module (`client/image.tsx`)

One module serves every Client in both surfaces.

```ts
// props: ImageProps
{ source: string; alt: string; width: number; height: number; press?: string; hover?: boolean; interactive?: boolean }
```

| Behaviour | Rule |
|---|---|
| Draws | `h('Svg', { source, alt, width, height })`, with `isInteractive: true` when `interactive` (a cut chip's `<title>` tooltip shows only then), wrapped in a Box when `hover` |
| Pointer | on a left `down`, when `press` is set, `surface.post({ press })`; with `zones`, the press of the zone under the pointer (its column scaled by `width / surface.columns`) (`d.ts:1655`, `d.ts:1662-1671`); on `enter`/`leave` with `hover`, `setState({ isHover })` |
| Keys | Enter or Space while focused posts the same press |
| Timers | none; `surface.every` is never called |

Why one module: a Svg is an image with no events, a Button holds only text, and a Client keeps its instance across redraws under one key (`d.ts:1562-1572`), so a looping image does not restart. The element table handed to a Client has no `Svg` entry (`ClientElements`, `d.ts:1474`), but the desktop draws one a module returns; savvy's `mark.tsx` relies on the same thing.

**Events** (`ui.message`, `d.ts:16175-16203`): `e.data.press` is one of

| Press | Effect |
|---|---|
| `size` | `ui.size = nextSize(ui.size)`; `$.store.set('size', …)` |
| `open` | `$.ui.open({ id: 'clawpit-agents', title: 'Agents' })` |
| `open:<id>` | `ui.open = id`, `ui.view = 'crew'`, then the same `$.ui.open` |
| `usage`, `context` | `$.command.run({ command })`, not awaited |
| `row:<id>` | `ui.open = ui.open === id ? null : id` |
| `kids:<id>` | toggle `<id>` in `ui.shut` |
| `ended` | toggle `'ended'` in `ui.shut` |
| `ask:<id>` | when `<id>` waits on you, insert `@<title> ` into the prompt (also done by `row:<id>` on such a run) |
| `costs` | `ui.view = 'costs'`; open the Agents pane |
| `crew` | `ui.view = 'crew'` |

The hook ignores a message whose `press` is not a string of one of these forms, and answers `{}`.

**The constant-props rule.** A looping Client's props may change only when its drawing's content changes. No prop derives from `tick`, from a clock finer than a minute, or from a counter. Test: build the tree twice, one second apart, with the same data; every looping Client's props are identical.

## 10. Loop budget

`loops.ts` is the only place that decides what moves. `pickLoops(crew, ui, busy, armed): LoopPlan`:

```
BUDGET = { walkers: 3, walkersOnBeat: 2, rings: 1, max: 8 }     // provisional until measured

working = busy || crew has an agent in 'running' or 'need'
beat    = crew has 'need' || (crew has 'failed' && armed)
if !working && !beat  -> { walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }

slots   = beat ? walkersOnBeat : walkers
walkers = first `slots` of: running top-level agents, newest first, then running helpers, newest first
          (helpers only when their parent's row is on screen and slots remain)
chipPulse = beat && ui.size === 'full'
ring      = ui.paneOpen && crew has 'need' ? the longest-waiting needs-you id : null
mascot    = ui.size === 'full' ? 'still'
          : crew has 'need' ? 'hop'
          : crew has 'failed' ? (armed ? 'sway' : 'still')
          : walkers.length ? 'walk' : 'still'
count     = looping drawings on screen:
            (full: walkers among top-level chips) + (paneOpen: walkers with a row on screen)
            + (chipPulse ? 1 : 0) + (ring ? 1 : 0) + (mascot !== 'still' ? 1 : 0)
```

- The same ids walk in the chip and in the row.
- If `count > BUDGET.max`, walkers are dropped from the end until it fits.
- Idle means no main turn and no running or waiting agent. Idle, the only thing that may loop is the armed failed pulse (chip, or the folded crab's stagger), for at most 10 minutes.
- Every loop is `steps()`. One-shot keyframes (needle settle, bar fill, drawer reveal, the done flag's 6 waves) are not loops.
- Both draw modules take the `LoopPlan`; neither chooses a loop on its own. Tests assert it at two levels: on `LoopPlan.count`, and in the rendered page by counting running infinite animations (section 12).
- The numbers in `BUDGET` are finalized by the measurement task (ANIMATION-LIMIT, "Measurement") before the build is called done.

## 11. Text and engine-size budgets

| Bound | Value | Enforced by |
|---|---|---|
| A Client's serialized props | 100,000 characters (`d.ts:1586-1592`) | `image()` builder throws in tests above 60,000 |
| An Svg source | 131,072 characters (`d.ts:13811-13814`) | the same builder |
| The pane tree, host side | 200,000 characters of JSON | `paneLayout` budget (savvy's `HOST_MAX`) |
| The pane tree, engine side | 90,000 counted characters: a Client's props, an Svg's alt, keys, labels, strings (savvy's `engineChars`, `ENGINE_MAX`) | `paneLayout` budget |
| The panel | `maxRows` rows (`d.ts:11399-11410`); the same two character bounds | chips collapse to `+N more` |
| Any outside string | `oneLine`, then `clip`: title 60, activity target 48, question and reason 160, error line 200, log line 120, task name 24 | `text.ts` |
| Per agent | 30 log lines, 50 files | trackers |
| Crew | the newest 200 runs (savvy's own cap) | savvy |

Because a Client's props count in full against the engine bound and a crab is about 1.5k characters, the budget, not the animation rule, is what limits a long roster. Each image carries only the CSS classes it uses (`cssOf(used)`).

## 12. Testing

Unit tests under everything, then three visual layers: Playwright on the render harness (automated, on every change), scripted window capture plus a pixel diff in the real app (once per hook-in and in the final verification), and the maintainer's short by-eye gate. Each test is owned by the task that owns the code.

1. **Unit** (`claude plugin test plugin`): every pure module, plus `register.tsx` against the engine's mock (`claude-code/testing`): observers, atoms, `ui.message`, the two render hooks mounted on `desktop`.
2. **Visual** (Playwright, `tests/visual/`):
   - **The harness** (`tests/visual/harness.ts`, test-only) turns a `RenderElement` tree into an HTML page: Box → flex container (`width` × 9.2px per cell, `height` × 18.4px per row, vertical gaps half a row), Text → span, Button → button, Svg → its markup **inline inside a shadow root** (so one image's `<style>` cannot touch another's), Client → its props drawn as an Svg (every clawpit Client's props are `ImageProps`). The panel sits on the measured surfaces `#252424` / `#faf9f5`, the pane on the same, at fixed widths.
   - **Stills**: `toHaveScreenshot` with `maxDiffPixelRatio: 0.01`, `animations: 'disabled'`, and `reducedMotion: 'reduce'` emulated. Dark and light come from `colorScheme` emulation, which the SVGs' own media queries answer.
   - **Fixtures** (`plugin/tests/fixtures/states.ts`): idle, busy, hydra, needs-you, failed, both, context-90, limit-ahead, the three sizes, pane with the drawer open, helpers, empty pane; each at a narrow and a wide width; each in dark and light.
   - **Motion**: with motion allowed, count the shadow roots holding at least one animation with infinite iterations. Idle must be 0. Each busy fixture must equal its `LoopPlan.count` and stay within `BUDGET.max`, and no infinite animation may use a non-`steps` timing function.
   - **Accessibility**: each text token against both surfaces from the ALIGNMENT table (4.5:1 for text, 3:1 for bare marks; the crab body and the role fills are the two exceptions ALIGNMENT lists under "Left as is"); every Svg and every `image` Client in every fixture has a non-empty `alt`.
   - **Mockup parity** is a review step, not a pixel diff, because the harness only approximates the host. Per state it compares four things against `design/mockups-all.html`: layout order, tokens used, wording, section order.
3. **In the app** (in-session tasks only, once per hook-in and again in the final verification):
   - **State** is driven by fixtures where possible: the build session spawns the fixture agents itself (a blocked step, a failed step with a reason and an error line, a `progress` flow), so the window under test is its own. Computer use is needed only for the two things a prompt cannot do: clicking the fold toggle and clicking a pane row.
   - **Capture** is scripted and deterministic: `scripts/app-capture.sh <task> <state>` finds the app's window id and runs `screencapture -l <id> -o -x` into `artifacts/app-checks/<task>/current/<state>.png`. The id comes from a small Swift helper over `CGWindowListCopyWindowInfo`, not from AppleScript: an Electron app is not scriptable, so AppleScript has no window id that `screencapture -l` accepts, and Swift ships with the command line tools. Screen Recording permission is a one-time grant by the maintainer.
   - **Diff**: `scripts/app-diff.mjs` crops each shot to the panel and pane regions (fractions of the window, in `tests/app-check/regions.json`), masks what legitimately changes (clocks, timers, costs, tokens), and compares with the accepted shot: pixelmatch threshold 0.1, at most 0.1% of pixels changed. The idle check is three shots two seconds apart with exactly zero changed pixels.
   - `artifacts/` is git-ignored and never committed: the shots show real session content.
4. **The maintainer's by-eye gate**, short: only what the app check flags as unsure.

### Real-renderer automation: blocked by design

Driving the app's own renderer from a test (Playwright over CDP) was checked by reading the app's code (Claude desktop 1.11492.5, Electron 45.2.1; nothing was launched) and is not possible:

- The Electron fuses `RunAsNode`, `EnableNodeCliInspectArguments` and `EnableNodeOptionsEnvironmentVariable` are off, so `_electron.launch` and `--inspect` cannot attach.
- The app's startup code exits with "refusing to start" when `--remote-debugging-port` or `--remote-debugging-pipe` is on the command line. The only bypass is a token signed with the vendor's key. The app's own Chromium-flag setting allows GPU and rendering switches only.
- Developer mode (`{"allowDevTools": true}` in the app's `developer_settings.json`, or Help → Enable Developer Mode) gives Inspect Element and an undocked DevTools window, with no port. It is off under a restricted or workspace policy.

So there are no real-DOM screenshots and no scripted trace. A manual DevTools Performance trace stays possible for the animation measurement, as a maintainer-run step that is undone afterwards.

Limits: the harness cannot prove the host's layout, the real cell width, or cost. Screenshots of the app cannot measure CPU or frame time; Activity Monitor, or the manual trace, covers that.

## 13. Light, dark and reduced motion

- **Colours are fixed** (LOCKED, "Colours"). `tokens.ts` holds the ALIGNMENT table as `[class, light, dark]` rows. `cssOf(used)` emits the light rules, then the dark rules inside `@media (prefers-color-scheme: dark)`, only for the classes the image uses. clawpit never reads skins' theme atom or any palette file.
- The engine's types hand a mod no light/dark flag and no reduced-motion flag (none found in the 2.1.325 types), so both are answered inside each SVG document by media queries, the way savvy's `paneCss` does today.
- `color-mix()` is not available for Box colours, and the SVG tints are pre-computed: the 28% segment tint, the 35% halo and the 60% ring are stored as rgba values per mode.
- **Reduced motion**: every image that animates ends its style with `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`. The needle then sits at its end value and the drawer is simply open.
- The two host elements that are not images (the hover wash, the Button) use a neutral grey alpha and the host's own button colours, which read in both modes.

## 14. Error handling

- **An observer error never fails a call.** Every observer has the shape `const out = await next(e); try { track(…) } catch (err) { note(err) } return out`. The tracker runs after the call has its answer and its throw is swallowed and counted. `next(e)` is always awaited and its result always returned unchanged.
- **A render hook that throws** is caught by a `.catch` handler that draws one plain line (`clawpit could not draw this panel: <kind>`), built from plain Box and Text data, so it cannot fail the way the drawing did.
- **A failed read** of a savvy atom (savvy not installed) yields `null` / `[]`: the panel still draws its gauges, and the pane draws the empty state.
- **A failed `$.session.usage()`** keeps the previous `stats`; a failed `$.store` call leaves the in-memory value and is retried at the next write.
- **Bad outside text** cannot blank a surface: `oneLine` strips control characters before storage and `xml` escapes at the draw.

## 15. What clawpit needs from savvy-progress

The change lives on a local branch of the claude-kit checkout and is never pushed (it is a fork of a public upstream).

**1. Switch savvy's own band and pane off while clawpit is loaded: read a clawpit atom, not a userConfig option.**

savvy reads `{ plugin: 'clawpit', key: 'takeover' }`. When it is `true`: the `AbovePrompt` hook returns `next(e)`, `autoOpen` returns early, and the crew button is not drawn. The tools, the atoms, the tick and the `/agents-info` pane (the home of background tasks) keep working.

Why the atom: it cannot drift. With clawpit absent or failing to load the value is never written, so savvy draws as today; with a config option the maintainer would have to keep two settings in step, and a clawpit that failed to load would leave no agent UI at all. It also matches how savvy already reads skins. Cost: an atom is held for the session, so disabling clawpit mid-session leaves savvy's band off until the next session.

**2. Failure reason and error line on the `step` tool.**

```diff
 // types/index.d.ts, AgentRun
+  /** Why the last failed attempt failed, one sentence, from the worker. */
+  failNote?: string
+  /** The error line, verbatim, from the worker. */
+  failLine?: string

 // types/index.d.ts, PluginState
+    clawpit: { takeover: boolean }

 // hooks/register.tsx, the step tool's inputSchema.properties
+  reason: { type: 'string', description: 'With failed: why this attempt failed, one sentence.' },
+  error:  { type: 'string', description: 'With failed: the exact error line, copied verbatim.' },

 // hooks/register.tsx, the STEP_TOOL handler, inside the run it builds
+  failNote: input.failed === true ? clip(oneLine(input.reason), 200) || a.failNote : isProgress ? undefined : a.failNote,
+  failLine: input.failed === true ? clip(oneLine(input.error), 300) || a.failLine : isProgress ? undefined : a.failLine,

 // hooks/register.tsx, STEP_BRIEF and the tool description gain one sentence
+ When an attempt fails, call it with failed: true, reason (one sentence) and error (the exact error line).

 // hooks/register.tsx, AbovePrompt hook, first line; autoOpen, first line
+  if (await read($, { plugin: 'clawpit', key: 'takeover' } as const)) return next(e)
```

The matching brief line, added to every worker brief in the build's Hydra run and proposed for Hydra's own briefs later: *"If an attempt fails, report it with the step tool: `failed: true`, `reason` (one sentence), `error` (the exact error line)."*

Without these fields the row and chip can only say "failed after m:ss" and "N failed tries"; with them they show the reason, and the drawer shows the error line.

## 16. Retirements and the file tree

| What | Mechanism (verified in the installed code) | Its information lives on in |
|---|---|---|
| ponytail's band | its band hook returns nothing while the file `.ponytail-band` in the user's Claude config folder holds `off` (ponytail 5.3.3 `hooks/band/register.tsx:89`; its own command writes the file) | session cost, last turn, tokens, turns, agent time: the `session`, `tokens`, `agent` and `tests` columns; reuse and callers-open in the `reuse` and `callers` columns, read from ponytail's atom, which updates with the band off |
| skins' usage footer | drawn only while the active skin's `prefs.band` is true (skins `hooks/register.tsx:737`; the toggle is in its settings) | context, 5h, 7d with pace: the gauge columns. skins keeps styling the transcript rows |
| the filetree fork | uninstall `filetree@nati-mods`, archive the fork's checkout, install upstream `data-goblin/claude-code-filetree` pinned at v0.8.5 with `start=off`, `work=off`, `shimmer=on` | upstream's own pane |

All three are operations with the maintainer present. The filetree option names were not verified against upstream's manifest here.

## 17. Deviations from the mockup

| # | Mockup | Built | Why |
|---|---|---|---|
| V1 | "waiting 0:42" ticks each second on the needs-you row | "waiting <1m", "waiting 3m" | the row is one looping image; a prop that changed every second would restart the ring. Decision M2 offers the alternative |
| V2 | every needs-you row rings | one ring, on the longest-waiting row | two images have two clocks and drift; one slot in the budget |
| V3 | drawer entries stagger in; height animates | one 300 ms reveal inside the image; the height jumps | height changes do not animate (ALIGNMENT, "Not buildable" 5) |
| V4 | focus rings on rows and the toggle | none; Enter and Space still work after a click | an image has no focus ring (item 4) |
| V5 | ellipsis and two-line clamp by CSS | cut by a width table against an assumed 8.5px cell | item 7 |
| V6 | "full in ~1h 35m", "fills Wed", "on pace · 3pm" | "on pace for N%" | the figure is account-wide and coarse; an estimate, not a clock time |
| V7 | chip text in Anthropic Sans | SF Pro inside images | item 3 |
| V8 | row hover wash 6% / 5% per mode | one neutral grey alpha | a Box colour cannot follow the mode |
| V9 | the title "Hydra · retro fixes" | the flow's own title, as the coordinator sent it | the data does not say who runs the flow |

## 18. Risks

| Risk | Likelihood | Handling |
|---|---|---|
| The real cell is not 8.5px, so images are short of, or wider than, their columns | high | one constant, `CELL_PX`, tuned in the first hook-in's by-eye check; images never exceed their Box, so the failure is a gap, not a clip |
| A Client returning `Svg` stops working in a later app version | low | the same trick carries savvy today; one module to change |
| clawpit's `state.set` observer is not called for another plugin's atom | low | fallback in the wiring task: diff `agents` at each render; documented loss of coalesced steps |
| Hook order between clawpit and other `AbovePrompt` plugins | medium | clawpit draws only its own row and never nests `next(e)`; checked in the app |
| The pane cannot know it is the front tab | certain | `paneOpen` counts an open pane as visible; hidden images pause themselves in Chromium |
| The engine-size bound at 30+ agents | medium | the budget test at 80 agents; `+N more` |
| The loop budget is unmeasured | certain | the measurement task finalizes `BUDGET`; tests read the constant |
| Monospace error line: Menlo may not resolve inside an image | unknown | checked in the app; falls back to the system face |
| savvy and clawpit drift (a renamed field in the fork) | low | `SavvyRun` lists exactly the fields read; a unit test feeds savvy's real fixture shape |
| Playwright baselines depend on the machine's fonts | certain | baselines are made and compared on the maintainer's Mac; CI runs the motion and accessibility specs only |
| An upstream savvy merge conflicts with the local diff | medium | the diff is about 12 lines in two files |

## 19. Not verified

- Nothing here has run in the app. Every engine fact is from the 2.1.325 type file or from savvy's working code.
- Whether `position: 'absolute'` on a Box (`d.ts:978`) draws on the desktop; the design does not depend on it.
- Whether a `tool.call` observer of one plugin sees calls another plugin's hook answers without `next` (it is not needed: the step log reads the atom).
- The breakdown's cost per call, and whether `session.measure` fires while only subagents run.
- Upstream filetree's option names and its behaviour in the app.
