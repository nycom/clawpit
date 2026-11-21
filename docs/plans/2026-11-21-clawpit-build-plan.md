# clawpit Implementation Plan

> **For whoever executes this:** work task by task, in order. Tasks 5 to 13 run as parallel workstreams (see "Hydra run"); every other task runs in the build session with the maintainer present. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build clawpit, a desktop mod that draws an instrument panel above the prompt and an Agents pane of pixel crabs, as a view on savvy-progress's crew data.

**Architecture:** One plugin in `plugin/`. `hooks/register.tsx` is wiring only (atoms, observers, two render hooks, Client presses); everything under it is pure functions over plain data that return plain `RenderElement` objects, so each module is tested headlessly and drawn by a Node render harness for Playwright. Crew data is read from savvy-progress's `flow` and `agents` atoms; session figures are gathered by clawpit's own observers.

**Tech Stack:** TypeScript function hooks for Claude Code 2.1.325 (desktop surface); `claude plugin test` and `claude plugin validate`; Node 20+ with `@playwright/test` 1.62.1 (1.52.0's browser download stalled; 1.62.1's Chromium was already cached), `pixelmatch` 6.0.0, `pngjs` 7.0.0 (dev only, exact pins); bash and Swift for window capture.

**Spec:** [`2026-11-21-clawpit-technical-design.md`](2026-11-21-clawpit-technical-design.md) ("the design", cited as `design §N`), with the locked decisions in [`docs/decisions/`](../decisions/) and the mockup [`design/mockups-all.html`](../../design/mockups-all.html).

## Global Constraints

- [`AGENTS.md`](../../AGENTS.md) binds every task: one branch per change, no commit to `main`, merge commits only, commit subjects `area: what changed` with no trailers, no tooling trace, leak check clean, ask before bending a decision.
- Nothing is pushed and no PR is opened without the maintainer's go. Work in the claude-kit checkout stays on a local branch and is never pushed.
- Fixed colours from the ALIGNMENT token table only. Light and dark by `@media (prefers-color-scheme: dark)` inside each SVG. Never read a skin's or a palette's colours.
- Colour is never the only signal: every state carries a word, an icon or a shape.
- Stepped loops only, 0 eased loops. Walkers: 3, or 2 on the beat. Nothing loops while idle, except an armed failed pulse for at most 10 minutes (600,000 ms).
- One needs-you beat: 1.2 s `steps(2)`. Walk: 0.5 s `steps(1)`. One-shots: 150 ms hover, 300 ms reveal, 600 ms bar fill, 900 ms needle settle, curve `cubic-bezier(.2,.8,.2,1)`.
- Every animated image ends its style with `@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}`.
- SVG icons, no glyphs as icons. Weights 400 and 600 only; 700 for 10px micro labels. Numbers tabular.
- Wording: an estimate is `~Nm left` or `<1m left`; a running clock is `m:ss`; an age is `Ns` or `Nm`; a stopped clock is `after m:ss`.
- "Compact now" is a Button and is never `dimColor`.
- Every module under `plugin/hooks/` except `register.tsx` and `client/image.tsx` is pure: no `$`, no `h`, no value import from `claude-code`; drawings are plain `{ type, props, children }` objects.
- Every outside string passes `oneLine` before it is stored and `clip` and `xml` when drawn.
- A looping Client's props never derive from `tick`, a clock finer than a minute, or a counter.
- An observer always returns `next(e)`'s result unchanged; a tracker error is swallowed.
- Bounds: Client props ≤ 60,000 characters (engine limit 100,000); pane tree ≤ 200,000 host characters and ≤ 90,000 engine-counted characters; per agent 30 log lines and 50 files.
- Columns are counted in cells: `clamp(floor((bodyColumns - 4) / 14), 2, 6)`. Images are drawn at `CELL_PX = 8.5` px per cell.
- The pane title with no plan is `Subagents`. The pane id is `clawpit-agents`, its tab title `Agents`.
- The preview rule: after every visual change, in the same change, refresh `design/mockups-all.html` if the design changed, run `bash scripts/preview.sh`, and refresh the Playwright baselines (`npm run refresh:visual` does the last two).
- The gate, called **G** below: `claude plugin validate plugin && claude plugin test plugin && npm run test:scripts && npm run test:visual && bash scripts/leak-check.sh`. It passes when validate reports no error, the unit run ends with `0 fail`, both npm scripts exit 0, and the last line is `leak-check: clean`.
- Screenshots of the real app live under the git-ignored `artifacts/` and are never committed.

## Review Focus

1. **A control character or XML metacharacter in a path, command, note, question or error line.** Expected: the surface still draws and the text shows cleaned. Pinned by Task 5 (`text: oneLine strips control characters`, `text: xml escapes the five characters`) and Task 12 (`panel: a hostile chip title still yields well-formed svg`).
2. **savvy-progress missing, or its runs in an older shape (no `failNote`, undefined step fields).** Expected: the panel draws its gauges, the pane draws the empty state, nothing throws. Pinned by Task 10 (`crewOf: tolerates a run with only the required fields`, `crewOf: null flow and empty agents give the empty crew`).
3. **80 agents with a drawer open.** Expected: both size bounds hold and the cut is a `+N more` line. Pinned by Task 10 (`paneLayout: 80 agents and an open drawer stay under both bounds`).
4. **No reading: `rateLimits` empty, a window gone after its reset, `resetsAt` absent, context absent right after a compaction, no cost ledger.** Expected: the column is absent or says "no reading yet"; never `NaN`, `Infinity` or `undefined` on screen. Pinned by Task 7 (`pace: no resetsAt gives no forecast`, `context: absent percent and no breakdown gives pct null`) and Task 9 (`columns: missing limits produce no limit column`).
5. **A tool result in a shape no tracker expects (a deny with no result, `structuredPatch` undefined, a null result).** Expected: the tool call returns exactly what `next(e)` returned. Pinned by Task 6 (`activity: junk results change nothing and do not throw`) and Task 14 (`wiring: a throwing tracker leaves the tool result untouched`).

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `.github/workflows/ci.yml` | 1 | scaffolding |
| `package.json`, `playwright.config.ts`, `tests/visual/harness.ts`, `tests/visual/harness.spec.ts` | 2 | the render harness |
| `scripts/app-diff.mjs`, `scripts/app-capture.sh`, `scripts/window-id.swift`, `tests/app-check/regions.json`, `scripts/*.test.mjs` | 3 | in-app capture and diff |
| `plugin/types/index.d.ts`, `plugin/tests/fixtures/states.ts` | 4 | the contract |
| `plugin/hooks/tokens.ts`, `text.ts`, `icons.ts`, `crab.ts` | 5 | the kit |
| `plugin/hooks/track/activity.ts`, `steplog.ts`, `tests.ts` | 6 | trackers A |
| `plugin/hooks/track/eta.ts`, `turn.ts`, `pace.ts`, `context.ts` | 7 | trackers B |
| `plugin/hooks/loops.ts` | 8 | the loop picker |
| `plugin/hooks/panel/columns.ts`, `fold.ts` | 9 | column fit and sizes |
| `plugin/hooks/model.ts`, `plugin/hooks/pane/layout.ts` | 10 | the crew model and pane layout |
| `plugin/hooks/panel/draw.ts` | 12 | the panel tree |
| `plugin/hooks/pane/draw.ts` | 13 | the pane tree |
| savvy-progress `hooks/register.tsx`, `types/index.d.ts` (claude-kit checkout) | 11 | step fields and takeover |
| `plugin/hooks/register.tsx`, `plugin/hooks/client/image.tsx` | 14 to 17 | wiring and hook-ins |

Every test file sits beside the task that owns its code: `plugin/tests/<module>.test.ts` for unit tests and `tests/visual/<area>.spec.ts` (baselines in `tests/visual/<area>.spec.ts-snapshots/`) for visual tests.

---

## Part A: foundations, in session

### Task 1: Plugin scaffolding and CI

**Files:**
- Create: `.claude-plugin/marketplace.json`, `plugin/.claude-plugin/plugin.json`, `plugin/hooks/hooks.json`, `plugin/hooks/register.tsx`, `plugin/tests/scaffold.test.ts`, `.github/workflows/ci.yml`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: a plugin named `clawpit` that loads and registers nothing yet; `export const register: Register` in `plugin/hooks/register.tsx`.

- [ ] **Step 1: Write the failing test** in `plugin/tests/scaffold.test.ts`

```ts
import { test, expect } from 'claude-code/testing'
test('scaffold: the plugin loads and draws nothing above the prompt', async $ => {
  const ui = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt' })
  expect(await ui.find({ key: 'clawpit-panel' })).toBeUndefined()
  await ui.unmount()
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: it fails, because `plugin/` has no manifest.
- [ ] **Step 3: Create the manifest and the empty module.** `plugin.json`: `name` `clawpit`, the README's first sentence as `description`, `types` `./types/index.d.ts`, `license` `MIT`, no `version`, no `userConfig`. `hooks.json`: `{ "modules": ["./register.tsx"] }`. `register.tsx`: `export const register: Register = () => {}`. `marketplace.json`: one plugin, `name` `clawpit`, `source` `./plugin`. Add `node_modules/`, `artifacts/`, `test-results/`, `playwright-report/` to `.gitignore`.
- [ ] **Step 4: Run** `claude plugin validate plugin && claude plugin test plugin`. Expected: validate reports no error; `1 pass`, `0 fail`.
- [ ] **Step 5: Add CI.** `.github/workflows/ci.yml`, one job on `macos-latest`, on pull requests: `npm ci`, `npx playwright install chromium`, `npm run test:scripts`, `npm run test:visual -- --grep-invert @shot`, `bash scripts/leak-check.sh`. Screenshot comparisons (`@shot`) and `claude plugin test` are local gates: baselines depend on the machine's fonts, and the CLI is not on the runner. The job is committed now and goes green once Task 2 adds the scripts.
- [ ] **Step 6: Commit**

```bash
git add .claude-plugin plugin .github .gitignore
git commit -m "plugin: add the manifest, an empty hooks module and CI"
```

### Task 2: The render harness and Playwright

**Files:**
- Create: `package.json`, `package-lock.json`, `playwright.config.ts`, `tests/visual/harness.ts`, `tests/visual/harness.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `tests/visual/harness.ts`:
  - `type Node = string | { type: string; props?: Record<string, unknown>; children?: Node[] }`
  - `pageOf(tree: Node, opts: { surface: 'panel' | 'pane'; widthCells: number }): string`, a whole HTML document
  - `show(page: Page, tree: Node, opts: { surface: 'panel' | 'pane'; widthCells: number; theme: 'dark' | 'light'; motion?: boolean }): Promise<void>`: sets the content, emulates `colorScheme`, and emulates `reducedMotion: 'reduce'` unless `motion` is true
  - `loops(page: Page): Promise<{ drawings: number; eased: number }>`: shadow roots with at least one animation of infinite iterations, and how many such animations have a timing function that does not start with `steps`
  - `alts(tree: Node): string[]`: the `alt` of every `Svg` node and of every `Client` node's `props.props`
  - constants `CELL_W = 9.2`, `ROW_H = 18.4`
- npm scripts: `test:visual` = `playwright test`; `test:scripts` = `node --test scripts/`; `refresh:visual` = `playwright test --update-snapshots && bash scripts/preview.sh`; `app-diff` = `node scripts/app-diff.mjs`.

Harness rules (design §12): Box → `div` with `display:flex`, `flex-direction` from the prop, `width` × `CELL_W` px, `height` × `ROW_H` px, horizontal gap and padding × `CELL_W`, vertical × `ROW_H / 2`, `flexGrow` passed through, `backgroundColor` passed through. Text → `span`. Button → `button`. Svg → a `div` of its `width` × `height` px whose shadow root holds the markup. Client → the same, from `props.props`. The body background is `#252424` in dark and `#faf9f5` in light; the page width is `widthCells * CELL_W`.

- [ ] **Step 1: Write the failing tests** in `tests/visual/harness.spec.ts`

```ts
const img = (css: string) => ({ type: 'Svg', props: { alt: 'a', width: 20, height: 20,
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><style>${css}</style><rect class="x" width="20" height="20"/></svg>` } })
test('harness: a looping image counts as one drawing, a still one as none', async ({ page }) => {
  await show(page, { type: 'Box', children: [img('.x{animation:a 1s steps(2) infinite}@keyframes a{50%{opacity:0}}'), img('')] },
    { surface: 'panel', widthCells: 40, theme: 'dark', motion: true })
  expect(await loops(page)).toEqual({ drawings: 1, eased: 0 })
})
test('harness: an eased loop is reported as eased', async ({ page }) => {
  await show(page, img('.x{animation:a 1s ease-in-out infinite}@keyframes a{50%{opacity:0}}'), { surface: 'panel', widthCells: 40, theme: 'dark', motion: true })
  expect((await loops(page)).eased).toBe(1)
})
test('harness: one image\'s style does not reach the next', async ({ page }) => {
  await show(page, { type: 'Box', children: [img('.x{fill:#ff0000}'), img('')] }, { surface: 'panel', widthCells: 40, theme: 'dark' })
  const fills = await page.evaluate(() => [...document.querySelectorAll('[data-svg]')].map(d => getComputedStyle(d.shadowRoot!.querySelector('rect')!).fill))
  expect(fills[0]).toBe('rgb(255, 0, 0)'); expect(fills[1]).not.toBe('rgb(255, 0, 0)')
})
test('harness: a Client draws its props as an image, and alts lists it', async ({ page }) => {
  const c = { type: 'Client', props: { key: 'k', module: './client/image.tsx', props: img('').props } }
  await show(page, c, { surface: 'pane', widthCells: 44, theme: 'light' })
  expect(await page.locator('[data-svg]').count()).toBe(1); expect(alts(c)).toEqual(['a'])
})
test('harness: a Box is as wide as its cells', async ({ page }) => {
  await show(page, { type: 'Box', props: { width: 10, key: 'b' }, children: ['x'] }, { surface: 'panel', widthCells: 40, theme: 'dark' })
  expect((await page.locator('[data-key="b"]').boundingBox())!.width).toBeCloseTo(92, 0)
})
```

- [ ] **Step 2: Install and run.** `npm install --save-exact --save-dev @playwright/test@1.52.0 pixelmatch@6.0.0 pngjs@7.0.0`, `npx playwright install chromium`, `npm run test:visual`. Expected: 5 failures, `show` is not defined.
- [ ] **Step 3: Implement `tests/visual/harness.ts`** to the interface and rules above. `playwright.config.ts`: `testDir: 'tests/visual'`, one Chromium project, `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' }`, `deviceScaleFactor: 2`.
- [ ] **Step 4: Run** `npm run test:visual`. Expected: `5 passed`.
- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json playwright.config.ts tests/visual
git commit -m "tests: add the render harness and the visual test runner"
```

### Task 3: In-app capture and pixel diff

**Files:**
- Create: `scripts/app-diff.mjs`, `scripts/app-diff.test.mjs`, `scripts/app-capture.sh`, `scripts/window-id.swift`, `scripts/app-capture.test.mjs`, `tests/app-check/regions.json`, `tests/app-check/README.md`

**Interfaces:**
- Produces:
  - `npm run app-diff -- <task> [--accept] [--idle]`. It compares each PNG in `artifacts/app-checks/<task>/current/` with the same name in `…/accepted/`, cropped to the state's regions with its masks painted out. It prints one table row per file and region (`pass`, `fail`, `new`), writes `<state>.<region>.diff.png` beside a failing pair, and exits 1 on any `fail`. `--accept` copies `current` over `accepted`. `--idle` compares `idle-1.png`, `idle-2.png`, `idle-3.png` in `current` pairwise and fails on any changed pixel.
  - Thresholds: pixelmatch `threshold: 0.1`, pass when changed ≤ 0.1% of the region's pixels; `--idle` uses `threshold: 0` and 0 pixels.
  - Exports for tests: `resolveBox(box: Box, w: number, h: number): { x: number; y: number; w: number; h: number }` (rounded integers); `compare(a: PNG, b: PNG | null, regions: Box[], masks: Box[], opts: { threshold: number; maxRatio: number }): { status: 'pass' | 'fail' | 'new'; changed: number; total: number }`.
  - `tests/app-check/regions.json`: `{ "regions": { "panel": Box, "pane": Box }, "states": { "<task>/<state>": { "regions"?: { "panel"?: Box, "pane"?: Box }, "masks": (Box & { "region": "panel" | "pane"; "why": string })[] } } }`, where `Box = { x, y, w, h }` as fractions of the window, 0 to 1. Mask boxes are fractions of their region.
  - `scripts/app-capture.sh <task> <state> [--dry-run]`: runs `screencapture -l <id> -o -x artifacts/app-checks/<task>/current/<state>.png`. The id comes from `swift scripts/window-id.swift "${CLAWPIT_APP:-Claude}"`, or from `$WINDOW_ID_CMD` when set (the test seam). Exit 3 with `app-capture: no window for <app>` when no id comes back; exit 2 on bad arguments. `--dry-run` prints the command and the path and captures nothing.
  - `scripts/window-id.swift <owner>`: prints the `kCGWindowNumber` of the largest layer-0 on-screen window whose owner name equals the argument, or nothing. Swift over `CGWindowListCopyWindowInfo` because an Electron app is not scriptable, so AppleScript has no id that `screencapture -l` accepts.
  - `tests/app-check/README.md`: the app check procedure below, the fixture prompts, the one-time Screen Recording grant.

- [ ] **Step 1: Write the failing tests** (`node:test`, images built in memory with `pngjs`)

```js
// scripts/app-diff.test.mjs
test('app-diff: identical images pass', …)                          // status 'pass', changed 0
test('app-diff: a 1-pixel change inside a mask passes', …)          // status 'pass'
test('app-diff: the same change outside a mask fails', …)           // status 'fail', changed 1, with maxRatio 0
test('app-diff: a missing accepted image is "new", not a crash', …) // compare(a, null, …).status === 'new'
test('app-diff: region fractions resolve the same at two window sizes', …)
  // resolveBox({x:.25,y:.5,w:.5,h:.25}, 1000, 800) -> {x:250,y:400,w:500,h:200}; at 2000x1600 -> {x:500,y:800,w:1000,h:400}
test('app-diff: --idle fails on one changed pixel', …)
// scripts/app-capture.test.mjs (spawns bash)
test('app-capture: no window exits 3 with a clear message', …)      // WINDOW_ID_CMD='true' -> code 3, stderr "app-capture: no window for Claude"
test('app-capture: the output path is artifacts/app-checks/<task>/current/<state>.png', …) // --dry-run stdout ends with that path
test('app-capture: --dry-run captures nothing', …)                  // WINDOW_ID_CMD='echo 42'; stdout contains "screencapture -l 42 -o -x"; no file written
test('app-capture: a missing argument exits 2', …)
```

- [ ] **Step 2: Run** `npm run test:scripts`. Expected: 10 failures, modules not found.
- [ ] **Step 3: Implement the three scripts** to the interfaces. `regions.json` starts with `panel: { x: 0.0, y: 0.72, w: 0.72, h: 0.2 }`, `pane: { x: 0.72, y: 0.05, w: 0.28, h: 0.95 }` and no states; Task 15 replaces these guesses from a real capture.
- [ ] **Step 4: Run** `npm run test:scripts`. Expected: `pass 10`, `fail 0`.
- [ ] **Step 5: Commit**

```bash
git add scripts tests/app-check package.json
git commit -m "scripts: add window capture and the pixel diff for in-app checks"
```

### Task 4: The contract (types and fixtures)

**Files:**
- Create: `plugin/types/index.d.ts`, `plugin/tests/fixtures/states.ts`, `plugin/tests/fixtures.test.ts`

**Interfaces:**
- Produces `plugin/types/index.d.ts`: every type in design §5, exactly as written there, plus

```ts
declare module 'claude-code' {
  interface PluginState {
    clawpit: { takeover: boolean; stats: Stats; ui: Ui; tick: number; idleSince: number | null }
    'savvy-progress': { flow: SavvyFlow | null; agents: SavvyRun[] }
    ponytail: { band: PonytailBand }
  }
}
```

- Decision M5 adds to the contract: `CodeStat = { reusePct: number | null; reused: number; created: number; callers: string[] }`, `Stats.code: CodeStat | null`, the column keys `reuse` and `callers`, and `PonytailBand = { reused: string[]; created: string[]; openCallers: string[] }` (the fields of ponytail's `band` atom that clawpit reads).
- Produces `plugin/tests/fixtures/states.ts`: `export const NOW = 1_800_000_000_000` and `export const STATES: Record<StateName, Fixture>` with `type Fixture = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>; stats: Stats; ui: Ui; busy: boolean; armed: boolean }` and `StateName = 'idle' | 'busy' | 'hydra' | 'needsYou' | 'failed' | 'both' | 'context90' | 'limitAhead' | 'sizeGauges' | 'sizeLine' | 'drawerOpen' | 'helpers' | 'emptyPane' | 'manyAgents' | 'codeColumns'`.
  - `hydra` is the mockup's dataset (`seed()` and `ST` in `design/mockups-all.html`): four agents (`e2e tests`, `savvy-progress implement`, `cache-tax review c1` with two helpers, `plan the release`) and one ended run (`docs pass`, took 1:05), seven tasks `schema, api, savvy-progress implement, e2e tests, cache-tax review c1, plan the release, merge` with 2 done (task titles equal the run descriptions they match, as savvy's contract asks; decision M9), phase `delegate`, context 58, 5h 21, 7d 63 and ahead, 44 turns, tests 179 passed.
  - `needsYou` = `hydra` with `e2e tests` blocked on `Postgres or SQLite for the fixture?`. `failed` = the mockup's `?state=failed` (reason `Could not reach Postgres on :5432`, error `connect ECONNREFUSED 127.0.0.1:5432`, 3 tries; `cache-tax review c1` struggling with 3 tries; helper `map the cache keys` failed). `both` adds `plan the release` blocked on `Ship the release notes in this PR, or after it?`.
  - `idle`: no runs, no turn. `busy`: a turn 1:42 old, +38 −6, cost 0.42, no agents. `context90`: context 92, `autoPct` 97. `limitAhead`: 5h at 62 with `projected` 131. `manyAgents`: 80 running runs. `drawerOpen` and `helpers` are `hydra` with `ui.open` and `ui.shut` set. `sizeGauges`, `sizeLine` are `needsYou` at those sizes. `codeColumns`: idle, 2 turns, so the two lowest columns have room. Every state carries `code` = reuse 72% (18 used, 7 new) and 2 callers open.

- [ ] **Step 1: Write the failing test** in `plugin/tests/fixtures.test.ts`

```ts
test('fixtures: every state is JSON-safe and names known fields only', () => {
  for (const [name, s] of Object.entries(STATES)) {
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    expect(s.runs.every(r => typeof r.id === 'string' && r.startedAt <= NOW)).toBe(true)
  }
  expect(STATES.hydra.runs.length).toBe(7); expect(STATES.manyAgents.runs.length).toBe(80)
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the new file fails, `STATES` not found.
- [ ] **Step 3: Write the two files.**
- [ ] **Step 4: Run** `claude plugin validate plugin && claude plugin test plugin`. Expected: no validate error; `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/types plugin/tests
git commit -m "types: add the shared types and the fixture states"
```

This commit is the base every workstream branches from. After it, `plugin/types/index.d.ts` and `plugin/tests/fixtures/states.ts` belong to no workstream; a workstream that needs a change there returns it as a shared edit.

---

## Part B: pure modules, as Hydra workstreams

Each task below is one workstream. Its brief is the task itself plus the design sections it names. Each visual test follows the same three moves: write the test that creates the baseline, look at the screenshot against the mockup, then commit the baseline with the code.

### Task 5: The kit (tokens, text, icons, crab)

**Files:**
- Create: `plugin/hooks/tokens.ts`, `plugin/hooks/text.ts`, `plugin/hooks/icons.ts`, `plugin/hooks/crab.ts`, `plugin/tests/tokens.test.ts`, `plugin/tests/text.test.ts`, `plugin/tests/icons.test.ts`, `plugin/tests/crab.test.ts`, `tests/visual/kit.spec.ts`

**Interfaces:**
- Consumes: types from Task 4; `show`, `loops`, `alts` from Task 2.
- Produces:

```ts
// tokens.ts
export const TOKENS: Record<TokenName, { light: string; dark: string }>   // every row of ALIGNMENT "Colour", plus tint28/<role>, halo35, ring60 pre-computed as rgba
export const SURFACE = { dark: '#252424', light: '#faf9f5' } as const
export const CELL_PX = 8.5
export const SIZE = { chip: 26, row: 48, needRow: 62, helperRow: 32, endedRow: 30, toggle: 24, crab: { S: [25.5, 21], M: [34, 28], L: [51, 42] } } as const
export const MOTION = { curve: 'cubic-bezier(.2,.8,.2,1)', walk: '.5s steps(1)', beat: '1.2s steps(2)', settleMs: 900, fillMs: 600, revealMs: 300 } as const
export const FONT = '-apple-system,BlinkMacSystemFont,system-ui,sans-serif'
export const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace'
export const cssOf: (used: Iterable<string>, animated?: boolean) => string  // '<style>…</style>': light rules, dark rules in the media query, only for classes in `used`; with `animated`, the reduced-motion rule last
export const svg: (w: number, h: number, body: string, animated?: boolean) => string  // wraps body, collects its classes, prepends cssOf
export const contrast: (fg: string, bg: string) => number                 // WCAG ratio, hex or rgba over bg
// text.ts
export const oneLine: (v: unknown) => string
export const clip: (s: string, max: number) => string                     // ends with '…' when cut
export const xml: (s: string) => string                                   // & < > " '
export const textWidth: (s: string, sizePx: number, weight?: 400 | 600 | 700) => number
export const fit: (s: string, widthPx: number, sizePx: number, weight?: 400 | 600 | 700) => string
export const wrap: (s: string, widthPx: number, sizePx: number, lines: number, weight?: 400 | 600 | 700) => string[]
export const fmtClock: (ms: number) => string        // 'm:ss'
export const fmtAge: (ms: number) => string          // 'Ns' under a minute, else 'Nm'
export const fmtLeft: (minutes: number) => string    // '<1m left' for 0, else '~Nm left'
export const fmtCost: (usd: number) => string        // '≈$0.42', '$267' at 100 and above
export const fmtTokens: (n: number) => string        // '441M', '12.3k'
export const fmtDuration: (ms: number) => string     // '10h 50m', '14m'
// icons.ts — each returns an SVG fragment (no <svg> wrapper) using token classes
export const icon: (name: 'chev' | 'check' | 'cross', sizePx: 10 | 12, cls: string) => string
export const toggleIcon: (size: Size, hasDot: boolean) => string                 // 14x14 picture of the panel
export const dial: (pct: number, tone: 'accent' | 'warn' | 'er', opts: { ghost?: number; small?: boolean; settle?: Settle }) => string  // 34x22, or x.75
export const segBar: (segs: { state: 'done' | 'live' | 'need' | 'failed' | 'todo'; role?: Role; fill: number }[], widthPx: number, tier: 'full' | 'compact', grow?: boolean) => string
export const stepBlocks: (done: number, total: number, tone: Role | 'er') => string
// crab.ts
export const crab: (o: { role: Role; prop: Prop; walk: boolean; size: CrabSize; onRed?: boolean; move?: 'hop' | 'sway' }) => string  // a whole <svg>, padded 3px when move is set
```

- The crab is the mockup's `crab()` rect for rect: body, eyes (dizzy for `fail`), role costume, props (`search`, `read`, `write`, `think`, `wait` with the bubble inverted when `onRed`), the done flag waving 6 times. `walk` adds the two leg groups and the body-and-prop bob on `MOTION.walk`; `hop` is `translateY(-3px)` and `sway` `translateX(2px)` on `MOTION.beat`.
- `segBar` fill rule: done solid `ok`; failed solid `er`; need a 28% `er` tint plus a solid fill; live a 28% tint of the role colour plus a solid fill to `max(8%, fill)`; todo the track. Full tier 8px, radius 3, gap 2; compact 6px, radius 2, gap 2. `grow` adds the 600 ms one-shot.
- `dial` with `settle` rotates the needle by a one-shot keyframe from `settle.from` to `settle.to` in 900 ms; without it the needle is placed.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('tokens: every text token meets 4.5:1 on both surfaces', () => {
  for (const t of ['fg','muted','accent','warn','er','okText','roleText/implement','roleText/review','roleText/test','roleText/explore','roleText/design'])
    for (const m of ['dark','light'] as const) expect(contrast(TOKENS[t][m], SURFACE[m])).toBeGreaterThanOrEqual(4.5)
})
test('tokens: white on red is at least 4.5:1', () => expect(contrast('#ffffff', TOKENS.red.dark)).toBeGreaterThanOrEqual(4.5))
test('tokens: cssOf emits only the classes used, dark inside the media query', () => {
  const css = cssOf(['fg']); expect(css).toContain('.fg{fill:#1f1e1d}')
  expect(css).toContain('@media (prefers-color-scheme: dark){.fg{fill:#ecebe6}}'); expect(css).not.toContain('.muted')
})
test('tokens: an animated image ends with the reduced-motion rule', () =>
  expect(cssOf(['fg'], true)).toContain('@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}'))
test('text: oneLine strips control characters', () => expect(oneLine('a\u0000b\n c\u001b[31m')).toBe('ab c[31m'))
test('text: xml escapes the five characters', () => expect(xml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;'))
test('text: clip ends with an ellipsis', () => expect(clip('abcdef', 4)).toBe('abc…'))
test('text: wrap gives at most two lines and marks the cut', () => {
  const out = wrap('Postgres or SQLite for the fixture, and which port should it use?', 120, 12, 2)
  expect(out.length).toBe(2); expect(out[1].endsWith('…')).toBe(true); expect(out.every(l => textWidth(l, 12) <= 120)).toBe(true)
})
test('text: formats', () => {
  expect(fmtClock(102_000)).toBe('1:42'); expect(fmtAge(42_000)).toBe('42s'); expect(fmtAge(180_000)).toBe('3m')
  expect(fmtLeft(0)).toBe('<1m left'); expect(fmtLeft(2)).toBe('~2m left'); expect(fmtCost(0.42)).toBe('≈$0.42'); expect(fmtTokens(441_000_000)).toBe('441M')
})
test('icons: a live segment is never under 8 percent', () => expect(segBar([{ state: 'live', role: 'test', fill: 0.01 }], 100, 'full')).toContain('width="8"'))
test('icons: a failed segment is solid er', () => expect(segBar([{ state: 'failed', fill: 0 }], 100, 'full')).toContain('class="er"'))
test('crab: a still crab has no animation', () => expect(crab({ role: 'test', prop: 'read', walk: false, size: 'M' })).not.toContain('animation'))
test('crab: a walker uses steps only', () => {
  const s = crab({ role: 'test', prop: 'read', walk: true, size: 'M' }); expect(s).toContain('steps(1)'); expect(s).not.toMatch(/ease|linear/)
})
test('crab: the same input gives the same string', () =>
  expect(crab({ role: 'review', prop: 'search', walk: true, size: 'S' })).toBe(crab({ role: 'review', prop: 'search', walk: true, size: 'S' })))
test('crab: on red the question bubble inverts', () => expect(crab({ role: 'test', prop: 'wait', walk: false, size: 'S', onRed: true })).toContain('fill="#fff"'))
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the four new files fail.
- [ ] **Step 3: Implement the four modules** to the interfaces.
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Write the visual test** `tests/visual/kit.spec.ts`: a specimen sheet (every role × every prop × S, M, L; both dials; both bar tiers in every state; the three toggle icons with and without the dot), in dark and light.

```ts
for (const theme of ['dark', 'light'] as const)
  test(`kit: specimen sheet, ${theme} @shot`, async ({ page }) => {
    await show(page, sheet(), { surface: 'pane', widthCells: 60, theme }); await expect(page).toHaveScreenshot(`kit-${theme}.png`)
  })
test('kit: a still sheet runs no animation', async ({ page }) => {
  await show(page, sheet({ walk: false }), { surface: 'pane', widthCells: 60, theme: 'dark', motion: true }); expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})
test('kit: walkers loop stepped, never eased', async ({ page }) => {
  await show(page, sheet({ walk: true }), { surface: 'pane', widthCells: 60, theme: 'dark', motion: true }); const l = await loops(page)
  expect(l.drawings).toBeGreaterThan(0); expect(l.eased).toBe(0)
})
```

- [ ] **Step 6: Create the baselines and review them.** Run `npx playwright test tests/visual/kit.spec.ts --update-snapshots`, open both PNGs beside `design/mockups-all.html` and compare the crab pixel for pixel at M, the dial's arc and needle, and the bar tiers. Fix until they match, then run `npm run test:visual`. Expected: all pass.
- [ ] **Step 7: Commit**

```bash
git add plugin/hooks/tokens.ts plugin/hooks/text.ts plugin/hooks/icons.ts plugin/hooks/crab.ts plugin/tests tests/visual
git commit -m "kit: add the tokens, text helpers, icons and the crab"
```

### Task 6: Trackers A (activity, step log, tests)

**Files:**
- Create: `plugin/hooks/track/activity.ts`, `plugin/hooks/track/steplog.ts`, `plugin/hooks/track/tests.ts`, and one test file each under `plugin/tests/`

**Interfaces:**
- Consumes: types from Task 4 only. So that this workstream does not wait for Task 5, `track/activity.ts` carries its own small `clean(v: unknown, max: number): string` (control characters out, whitespace collapsed, cut at `max`); Task 14 replaces it with `oneLine` and `clip`.
- Produces:

```ts
// activity.ts
export type ToolEvent = { tool: string; agentId?: string; input: Record<string, unknown>; result?: unknown; isError?: boolean; at: number }
export type Facts = { activity: Record<string, Activity>; files: Record<string, string[]>; lines: { added: number; removed: number } }  // key '' is the main loop
export const emptyFacts: () => Facts
export const onTool: (f: Facts, e: ToolEvent) => Facts              // never throws
export const onThink: (f: Facts, agentId: string | undefined, at: number) => Facts
export const linesOf: (tool: string, result: unknown) => { added: number; removed: number }
export const isEdit: (tool: string) => boolean
// steplog.ts
export type Logs = Record<string, LogLine[]>                         // by run id
export const diff: (logs: Logs, prev: SavvyRun[], next: SavvyRun[], parents: Record<string, string>, at: number) => Logs
// tests.ts
export const parseTests: (command: string, stdout: string, stderr: string, at: number) => TestStat | null
```

Rules: design §6.1, §6.2, §6.5, exactly.

- [ ] **Step 1: Write the failing tests**

```ts
test('activity: each tool maps to its kind, verb and target', () => {
  const f = onTool(emptyFacts(), { tool: 'Edit', agentId: 'a1', input: { file_path: 'x/y/hooks/register.tsx' }, at: 1 })
  expect(f.activity.a1).toEqual({ kind: 'edit', verb: 'Editing', target: 'hooks/register.tsx', at: 1 })
  expect(onTool(emptyFacts(), { tool: 'Grep', input: { pattern: 'UNATTENDED', path: 'hooks/' }, at: 1 }).activity['']).toEqual({ kind: 'search', verb: 'Searching', target: '"UNATTENDED" in hooks/', at: 1 })
  expect(onTool(emptyFacts(), { tool: 'mcp__x__y', input: {}, at: 1 }).activity[''].kind).toBe('other')
})
test('activity: Edit counts plus and minus lines from structuredPatch', () =>
  expect(linesOf('Edit', { structuredPatch: [{ lines: ['+a', '+b', '-c', ' d'] }] })).toEqual({ added: 2, removed: 1 }))
test('activity: a Write that creates a file counts gitDiff additions, else content lines', () => {
  expect(linesOf('Write', { type: 'create', structuredPatch: [], content: 'a\nb\nc', gitDiff: { additions: 7, deletions: 0 } })).toEqual({ added: 7, removed: 0 })
  expect(linesOf('Write', { type: 'create', structuredPatch: [], content: 'a\nb\nc' })).toEqual({ added: 3, removed: 0 })
})
test('activity: a staged edit counts nothing', () => expect(linesOf('Edit', { staged: true, structuredPatch: [{ lines: ['+a'] }] })).toEqual({ added: 0, removed: 0 }))
test('activity: junk results change nothing and do not throw', () => {
  for (const r of [undefined, null, 5, 'x', {}, { structuredPatch: null }, { structuredPatch: [{}] }, { deny: 'no' }])
    expect(linesOf('Edit', r)).toEqual({ added: 0, removed: 0 })
  expect(() => onTool(emptyFacts(), { tool: 'Edit', input: null as never, result: null, at: 1 })).not.toThrow()
})
test('activity: files are capped at 50 per agent', () => { /* 60 distinct Read calls -> files.a1.length === 50, newest kept */ })
test('activity: control characters never reach a target', () =>
  expect(onTool(emptyFacts(), { tool: 'Bash', input: { command: 'echo \u0007\nhi' }, at: 1 }).activity[''].target).toBe('echo hi'))
test('steplog: a new note, a failed try, a question and a failure each add one line', () => {
  const a = { id: 'r1', status: 'running', stepDone: 1, stepTotal: 4 } as SavvyRun
  let logs = diff({}, [a], [{ ...a, stepNote: 'Seeded the fixture data.' }], {}, 10)
  expect(logs.r1[0]).toEqual({ kind: 'step', text: 'Seeded the fixture data.', at: 10 })
  logs = diff(logs, [a], [{ ...a, failedAttempts: 1, failNote: 'connection refused' }], {}, 20)
  expect(logs.r1[0].text).toBe('Try 1 failed: connection refused')
  logs = diff(logs, [a], [{ ...a, blocked: 'Postgres or SQLite?' }], {}, 30); expect(logs.r1[0].text).toBe('Asked: Postgres or SQLite?')
  logs = diff(logs, [{ ...a, stepDone: 2 }], [{ ...a, stepDone: 2, status: 'failed', failNote: 'run the login flow test' }], {}, 40)
  expect(logs.r1[0]).toEqual({ kind: 'fail', text: 'Failed at step 3 of 4: run the login flow test', at: 40 })
})
test('steplog: a failed helper is logged on its parent', () => { /* parents { k2: 'r1' }; k2 running->failed after 48_000ms with failNote -> logs.r1[0].text === 'Helper "map the cache keys" failed after 0:48: no "cacheKey" in src/' */ })
test('steplog: thirty lines at most, a vanished run drops its log', () => { /* 40 notes -> length 30; next without r1 -> logs.r1 undefined */ })
test('tests: counts from common runners', () => {
  expect(parseTests('npm test', '179 pass\n0 fail', '', 5)).toEqual({ passed: 179, failed: 0, at: 5 })
  expect(parseTests('pytest -q', '3 failed, 41 passed in 2.1s', '', 5)).toEqual({ passed: 41, failed: 3, at: 5 })
  expect(parseTests('mvn -q test', 'Tests run: 12, Failures: 1, Errors: 1, Skipped: 0', '', 5)).toEqual({ passed: 10, failed: 2, at: 5 })
})
test('tests: a command that is not a test run, or output with no counts, records nothing', () => {
  expect(parseTests('ls', '3 passed', '', 5)).toBeNull(); expect(parseTests('npm test', 'done', '', 5)).toBeNull()
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the three new files fail.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/track/activity.ts plugin/hooks/track/steplog.ts plugin/hooks/track/tests.ts plugin/tests
git commit -m "track: add the activity, step log and tests trackers"
```

### Task 7: Trackers B (ETA, turn, pace, context)

**Files:**
- Create: `plugin/hooks/track/eta.ts`, `plugin/hooks/track/turn.ts`, `plugin/hooks/track/pace.ts`, `plugin/hooks/track/context.ts`, `plugin/hooks/track/code.ts`, and one test file each under `plugin/tests/`

**Interfaces:**
- Consumes: types from Task 4.
- Produces:

```ts
// eta.ts
export type History = Record<string, number[]>
export const stageOf: (description: string) => string
export const keysOf: (type: string, model: string, description: string) => [string, string, string]   // finest first
export const record: (h: History, keys: readonly string[], ms: number) => History                      // last 20 per key
export const estimate: (h: History, keys: readonly string[], elapsedMs: number) => Eta
export const usually: (h: History, keys: readonly string[]) => number | null                          // whole minutes
// turn.ts
export type TurnState = { turn: TurnStat | null; cost0: number | null; session: SessionStat; idleSince: number | null }
export const emptyTurn: () => TurnState
export const onStart: (s: TurnState, at: number, usd: number | null) => TurnState
export const onLines: (s: TurnState, d: { added: number; removed: number }) => TurnState
export const onCost: (s: TurnState, usd: number | null) => TurnState
export const onComplete: (s: TurnState, e: { isMain: boolean; durationMs: number; tokens: number }, at: number, usd: number | null) => TurnState
export const isArmed: (s: TurnState, now: number) => boolean                                          // design §6.8
export const IDLE_ARM_MS = 600_000
// pace.ts
export const paceOf: (limits: { kind: string; percentUsed: number; resetsAt?: string }[], now: number) => LimitStat[]
export const paceText: (l: LimitStat) => string                                                       // '' or 'on pace for N%'
// context.ts
export type CtxInput = { percent?: number; breakdown?: { percentage: number; totalTokens: number; rawMaxTokens: number; autoCompactThreshold?: number; isAutoCompactEnabled: boolean; categories: { name: string; tokens: number; kind: string }[] } }
export const pushTurn: (history: number[], totalTokens: number) => number[]                           // last 10; cleared on a drop
export const contextOf: (c: CtxInput, history: number[]) => ContextStat | null
export const contextText: (c: ContextStat | null, turns: number) => string
// code.ts (decision M5)
export const codeOf: (band: unknown) => CodeStat | null
```

So that this workstream does not wait for Task 5, `track/code.ts` carries its own small `clean(v: unknown, max: number): string`, as Task 6's `activity.ts` does; Task 14 replaces both with `oneLine` and `clip`.

Rules: design §6.3, §6.4, §6.6, §6.7, §6.8, §6.9, exactly.

- [ ] **Step 1: Write the failing tests**

```ts
test('eta: under three runs at every level gives none', () => expect(estimate({ k: [60_000, 60_000] }, ['k'], 0)).toEqual({ kind: 'none' }))
test('eta: before the median it counts down to the median', () =>
  expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 120_000)).toEqual({ kind: 'left', minutes: 4, slow: false }))
test('eta: past the median it re-estimates to the 80th percentile and is slow', () =>
  expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 400_000)).toEqual({ kind: 'left', minutes: 2, slow: true }))
test('eta: past the 80th percentile it is over', () => expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 500_000)).toEqual({ kind: 'over' }))
test('eta: the finest level with three runs wins, else it falls back', () =>
  expect(estimate({ 'a · m · fix': [1], 'a · m': [60_000, 60_000, 60_000] }, ['a · m · fix', 'a · m', 'a'], 0)).toEqual({ kind: 'left', minutes: 1, slow: false }))
test('eta: record keeps the last twenty at all three levels', () => { /* 25 records -> each of the 3 keys has length 20, oldest gone */ })
test('eta: stageOf finds the first stage word', () => { expect(stageOf('cache-tax review c1')).toBe('review'); expect(stageOf('plan the release')).toBe('') })
test('turn: a main turn tracks lines and the cost delta', () => {
  let s = onStart(emptyTurn(), 1000, 10); s = onLines(s, { added: 38, removed: 6 }); s = onCost(s, 10.42)
  expect(s.turn).toEqual({ startedAt: 1000, added: 38, removed: 6, costUsd: expect.closeTo(0.42, 5) }); expect(s.idleSince).toBeNull()
})
test('turn: completing a main turn records the last cost and starts idle', () => {
  const s = onComplete(onStart(emptyTurn(), 1000, 10), { isMain: true, durationMs: 5000, tokens: 900 }, 6000, 12.46)
  expect(s.turn).toBeNull(); expect(s.session.lastTurnUsd).toBeCloseTo(2.46, 5); expect(s.session.turns).toBe(1)
  expect(s.session.agentMs).toBe(5000); expect(s.session.tokens).toBe(900); expect(s.idleSince).toBe(6000)
})
test('turn: an agent turn adds tokens only', () => { /* isMain false -> turns 0, tokens added, idleSince unchanged */ })
test('turn: no ledger gives null costs, never NaN', () => expect(onCost(onStart(emptyTurn(), 0, null), null).turn!.costUsd).toBeNull())
test('turn: armed while busy, for ten minutes of idle, then not', () => {
  const idle = onComplete(onStart(emptyTurn(), 0, 0), { isMain: true, durationMs: 1, tokens: 0 }, 1000, 0)
  expect(isArmed(onStart(emptyTurn(), 0, 0), 5)).toBe(true); expect(isArmed(idle, 1000 + 599_999)).toBe(true); expect(isArmed(idle, 1000 + 600_000)).toBe(false)
})
const H5 = 18_000_000, at = (frac: number, reset: number) => reset - H5 + frac * H5
test('pace: on pace for N percent', () => {
  const reset = Date.parse('2026-11-21T15:00:00Z')
  const [l] = paceOf([{ kind: 'five_hour', percentUsed: 30, resetsAt: '2026-11-21T15:00:00Z' }], at(0.5, reset))
  expect(l.pacePct).toBeCloseTo(50, 5); expect(l.projected).toBeCloseTo(60, 5); expect(l.ahead).toBe(false); expect(l.hot).toBe(false); expect(paceText(l)).toBe('on pace for 60%')
})
test('pace: ahead when the projection passes 100, and hot', () => { /* 62% at 0.47 elapsed -> projected 131.9, ahead true, hot true, text 'on pace for 132%' */ })
test('pace: under ten percent elapsed there is no forecast', () => { /* at(0.09) -> pacePct null, projected null, ahead false, paceText '' ; hot only if pct >= 50 */ })
test('pace: no resetsAt gives no forecast', () => expect(paceOf([{ kind: 'seven_day', percentUsed: 63 }], 0)[0]).toMatchObject({ pacePct: null, projected: null, ahead: false, hot: true }))
test('pace: unknown kinds and an empty list give nothing', () => { expect(paceOf([], 0)).toEqual([]); expect(paceOf([{ kind: 'spend_limit', percentUsed: 5 }], 0)).toEqual([]) })
test('pace: a projection past 200 reads 200%+', () => { /* paceText -> 'on pace for 200%+' */ })
const bd = (over: object) => ({ percentage: 58, totalTokens: 580_000, rawMaxTokens: 1_000_000, autoCompactThreshold: 970_000, isAutoCompactEnabled: true, categories: [{ name: 'Messages', tokens: 340_000, kind: 'used' }], ...over })
test('context: the breakdown scale wins, with auto-compact percent and msgs share', () =>
  expect(contextOf({ percent: 44, breakdown: bd({}) }, [])).toEqual({ pct: 58, msgsPct: 34, turnsLeft: null, autoPct: 97, alarm: false }))
test('context: turns left is the room over the median growth', () =>
  expect(contextOf({ breakdown: bd({}) }, [400_000, 450_000, 520_000, 580_000])!.turnsLeft).toBe(6))   // deltas 50k,70k,60k -> median 60k; (970k-580k)/60k = 6.5
test('context: alarm at ninety, or seven under the threshold when that is lower', () => {
  expect(contextOf({ breakdown: bd({ percentage: 90 }) }, [])!.alarm).toBe(true)
  expect(contextOf({ breakdown: bd({ percentage: 84, autoCompactThreshold: 900_000 }) }, [])!.alarm).toBe(true)   // autoPct 90 -> alarm at 83
})
test('context: auto-compact off gives autoPct null', () => expect(contextOf({ breakdown: bd({ isAutoCompactEnabled: false, autoCompactThreshold: undefined }) }, [])!.autoPct).toBeNull())
test('context: absent percent and no breakdown gives pct null', () => expect(contextOf({}, [])).toBeNull())
test('context: a drop clears the history', () => expect(pushTurn([400_000, 450_000], 120_000)).toEqual([120_000]))
test('context: the so-what line', () => {
  expect(contextText(null, 0)).toBe('no reading yet')
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: null, autoPct: 97, alarm: false }, 2)).toBe('learning your pace')
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: 7, autoPct: 97, alarm: false }, 44)).toBe('~7 turns · 34% msgs')
  expect(contextText({ pct: 92, msgsPct: 34, turnsLeft: 1, autoPct: 97, alarm: true }, 44)).toBe('auto-compacts at 97%')
  expect(contextText({ pct: 92, msgsPct: null, turnsLeft: null, autoPct: null, alarm: true }, 44)).toBe('context nearly full')
})
const names = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`)
test('code: the reuse share as ponytail computes it', () =>
  expect(codeOf({ reused: names(18, 'r'), created: names(7, 'c'), openCallers: [] })).toEqual({ reusePct: 72, reused: 18, created: 7, callers: [] }))
test('code: under three functions there is no share', () => expect(codeOf({ reused: ['a'], created: ['b'], openCallers: [] })!.reusePct).toBeNull())
test('code: callers open are the refs, cleaned and capped', () => {
  const c = codeOf({ reused: [], created: [], openCallers: ['hooks/a.ts:4\u0007', 7, 'x'.repeat(300)] })!
  expect(c.callers).toEqual(['hooks/a.ts:4', 'x'.repeat(120)])
})
test('code: ponytail absent or malformed', () => {
  for (const b of [undefined, null, 5, 'x']) expect(codeOf(b)).toBeNull()
  expect(codeOf({ reused: 'x' })).toEqual({ reusePct: null, reused: 0, created: 0, callers: [] })
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the five new files fail.
- [ ] **Step 3: Implement the four modules.** Median: the middle of the sorted list, the mean of the two middles for an even count. 80th percentile: nearest rank, `sorted[ceil(0.8 * n) - 1]`.
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/track/eta.ts plugin/hooks/track/turn.ts plugin/hooks/track/pace.ts plugin/hooks/track/context.ts plugin/hooks/track/code.ts plugin/tests
git commit -m "track: add the eta, turn, pace, context and code trackers"
```

### Task 8: The loop picker

**Files:**
- Create: `plugin/hooks/loops.ts`, `plugin/tests/loops.test.ts`

**Interfaces:**
- Consumes: `Crew`, `Ui`, `LoopPlan` from Task 4.
- Produces: `export const BUDGET = { walkers: 3, walkersOnBeat: 2, max: 8 }` (one ring at most: `LoopPlan.ring` is a single id) and `export const pickLoops: (crew: Crew, ui: Ui, busy: boolean, armed: boolean) => LoopPlan`. Rules: design §10, exactly. The tests read `BUDGET`; they never repeat its numbers, so Task 20 can change them.

- [ ] **Step 1: Write the failing tests** (crews are built by hand from the `CrewAgent` type)

```ts
test('loops: idle, nothing loops', () => expect(pickLoops(crewOf0(), ui('full', true), false, false)).toEqual({ walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }))
test('loops: three walkers, the newest running agents', () => { /* 5 running -> walkers = newest BUDGET.walkers ids, in that order */ })
test('loops: two walkers while someone needs you, and one ring on the longest waiter', () => { /* 2 need + 4 running, pane open -> walkers.length === BUDGET.walkersOnBeat, ring === oldest waiter id, chipPulse true */ })
test('loops: an armed failure takes the beat slot; unarmed it does not', () => {
  /* 1 failed + 4 running: armed -> walkers BUDGET.walkersOnBeat, chipPulse true; not armed -> walkers BUDGET.walkers, chipPulse false */ })
test('loops: idle with a held failure, armed: only the pulse', () => { /* busy false, no running; full -> count 1, chipPulse true; gauges -> mascot 'sway', count 1; not armed -> count 0 */ })
test('loops: a helper walks only when a slot is left', () => { /* 3 top-level running + 1 helper -> helper not in walkers; 2 top-level + 1 helper -> helper last */ })
test('loops: the mascot costume order', () => { /* gauges: need -> 'hop'; failed armed -> 'sway'; running -> 'walk'; full -> 'still' */ })
test('loops: the count is what is on screen', () => { /* full + pane open, 3 walkers, no beat -> 6; pane closed -> 3; line size -> 1 (mascot) + pane rows */ })
test('loops: the count never passes the budget', () => { /* any crew -> count <= BUDGET.max */ })
test('loops: a struggling agent never pulses', () => { /* running with tries 3 only -> chipPulse false, ring null */ })
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: `loops.test.ts` fails.
- [ ] **Step 3: Implement `pickLoops`.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/loops.ts plugin/tests/loops.test.ts
git commit -m "loops: add the single loop picker for the panel and the pane"
```

### Task 9: Column fit and sizes

**Files:**
- Create: `plugin/hooks/panel/columns.ts`, `plugin/hooks/panel/fold.ts`, `plugin/tests/columns.test.ts`, `plugin/tests/fold.test.ts`

**Interfaces:**
- Consumes: `Stats`, `Crew`, `Size`, `Column`, `ColumnKey`, `Settle` from Task 4.
- Produces:

```ts
// columns.ts
export const ORDER: readonly ColumnKey[]            // context, turn, 5h, 7d, plan, session, tests, tokens, agent, reuse, callers, agents
export const maxColumns: (bodyColumns: number) => number
export const candidates: (stats: Stats, crew: Crew, size: Size, busy: boolean) => Column[]
export const fit: (cols: Column[], max: number) => ColumnKey[]
export const lineParts: (stats: Stats, crew: Crew) => ('context' | '5h' | '7d' | 'plan' | 'session' | 'agents')[]
// fold.ts
export const nextSize: (s: Size) => Size
export const parseSize: (v: unknown) => Size        // anything else -> 'full'
export const hasDot: (size: Size, crew: Crew) => boolean
export const settle: (prev: Settle | undefined, pct: number) => Settle
```

Rules: design §7.1 and §7.2. `settle`: no `prev` → `{ from: pct, to: pct }`; `pct === prev.to` → `prev` unchanged (the same object); else `{ from: prev.to, to: pct }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('columns: one per fourteen cells, between two and six', () => {
  expect(maxColumns(20)).toBe(2); expect(maxColumns(46)).toBe(3); expect(maxColumns(88)).toBe(6); expect(maxColumns(300)).toBe(6)
})
test('columns: calm, idle, three turns: the priorities', () => { /* candidates(...) priorities: context 100, session 80, 5h 40, 7d 35, tokens 30, agent 28 */ })
test('columns: a hot limit jumps forward', () => { /* 7d hot -> 90; 5h hot -> 96 */ })
test('columns: this turn only while busy; tests drop to 20 while busy', () => {})
test('columns: tokens and agent time only after three turns', () => {})
test('columns: missing limits produce no limit column', () => { /* stats.limits [] -> no '5h', no '7d' */ })
test('columns: reuse and callers are the two lowest and step aside first', () => {
  /* codeColumns -> reuse 12, callers 10, both below every other candidate (tests busy 20 included); 'reuse' only when code.reusePct is not null,
     'callers' only when code.callers is non-empty, neither when code is null; at maxColumns(60) = 4 with hydra they are the first cut */ })
test('columns: plan and agents are columns only when folded', () => { /* full -> neither; gauges with a plan and agents -> plan 97, agents 99 */ })
test('columns: fit keeps the top by priority and lays them in the fixed order', () =>
  expect(fit([{ key: 'agents', priority: 99 }, { key: 'session', priority: 80 }, { key: 'context', priority: 100 }, { key: 'tokens', priority: 30 }], 3)).toEqual(['context', 'session', 'agents']))
test('columns: the one-line parts', () => { /* context always; only hot limits; plan when a plan exists else session; agents last when the crew has agents; never reuse or callers */ })
test('fold: full, gauges, line, full', () => { expect(nextSize('full')).toBe('gauges'); expect(nextSize('gauges')).toBe('line'); expect(nextSize('line')).toBe('full') })
test('fold: a bad stored value is full', () => { expect(parseSize('big')).toBe('full'); expect(parseSize(undefined)).toBe('full'); expect(parseSize('line')).toBe('line') })
test('fold: the dot shows only while folded with a waiter or a failure', () => {})
test('fold: settle keeps its object while the value holds', () => {
  const a = settle(undefined, 58); expect(a).toEqual({ from: 58, to: 58 }); expect(settle(a, 58)).toBe(a); expect(settle(a, 61)).toEqual({ from: 58, to: 61 })
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the two new files fail.
- [ ] **Step 3: Implement the two modules.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/panel/columns.ts plugin/hooks/panel/fold.ts plugin/tests
git commit -m "panel: add column ranking, fit and the size machine"
```

### Task 10: The crew model and the pane layout

**Files:**
- Create: `plugin/hooks/model.ts`, `plugin/hooks/pane/layout.ts`, `plugin/tests/model.test.ts`, `plugin/tests/layout.test.ts`

**Interfaces:**
- Consumes: types and `STATES`, `NOW` from Task 4; `Facts`, `Logs`, `History` shapes from Tasks 6 and 7 as types only (declare them locally as `type Facts = { activity: Record<string, Activity> }`, `type Logs = Record<string, LogLine[]>`, and take the estimate as a function, so this workstream has no code dependency).
- Produces:

```ts
// model.ts
export const roleOf: (type: string, description: string) => Role
export type CrewInput = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>; logs: Record<string, LogLine[]>
  etaOf: (run: SavvyRun, elapsedMs: number) => Eta; usuallyOf: (run: SavvyRun) => number | null; now: number }
export const crewOf: (i: CrewInput) => Crew
export const planOf: (flow: SavvyFlow | null, agents: CrewAgent[]) => Plan | null
// pane/layout.ts
export type PaneItem =
  | { kind: 'head'; crew: Crew }
  | { kind: 'section'; name: 'need' | 'failed' | 'running' | 'ended'; count: number; shut?: boolean }
  | { kind: 'row'; agent: CrewAgent; walk: boolean; ring: boolean; open: boolean }
  | { kind: 'drawer'; agent: CrewAgent }
  | { kind: 'helper'; agent: CrewAgent; walk: boolean }
  | { kind: 'kids'; parentId: string; count: number; failed: number; shut: boolean }
  | { kind: 'ended'; agent: CrewAgent }
  | { kind: 'more'; section: 'need' | 'failed' | 'running' | 'ended'; count: number }
  | { kind: 'empty' }
export const HOST_MAX = 200_000, ENGINE_MAX = 90_000
export const paneLayout: (crew: Crew, ui: Ui, loops: LoopPlan, cost: (item: PaneItem) => { host: number; engine: number }) => PaneItem[]
```

Rules: design §5 "Deriving `Crew`" (including `waitingSince`) and §8.1, exactly. Each fixture carries its step logs (`logs`), and `ETA` and `USUALLY` in `states.ts` are the one estimate table every builder uses. `cost` is injected so the layout does not depend on the drawing; Task 13 passes the real measure.

- [ ] **Step 1: Write the failing tests**

```ts
const input = (s: keyof typeof STATES, over = {}) => ({ ...STATES[s], etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' as const }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW, ...over })
test('crewOf: the hydra fixture gives the mockup counts', () => {
  const c = crewOf(input('needsYou')); expect(c.counts).toEqual({ need: 1, failed: 0, running: 3, done: 1 })
  expect(c.agents[0].title).toBe('e2e tests'); expect(c.agents.length).toBe(4); expect(c.ended.map(a => a.title)).toEqual(['docs pass'])
  expect(c.agents.find(a => a.title === 'cache-tax review c1')!.helpers.length).toBe(2); expect(c.title).toBe(STATES.needsYou.flow!.title)
})
test('crewOf: section order is need, failed, running with struggling first', () => { /* 'both' -> states in order: need, failed, running, running; within running, tries>=3 first (rev before imp) */ })
test('crewOf: a failed run is failed while held, ended after', () => {
  const run = { id: 'r', type: 'validator', description: 'e2e tests', model: 'm', status: 'failed', startedAt: 0, endedAt: 130_000, contextTokens: 0, contextMax: 1, costUsd: 0, heldDone: true } as SavvyRun
  expect(crewOf(input('idle', { runs: [run] })).agents[0].state).toBe('failed'); expect(crewOf(input('idle', { runs: [{ ...run, heldDone: false }] })).ended[0].prop).toBe('fail')
})
test('crewOf: a helper whose parent ended is listed flat', () => {})
test('crewOf: waitingSince is the newest ask line, else startedAt', () => { /* needsYou -> e2e waitingSince NOW - 42_000; same without logs -> its startedAt; a running agent has none */ })
test('crewOf: one time-left figure, the largest running estimate', () => { /* etaOf returns left 2, 4, 9 -> leftMin 9; all none -> null */ })
test('crewOf: tolerates a run with only the required fields', () => { /* the run above without step, fail or blocked fields -> no throw; stepDone 0, stepTotal 0, tries 0, struggling false */ })
test('crewOf: null flow and empty agents give the empty crew', () =>
  expect(crewOf(input('idle'))).toMatchObject({ title: 'Subagents', agents: [], ended: [], plan: null, leftMin: null }))
test('roleOf: by type, then by description, else explore', () => {
  expect(roleOf('implementer', 'x')).toBe('implement'); expect(roleOf('validator', 'x')).toBe('test'); expect(roleOf('general-purpose', 'cache-tax review c1')).toBe('review')
  expect(roleOf('general-purpose', 'plan the release')).toBe('design'); expect(roleOf('whatever', 'look around')).toBe('explore')
})
test('planOf: task states from the newest matching run; live fill never under 8 percent', () => { /* needsYou: 2 done, 'e2e tests' need, 'savvy-progress implement' live with fill 0.6, 'merge' todo */ })
test('planOf: design phase reads as plan; a finished flow is null', () => {})
test('paneLayout: the section order and the default-shut Ended', () => { /* kinds in order: head, section need, row…, section running, row…, section ended(shut) and no 'ended' items */ })
test('paneLayout: an open drawer follows its row; helpers follow unless shut', () => {})
test('paneLayout: only the ring id rings, only walker ids walk', () => {})
test('paneLayout: no agents gives head-less empty', () => expect(paneLayout(crewOf(input('idle')), STATES.idle.ui, noLoops, unit)).toEqual([{ kind: 'empty' }]))
test('paneLayout: 80 agents and an open drawer stay under both bounds', () => {
  const items = paneLayout(crewOf(input('manyAgents')), { ...STATES.manyAgents.ui, open: STATES.manyAgents.runs[0].id }, noLoops, () => ({ host: 4000, engine: 1800 }))
  const sum = items.reduce((a, i) => ({ host: a.host + 4000, engine: a.engine + 1800 }), { host: 0, engine: 0 })
  expect(sum.host).toBeLessThanOrEqual(HOST_MAX); expect(sum.engine).toBeLessThanOrEqual(ENGINE_MAX)
  expect(items.some(i => i.kind === 'more' && i.count > 0)).toBe(true); expect(items.some(i => i.kind === 'drawer')).toBe(true)
})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the two new files fail.
- [ ] **Step 3: Implement the two modules.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/model.ts plugin/hooks/pane/layout.ts plugin/tests
git commit -m "model: derive the crew from the runs and lay out the pane"
```

### Task 11: savvy-progress step fields and takeover (claude-kit checkout, local only)

**Files:**
- Modify: `plugins/savvy-progress/hooks/register.tsx` (the `step` tool's schema and description near line 1385, `STEP_BRIEF` near line 30, the `STEP_TOOL` handler near line 1455, `autoOpen` near line 1342, the `AbovePrompt` hook near line 2016), `plugins/savvy-progress/types/index.d.ts`
- Test: `plugins/savvy-progress/tests/clawpit.test.ts`

Line numbers are as of claude-kit `c81ee84`; re-check before editing.

**Interfaces:**
- Produces: `AgentRun.failNote?: string`, `AgentRun.failLine?: string`; step inputs `reason?: string`, `error?: string`; savvy draws no band and auto-opens no pane while `{ plugin: 'clawpit', key: 'takeover' }` reads `true`. The exact diff is in design §15.

- [ ] **Step 1: Write the failing tests** in `tests/clawpit.test.ts`, in the style of the neighbouring `tests/attention.test.ts`

```ts
test('step: a failed attempt keeps its reason and error line', …)
  // step { done: 2, failed: true, reason: 'Could not reach Postgres on :5432', error: 'connect ECONNREFUSED 127.0.0.1:5432' }
  // -> run.failNote === 'Could not reach Postgres on :5432', run.failLine === 'connect ECONNREFUSED 127.0.0.1:5432', failedAttempts 1
test('step: a later failed attempt without a reason keeps the last one', …)
test('step: progress clears the reason and the error line', …)          // step { done: 3 } -> both undefined
test('step: control characters and length are bounded', …)              // reason of 500 chars with a newline -> one line, at most 200
test('step: the tool description and the brief ask for reason and error', …)   // both strings contain 'reason' and 'error'
test('takeover: with the clawpit atom true the band draws nothing of savvy and the pane does not auto-open', …)
test('takeover: with the atom unset savvy draws as before', …)
test('takeover: autoOpen stands down on both of its paths, a new plan and a subagent spawn', …)   // the check sits inside autoOpen() itself
```

- [ ] **Step 2: Run** `claude plugin test plugins/savvy-progress`. Expected: the 8 new tests fail; the existing 179 pass (the count includes the 5 tests of the git-excluded `tests/zz.preview.test.ts`, which the run copies into each worktree).
- [ ] **Step 3: Apply the diff in design §15.**
- [ ] **Step 4: Run** `claude plugin validate plugins/savvy-progress && claude plugin test plugins/savvy-progress`. Expected: no validate error; `187 pass`, `0 fail`.
- [ ] **Step 5: Commit** on the local branch, with no push

```bash
git add plugins/savvy-progress
git commit -m "savvy-progress: step reason and error fields, and stand down for clawpit"
```

### Task 12: The panel tree (after Tasks 5, 8, 9, 10)

**Files:**
- Create: `plugin/hooks/panel/draw.ts`, `plugin/tests/panel-draw.test.ts`, `tests/visual/panel.spec.ts`, `plugin/tests/build.ts`

**Interfaces:**
- Consumes: the kit (Task 5), `pickLoops` (Task 8), `candidates`, `fit`, `maxColumns`, `lineParts`, `hasDot` (Task 9), `crewOf` (Task 10), `STATES` (Task 4), the harness (Task 2).
- Produces:

```ts
export type PanelView = { stats: Stats; crew: Crew; ui: Ui; loops: LoopPlan; busy: boolean; armed: boolean; bodyColumns: number; now: number; settles: Record<string, Settle> }
export type El = { type: string; props?: Record<string, unknown>; children?: (El | string)[] }
export const image: (key: string, p: ImageProps, loop: boolean) => El      // loop or press -> { type: 'Client', props: { key, module: './client/image.tsx', props: p } }; else { type: 'Svg', props: p }
export const panelTree: (v: PanelView) => El                                // root Box key 'clawpit-panel'
export const COMPACT_KEY = 'clawpit-compact'                                // the Button's key; Task 15 attaches onPress
// plugin/tests/build.ts (inside the plugin, so `claude plugin test` resolves it; the Playwright spec imports it from there)
export const viewOf: (state: StateName, over?: Partial<PanelView>) => PanelView   // builds crew, loops and settles from STATES with ETA and USUALLY
export const panelLoopCount: (v: PanelView) => number   // the panel's own looping drawings: walkers among top-level chips (full size) + chipPulse + (mascot !== 'still')
```

Rules: design §7.3, §9 (the constant-props rule), §11. The reuse and callers columns (decision M5): reuse reads label `reuse`, value `72%` in `fg`, so-what `18 used · 7 new` in `muted`; callers reads label `callers`, value `2 open` in `warn`, so-what the first two refs joined by `, `, cut to the column with `fit`. Keys: columns `col-<key>`, the toggle `toggle`, the plan line `plan-line`, the plan bar `plan-bar`, alert chips `chips-alert`, a chip `chip-<id>`, the folded crab `mascot`. `image` throws when the serialized props pass 60,000 characters.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('panel: full size is columns, then the plan, then the chips', () => { /* keys of the root's children in order for viewOf('hydra') */ })
test('panel: gauges size has no plan row and no chips, and has the plan and agents columns', () => {})
test('panel: one line holds context, the hot limits, the plan mini bar and the crab last', () => {})
test('panel: no plan and line size shows the session cost', () => {})
test('panel: the column count follows the cells', () => { /* bodyColumns 46 -> 3 col-* children; 88 -> 6 */ })
test('panel: Compact now appears only in alarm and is never dim', () => {
  const b = find(panelTree(viewOf('context90')), COMPACT_KEY)!; expect(b.type).toBe('Button'); expect(b.props!.label).toBe('Compact now'); expect(b.props!.dimColor).toBeUndefined()
  expect(find(panelTree(viewOf('hydra')), COMPACT_KEY)).toBeUndefined()
})
test('panel: a looping client has the same props one second later', () => {
  const a = clients(panelTree(viewOf('needsYou'))), b = clients(panelTree(viewOf('needsYou', { now: NOW + 1000 })))
  expect(b).toEqual(a); expect(a.length).toBeGreaterThan(0)
})
test('panel: alert chips share one client; a still chip is a plain Svg', () => {})
test('panel: the failed chip pulses only while armed', () => { /* armed false -> 'chips-alert' source has no 'animation' */ })
test('panel: wording', () => { /* chip '3/5 · ~2m left'; struggling '1/4 · ~4m left · 3 failed tries'; slow '… · slower'; failed 'failed · Could not reach Postgres on :5432'; folded 'next: savvy-progress implement · ~2m left'; plan '2/7 tasks · ~9m left'; codeColumns at bodyColumns 96 (at 60 cells the four columns are taken, so neither shows): 'col-reuse' says '72%' and '18 used · 7 new', 'col-callers' says '2 open' in warn and 'hooks/band.ts:41, tests/fold.test.ts:12' */ })
test('panel: a hostile chip title still yields well-formed svg', () => { /* title '<b>&"\u0000' -> every source parses with the test's tiny tag-balance check, and contains '&lt;b&gt;' */ })
test('panel: every image has an alt and every client is under the size cap', () => {})
test('panel: forty agents collapse into a +N more chip within maxRows', () => {})
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: `panel-draw.test.ts` fails.
- [ ] **Step 3: Implement `panel/draw.ts` and `plugin/tests/build.ts`.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Write the visual tests** `tests/visual/panel.spec.ts`

```ts
const SHOTS = ['idle','busy','hydra','needsYou','failed','both','context90','limitAhead','sizeGauges','sizeLine','codeColumns'] as const
for (const s of SHOTS) for (const theme of ['dark','light'] as const) for (const w of [60, 96] as const)   // narrow, wide
  test(`panel: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, panelTree(viewOf(s, { bodyColumns: w })), { surface: 'panel', widthCells: w, theme }); await expect(page).toHaveScreenshot(`panel-${s}-${theme}-${w}.png`)
  })
test('panel: nothing animates while idle', async ({ page }) => {
  await show(page, panelTree(viewOf('idle')), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true }); expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})
for (const s of ['hydra','needsYou','failed','both','sizeGauges','sizeLine'] as const)
  test(`panel: ${s} loops match the plan and the budget`, async ({ page }) => {
    const v = viewOf(s); await show(page, panelTree(v), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true })
    const l = await loops(page); expect(l.eased).toBe(0); expect(l.drawings).toBe(panelLoopCount(v)); expect(l.drawings).toBeLessThanOrEqual(BUDGET.max)
  })
test('panel: every Svg and Client has a non-empty alt', () => { for (const s of SHOTS) expect(alts(panelTree(viewOf(s))).every(a => a.trim().length > 0)).toBe(true) })
```

- [ ] **Step 6: Create the baselines and review them for mockup parity.** Run `npx playwright test tests/visual/panel.spec.ts --update-snapshots`. For each state open the PNG beside `design/mockups-all.html` (`?state=failed`, `?state=both`, `?theme=`; click the toggle for the sizes) and check exactly these four things, fixing the code until each holds:
  1. **Layout order**: columns in the fixed order; plan line, bar, names; chips sorted need, failed, rest; the toggle top-right; the crab last on the one-line size.
  2. **Tokens**: each element's colour class is the token ALIGNMENT names for it (value `fg`, labels `muted`, hot limits `warn`, alarm `er`, added lines `okText`, alert chip `red` under white).
  3. **Wording**: every string equals the mockup's, except the deviations in design §17.
  4. **Section order and presence**: what shows in each size matches LOCKED "Three sizes".

  Then run `npm run test:visual`. Expected: all pass.
- [ ] **Step 7: Commit**

```bash
git add plugin/hooks/panel/draw.ts plugin/tests/panel-draw.test.ts tests/visual
git commit -m "panel: draw the columns, the plan row, the chips and the three sizes"
```

### Task 13: The pane tree (after Tasks 5, 8, 10)

**Files:**
- Create: `plugin/hooks/pane/draw.ts`, `plugin/tests/pane-draw.test.ts`, `tests/visual/pane.spec.ts`, `plugin/tests/build-pane.ts`

**Interfaces:**
- Consumes: the kit (Task 5), `pickLoops` (Task 8), `crewOf`, `paneLayout`, `PaneItem` (Task 10), `STATES` (Task 4), the harness (Task 2). It defines its own `El` type and `image` with the same signature and rule as Task 12's (`(key, p, loop) => El`); Task 14 folds the two into one.
- Produces:

```ts
export type PaneView = { crew: Crew; ui: Ui; loops: LoopPlan; columns: number; now: number }
export const itemCost: (item: PaneItem) => { host: number; engine: number }   // measured from the drawn element
export const paneTree: (v: PaneView) => El                                     // root Box key 'clawpit-pane'; calls paneLayout with itemCost
// plugin/tests/build-pane.ts
export const paneViewOf: (state: StateName, over?: Partial<PaneView>) => PaneView   // from STATES, with ETA and USUALLY
export const paneLoopCount: (v: PaneView) => number   // the pane's own looping drawings: walkers with a row on screen + (ring ? 1 : 0)
```

Rules: design §8.2, §9, §11. Keys and presses: a row `row-<id>` with press `row:<id>` (crab `crab-<id>`, same press), the helpers toggle `kids-<id>` with press `kids:<id>`, the Ended toggle `ended` with press `ended`, a drawer `drawer-<id>`.

- [ ] **Step 1: Write the failing unit tests**

```ts
test('pane: the title is the flow title, or Subagents', () => {})
test('pane: sections in order: Needs you, Failed, Running, Ended', () => {})
test('pane: the summary line', () => { /* 'both' -> '1 needs you · 1 failed · 2 running · 1 done · ≈$… · ~Nm left'; zero need and failed parts are absent */ })
test('pane: a needs-you row is one looping client 62px tall; only the ring id rings', () => {})
test('pane: a failed row has no ring, says failed and after m:ss, and shows the reason', () => { /* source contains 'failed', 'after 2:10', 'Could not reach Postgres on :5432'; no 'animation' */ })
test('pane: a struggling row starts its activity with N failed tries in warn; slow starts with slower', () => {})
test('pane: the waiting age is in whole minutes', () => { /* 42s -> 'waiting <1m'; 3m10s -> 'waiting 3m' */ })
test('pane: a looping client has the same props one second later', () => { /* as in Task 12, for paneViewOf('needsYou') */ })
test('pane: the drawer lists the log newest first, the error line, and the footer', () => { /* failed drawer: first line 'Failed at step 3 of 4: …', the error line in the mono class, footer 'steps 2/4', 'tries 3', 'context 62%', 'cost ≈$0.07', 'ran 2:10', 'usually 4m' */ })
test('pane: helpers nest with the toggle text, and a failed helper is counted in er', () => { /* '2 helpers · 1 failed' */ })
test('pane: an ended failed row has the cross and failed after m:ss; a done one the check and m:ss', () => {})
test('pane: the empty state', () => { /* one L crab, still, and 'No agents yet' */ })
test('pane: a two-line question is cut with an ellipsis and fits the body width', () => {})
test('pane: every press is one of the three pane forms', () => { /* every Client props.props.press matches /^(row:|kids:).+$|^ended$/ */ })
test('pane: 80 agents stay under both bounds', () => { /* JSON length of the tree <= HOST_MAX; engine count <= ENGINE_MAX; a '+N more' line exists */ })
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: `pane-draw.test.ts` fails.
- [ ] **Step 3: Implement `pane/draw.ts` and `plugin/tests/build-pane.ts`.**
- [ ] **Step 4: Run** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 5: Write the visual tests** `tests/visual/pane.spec.ts`

```ts
const SHOTS = ['hydra','needsYou','failed','both','drawerOpen','helpers','emptyPane','manyAgents'] as const
for (const s of SHOTS) for (const theme of ['dark','light'] as const) for (const w of [36, 52] as const)   // narrow, wide
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme }); await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`)
  })
test('pane: nothing animates while idle', async ({ page }) => { /* 'emptyPane' and an idle crew of ended runs -> { drawings: 0, eased: 0 } */ })
test('pane: a held failure does not move in the pane', async ({ page }) => { /* 'failed' with busy false, armed true, no running agents -> 0 drawings */ })
for (const s of ['hydra','needsYou','both'] as const)
  test(`pane: ${s} loops match the plan and the budget`, async ({ page }) => { /* as in Task 12, with paneLoopCount */ })
test('pane: every Svg and Client has a non-empty alt', () => {})
```

- [ ] **Step 6: Create the baselines and review them for mockup parity**, with the same four checks as Task 12 Step 6, read for the pane: section order Needs you, Failed, Running, Ended; the four row columns (crab 38px, title and activity, the 88px reading column, chevron); the crew bar's fill rule; wording against the mockup except design §17. Then `npm run test:visual`. Expected: all pass.
- [ ] **Step 7: Commit**

```bash
git add plugin/hooks/pane/draw.ts plugin/tests/pane-draw.test.ts tests/visual
git commit -m "pane: draw the roster, the drawer, the helpers and the crew bar"
```

---

## Hydra run

**Version:** Hydra 0.3.9 (the `feat/0.3.9` line of the Hydra checkout). `decisionLog` exists only from 0.3.9. On the installed 0.3.8, drop `decisionLog` and append the text of `docs/decisions/LOCKED.md` to every brief; every other option below exists in both.

**Before the run** (build session):
1. The plan and the design are approved and merged to `main`. Cut `feat/build` from `main` in the clawpit checkout, then do Tasks 1 to 4 on it in session.
2. In the claude-kit checkout cut the local branch `clawpit/step-fields` from `main`.
3. Set up the `hydra-local` remote in both checkouts as Hydra's local-only mode describes, and push the base and feature branches into it.
4. Workstream models are explicit: `sonnet` for bounded modules, `opus` where the rules interlock. Reviews run one tier up, except that `fable` reviews only the two `opus` workstreams that draw, named here on purpose: `track-b` and `crew` are reviewed by `opus`, and so is the whole-branch pass. Validators stay on `opus`.

```
Workflow({
  scriptPath: "<run dir>/workflow.js",
  args: {
    skillDir: "<hydra checkout>/skills/run",
    cycles: null,                      // converge: no critical or major finding left
    maxCycles: 4,
    tokenBudget: 4000000,
    localOnly: true,                   // nothing reaches a remote; pushing stays the maintainer's
    wbReviewModel: "opus",             // fable reviews only the two draw workstreams
    decisionLog: "<clawpit checkout>/docs/decisions/LOCKED.md",
    docsRepos: [],                     // docs are Task 21, in session
    workstreams: [
      { id: "kit",          repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--kit",          model: "sonnet",
        files: ["plugin/hooks/tokens.ts","plugin/hooks/text.ts","plugin/hooks/icons.ts","plugin/hooks/crab.ts","plugin/tests/tokens.test.ts","plugin/tests/text.test.ts","plugin/tests/icons.test.ts","plugin/tests/crab.test.ts","tests/visual/kit.spec.ts","tests/visual/kit.spec.ts-snapshots/"],
        brief: BRIEF(5), gate: G },
      { id: "track-a",      repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--track-a",      model: "sonnet",
        files: ["plugin/hooks/track/activity.ts","plugin/hooks/track/steplog.ts","plugin/hooks/track/tests.ts","plugin/tests/activity.test.ts","plugin/tests/steplog.test.ts","plugin/tests/tests.test.ts"],
        brief: BRIEF(6), gate: G },
      { id: "track-b",      repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--track-b",      model: "opus", reviewModel: "opus",
        files: ["plugin/hooks/track/eta.ts","plugin/hooks/track/turn.ts","plugin/hooks/track/pace.ts","plugin/hooks/track/context.ts","plugin/hooks/track/code.ts","plugin/tests/eta.test.ts","plugin/tests/turn.test.ts","plugin/tests/pace.test.ts","plugin/tests/context.test.ts","plugin/tests/code.test.ts"],
        brief: BRIEF(7), gate: G },
      { id: "loops",        repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--loops",        model: "sonnet",
        files: ["plugin/hooks/loops.ts","plugin/tests/loops.test.ts"],
        brief: BRIEF(8), gate: G },
      { id: "panel-logic",  repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--panel-logic",  model: "sonnet",
        files: ["plugin/hooks/panel/columns.ts","plugin/hooks/panel/fold.ts","plugin/tests/columns.test.ts","plugin/tests/fold.test.ts"],
        brief: BRIEF(9), gate: G },
      { id: "crew",         repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--crew",         model: "opus", reviewModel: "opus",
        files: ["plugin/hooks/model.ts","plugin/hooks/pane/layout.ts","plugin/tests/model.test.ts","plugin/tests/layout.test.ts"],
        brief: BRIEF(10), gate: G },
      { id: "panel-draw",   repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--panel-draw",   model: "opus", reviewModel: "fable",
        after: ["kit","loops","panel-logic","crew"],
        files: ["plugin/hooks/panel/draw.ts","plugin/tests/panel-draw.test.ts","tests/visual/panel.spec.ts","plugin/tests/build.ts","tests/visual/panel.spec.ts-snapshots/"],
        humanCheck: "Run `npx playwright show-report` (or open tests/visual/panel.spec.ts-snapshots/). For hydra, needsYou, failed, both, context90 and the two folded sizes, dark and light, compare with design/mockups-all.html on the four parity points of Task 12 Step 6: layout order, tokens, wording, what shows in each size.",
        brief: BRIEF(12), gate: G },
      { id: "pane-draw",    repo: "<clawpit checkout>", featureBranch: "feat/build", branch: "feat/build--pane-draw",    model: "opus", reviewModel: "fable",
        after: ["kit","loops","crew"],
        files: ["plugin/hooks/pane/draw.ts","plugin/tests/pane-draw.test.ts","tests/visual/pane.spec.ts","plugin/tests/build-pane.ts","tests/visual/pane.spec.ts-snapshots/"],
        humanCheck: "Open tests/visual/pane.spec.ts-snapshots/. For needsYou, failed, both, drawerOpen, helpers and emptyPane, dark and light, compare with design/mockups-all.html on the four parity points of Task 13 Step 6.",
        brief: BRIEF(13), gate: G },
      { id: "savvy-step",   repo: "<claude-kit checkout>", featureBranch: "clawpit/step-fields", branch: "clawpit/step-fields--savvy-step", model: "sonnet",
        files: ["plugins/savvy-progress/hooks/register.tsx","plugins/savvy-progress/types/index.d.ts","plugins/savvy-progress/tests/clawpit.test.ts"],
        brief: BRIEF(11), gate: "claude plugin validate plugins/savvy-progress && claude plugin test plugins/savvy-progress" }
    ],
    repos: [
      { repo: "<clawpit checkout>", hot: ["**/README*", "docs/**", "design/**", "AGENTS.md", "**/package.json", "**/package-lock.json", "playwright.config.ts", "tests/visual/harness.ts", "tests/visual/harness.spec.ts", "plugin/hooks/register.tsx", "plugin/hooks/hooks.json", "plugin/types/**", "plugin/tests/fixtures/**"] },
      { repo: "<claude-kit checkout>", copyExcluded: ["plugins/savvy-progress/tests/zz.preview.test.ts"] }
    ]
  }
})
```

- `G` is the gate from Global Constraints, as one string.
- `BRIEF(n)` is: *"Implement Task n of `docs/plans/2026-11-21-clawpit-build-plan.md` exactly: its Files, Interfaces and steps, test first. Read the design sections the task names in `docs/plans/2026-11-21-clawpit-technical-design.md`, the Global Constraints of the plan, and `AGENTS.md`, which binds you. Touch only your files. If you need a change in `plugin/types/` or `plugin/tests/fixtures/`, return it as a shared edit. Commit subjects are `area: what changed`, with no trailers. If an attempt fails, report it with the step tool: `failed: true`, `reason` (one sentence), `error` (the exact error line)."* For Task 11 the plan and design are quoted into the brief, because they are not in the claude-kit tree.
- **Dependencies**: `after` is used only between workstreams of one repo. Six workstreams start at once; the two that draw start when theirs have merged.
- **Human checks**: two pauses, after `panel-draw` and after `pane-draw` merge. Resume with `resumeFromRunId` and `humanChecks` as Hydra prints them. A problem reported there goes back to its author.
- **Converge** means no critical or major finding is open on any workstream and on the whole-branch pass; with `decisionLog` set, the drift audit runs after the repos are final and each unlogged change comes back as a question.
- **After the run**: fetch the branches back from `hydra-local` as local branches, check each feature branch's head equals the run's `finalSha`, run `G` once in the clawpit checkout, and leave both `hydra-local` remotes until the maintainer is done.

---

## Part C: hook-ins, in session, one at a time

### The app check procedure (used by Tasks 15 to 19)

Each hook-in ends with an app check, then the maintainer's short by-eye gate. Real-renderer automation is blocked by design (design §12), so the app check is scripted capture plus a pixel diff.

1. **Sync**: run the maintainer's local mods-check script for `clawpit` and for `savvy-progress` (it validates, tests, and copies each checkout over its installed copy), then the maintainer runs `/reload-plugins`.
2. **Reach each state the task owns.** By fixture first: the build session spawns the fixture agents itself, as written in `tests/app-check/README.md` (three agents that call the step tool between sequential `date` calls; one with `blocked`; one with `failed: true`, a `reason` and an `error`, three times; a `progress` call with seven tasks). Use computer use only for what a prompt cannot do: clicking the fold toggle, clicking a pane row, clicking a helpers toggle. The first use asks the maintainer for access to the Claude app, once.
3. **Capture** each state: `bash scripts/app-capture.sh <task> <state>`. Dark and light: the maintainer flips the system appearance, and each state is captured again with the suffix `-light`.
4. **Idle check**: with nothing running, capture `idle-1`, `idle-2`, `idle-3` two seconds apart, then `npm run app-diff -- <task> --idle`. Expected: 0 changed pixels in the panel and pane regions. No masks, except the system clock if it falls inside a crop.
5. **Diff**: `npm run app-diff -- <task>`. A first run reports every state as `new`. A `fail` is a defect to fix, or a change to review.
6. **Compare** each `current` shot with `design/mockups-all.html` and with the Playwright baseline of the same state, against this checklist: nothing clipped; the lead column aligned across rows; the right edge flush; no text cut mid-word without an ellipsis; each colour is the right token; section order; wording; the count badge clear of the "?" bubble.
7. **Accept**: after the reviewing session, or the maintainer, has looked at every diff, `npm run app-diff -- <task> --accept`.
8. **By-eye gate**: the maintainer looks only at what steps 5 and 6 flagged as unsure, plus the task's own short list.

Shots stay under `artifacts/app-checks/<task>/`. They show real session content and are never committed. Capture cannot measure CPU or frame time; Task 20 covers that.

### Task 14: Wiring: atoms, observers, the Client module

**Files:**
- Create: `plugin/hooks/client/image.tsx`, `plugin/hooks/draw.ts`, `plugin/tests/wiring.test.ts`, `plugin/tests/image.test.tsx`
- Modify: `plugin/hooks/register.tsx`, `plugin/hooks/panel/draw.ts`, `plugin/hooks/pane/draw.ts`, `plugin/hooks/track/activity.ts`

**Interfaces:**
- Consumes: every module from Part B.
- Produces:
  - `plugin/hooks/draw.ts`: the one `image(key, p, loop)` and `El`, imported by both draw modules (their own copies are deleted). `track/activity.ts` drops its `clean` for `oneLine` and `clip`.
  - `client/image.tsx`: `export default Image: ClientModule<ImageProps, { isHover: boolean }>`, design §9.
  - In `register.tsx`, no drawing yet: the atoms of design §4; `session.start` (sets `takeover` on a desktop surface, loads `size` and every `eta:*` key from `$.store`, takes a first `$.session.usage({ breakdown: 'summary' })`); observers for `tool.call` (catch-all), `agent.spawn`, `turn.start`, `turn.step`, `turn.complete`, `session.measure`, and `state.set` on savvy's `agents`; the tick rule of design §4; the 600,000 ms wake of design §6.8; `ui.message` for the five presses.
  - `export const view: ($: EngineInterface, bodyColumns: number) => Promise<{ panel: PanelView; pane: PaneView }>`: reads the atoms and module state once and builds both views from one `crewOf`. It reads `{ plugin: 'ponytail', key: 'band' }` and sets `stats.code = codeOf(band)` (decision M5); a failed read gives `null`.

- [ ] **Step 1: Write the failing tests** (engine mock: `mock` clock, store and state from `claude-code/testing`)

```ts
test('wiring: a throwing tracker leaves the tool result untouched', …)     // a tool.call whose result is { structuredPatch: 7 } returns exactly what the test's beneath-hook returned
test('wiring: N tool calls write no atom', …)                                // 20 Read calls from an agent -> 0 state.set events for plugin 'clawpit'
test('wiring: an agent tool call sets that agent\'s activity, a main one the main\'s', …)
test('wiring: turn.start then turn.complete fills the session figures and idleSince', …)
test('wiring: a test run shows the tests stat, and the next edit clears it', …)
test('wiring: an answered agent turn records its duration once, a second run of the same agent does not', …)   // $.store 'eta:<key>' has length 1
test('wiring: a failed or aborted agent turn records nothing', …)
test('wiring: the step log follows savvy\'s agents atom', …)                // set savvy agents twice (note added) -> view().pane crew agent log length 1
test('wiring: savvy absent: the views still build, with the empty crew', …)
test('wiring: ponytail absent gives code null; its band atom gives reuse and callers', …)
test('wiring: the size press cycles and persists; a bad stored size is full', …)
test('wiring: row, kids and ended presses change only the ui atom and never the store', …)
test('wiring: an unknown press is ignored and answered {}', …)
test('wiring: the tick runs at 1 Hz while busy and stops when idle with nothing time-based on screen', …)
test('wiring: ten minutes after the turn ends one tick fires and the view is no longer armed', …)
test('wiring: on the terminal surface takeover stays false', …)
test('image: a left press posts its press; hover toggles state; no press prop posts nothing', …)   // driven through $.ui.mount on desktop
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the two new files fail.
- [ ] **Step 3: Implement.** Every observer has the shape `const out = await next(e); try { … } catch { errors += 1 } return out`.
- [ ] **Step 4: Run** `G`. Expected: passes.
- [ ] **Step 5: Commit**

```bash
git add plugin
git commit -m "wiring: add the atoms, the observers and the image client"
```

No app check: nothing is drawn yet.

### Task 15: Hook-in: the panel above the prompt

**Files:**
- Modify: `plugin/hooks/register.tsx`, `tests/app-check/regions.json`
- Test: `plugin/tests/panel-hook.test.tsx`

**Interfaces:**
- Consumes: `view`, `panelTree`, `COMPACT_KEY`.
- Produces: `on('ui.render', { component: 'AbovePrompt' }, …)` with a `.catch` that draws the one-line failure. On `hasSurvey` or the terminal surface it returns `next(e)`. The "Compact now" Button gets `onPress` → `$.command.run({ command: 'compact' })`.

- [ ] **Step 1: Write the failing tests**

```ts
test('panel hook: desktop draws the panel root; terminal and a survey pass through', …)
test('panel hook: bodyColumns sets the column count', …)                      // mount at 46 and 88 cells
test('panel hook: Compact now runs /compact once per press', …)
test('panel hook: a throwing draw shows the failure line, not a blank', …)
test('panel hook: savvy\'s band stays out while takeover is true', …)          // with savvy loaded beside it, no key 'savvy-agents' in the band
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the new file fails.
- [ ] **Step 3: Implement the hook.**
- [ ] **Step 4: Run** `G`. Expected: passes.
- [ ] **Step 5: App check**, task name `panel`, at full size only. States: `idle`, `busy`, `agents` (three fixture agents), `needs-you`, `failed`, `hydra` (a `progress` flow), `context90` if the session is there, each in dark and light. First, from one real capture, replace the guessed `panel` and `pane` boxes in `tests/app-check/regions.json` and add the masks for the turn clock, the costs and the token count.
- [ ] **Step 6: By-eye gate** (maintainer):
  - [ ] The panel sits above the prompt with no savvy band, no ponytail tiles overlapping it, and no blank row.
  - [ ] Columns line up on one baseline, and no image is letterboxed or cut at the right. If it is, tune `CELL_PX` and re-run Step 4 and Step 5.
  - [ ] The context needle settles once when the value changes and does not twitch each second.
  - [ ] Chips: the wash, the crab and the text read as one chip; a walking crab does not restart every second.
  - [ ] Light mode: every text reads.
  - [ ] Reuse and callers show only when the width has room after every other column, step aside first as it narrows, and callers reads in amber.
- [ ] **Step 7: Commit**

```bash
git add plugin tests/app-check/regions.json
git commit -m "panel: draw the panel above the prompt"
```

### Task 16: Hook-in: the toggle and the three sizes

**Files:**
- Modify: `plugin/hooks/register.tsx`
- Test: `plugin/tests/sizes.test.tsx`

**Interfaces:**
- Consumes: the `size` and `open` presses from Task 14, `panelTree`.
- Produces: nothing new in code beyond what the tests force; this task proves the toggle Client, the folded agents column and the one-line size in the app.

- [ ] **Step 1: Write the failing tests**

```ts
test('sizes: pressing the toggle steps full, gauges, line, full and redraws each', …)      // ui.pointer on key 'toggle'
test('sizes: the size survives a new session.start', …)
test('sizes: the mascot client keeps its key across gauges and line', …)                   // key 'mascot' present in both, so it is not remounted
test('sizes: pressing the folded agents column opens the pane clawpit-agents', …)
test('sizes: the toggle shows the dot only while folded with a waiter or a failure', …)
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: fails where the wiring falls short; fix in `register.tsx`.
- [ ] **Step 3: Run** `G`. Expected: passes.
- [ ] **Step 4: App check**, task name `sizes`. With the `needs-you` fixture up, click the toggle through all three sizes with computer use and capture `full`, `gauges`, `line`; then the same with the `failed` fixture; dark and light.
- [ ] **Step 5: By-eye gate** (maintainer):
  - [ ] The toggle is clickable, 24px, and its picture matches the size it is in.
  - [ ] Folded: the badge sits at the crab's bottom corner and does not cover the "?".
  - [ ] The hop and the stagger are not clipped at the image's edge.
  - [ ] The size is remembered after `/reload-plugins`.
- [ ] **Step 6: Commit**

```bash
git add plugin
git commit -m "panel: wire the size toggle and the folded agents column"
```

### Task 17: Hook-in: the Agents pane

**Files:**
- Modify: `plugin/hooks/register.tsx`
- Test: `plugin/tests/pane-hook.test.tsx`

**Interfaces:**
- Consumes: `view`, `paneTree`, the presses.
- Produces: `on('ui.render', { component: 'Pane', requestId: 'clawpit-agents' }, …)` with a `.catch` failure line; auto-open: `$.ui.open({ id: 'clawpit-agents', title: 'Agents' })` on the first `agent.spawn` of each crew (keyed by the flow title, or `Subagents`), once; `ui.paneOpen` follows `ui.open` and `ui.close` for that id.

- [ ] **Step 1: Write the failing tests**

```ts
test('pane hook: the first spawn opens the pane once; a second spawn of the same crew does not reopen a closed pane', …)
test('pane hook: pressing a row opens its drawer; pressing it again closes it; another row moves it', …)
test('pane hook: pressing the helpers toggle and the Ended toggle fold and unfold', …)
test('pane hook: closing the pane clears paneOpen, and the ring leaves the loop count', …)
test('pane hook: with no agents the pane draws the empty state', …)
test('pane hook: a throwing draw shows the failure line', …)
test('pane hook: 80 agents mount within the bounds on desktop', …)
```

- [ ] **Step 2: Run** `claude plugin test plugin`. Expected: the new file fails.
- [ ] **Step 3: Implement the hook.**
- [ ] **Step 4: Run** `G`. Expected: passes.
- [ ] **Step 5: App check**, task name `pane`. States: `empty`, `running` (three agents, one with two helpers), `needs-you`, `failed` (with a reason and an error line), `both`, `drawer` (click a row with computer use), `helpers-shut`, `ended-open`; dark and light.
- [ ] **Step 6: By-eye gate** (maintainer):
  - [ ] The pane opens beside the file tree without taking the front tab from it more than once.
  - [ ] The reading column is flush right and the same width on every row.
  - [ ] The needs-you ring pulses on the beat, inside the row, and only on one row.
  - [ ] A failed row is still. The error line renders in a monospace face.
  - [ ] Opening a drawer does not restart any walking crab.
- [ ] **Step 7: Commit**

```bash
git add plugin
git commit -m "pane: draw the Agents pane and wire its presses"
```

### Task 18: Retire ponytail's band and skins' usage footer

No repo is edited; both are settings on the maintainer's machine.

- [ ] **Step 1: Record what each shows today.** Capture `before` with `bash scripts/app-capture.sh retire before`.
- [ ] **Step 2 (maintainer): switch ponytail's band off** with ponytail's own band command (it writes `off` to its band flag file in the user's Claude config folder; its band hook reads that file and draws nothing).
- [ ] **Step 3 (maintainer): switch skins' usage footer off** in the skins settings (the active skin's `band` preference goes false). Transcript row styling stays on.
- [ ] **Step 4: Check the information is kept.** Against the `before` shot, tick each figure off in the panel: session cost, last turn cost, tokens, turns, agent time, tests, context, the 5h and 7d limits with pace. Reuse and callers-open are kept as the two lowest-priority columns (decision M5): with ponytail's band off, its `band` atom still updates (only its render hook reads the flag), so check both columns move after an edit, on a width where they have room.
- [ ] **Step 5: App check**, task name `retire`: `idle` and `busy`, dark and light. Expected: one panel above the prompt, nothing of ponytail's or skins' beside it.
- [ ] **Step 6: By-eye gate** (maintainer): the transcript rows are still skinned; nothing else above the prompt moves.

Nothing to commit.

### Task 19: The file tree switch

An operations task with the maintainer present; clawpit's repo is not changed.

- [ ] **Step 1 (maintainer): install upstream** `data-goblin/claude-code-filetree` from its own marketplace, pinned at tag `v0.8.5`.
- [ ] **Step 2 (maintainer): set** `start=off`, `work=off`, `shimmer=on` in its settings. Confirm the three option names in its manifest first; they were not verified for this plan.
- [ ] **Step 3 (maintainer): uninstall** `filetree@nati-mods`.
- [ ] **Step 4: Archive the fork.** In the fork's checkout: tag the head `archive/2026-11-21`, add one line to its README saying it is archived in favour of upstream, commit locally. Do not delete the checkout. Archiving the remote repository is the maintainer's click.
- [ ] **Step 5: Drop the fork from the maintainer's local mods-check list** and add `clawpit`.
- [ ] **Step 6: App check**, task name `filetree`: the Files tab and the Agents tab, with an agent running; dark and light; then the idle check.
- [ ] **Step 7: By-eye gate** (maintainer): the Agents pane and the file tree share the side pane without stealing the front tab; light mode is readable; the shimmer stops when Claude stops; nothing moves when idle.

### Task 20: Measure the animation cost and finalize the budget

**Files:**
- Modify: `plugin/hooks/register.tsx`, `plugin/hooks/loops.ts`, `docs/decisions/ANIMATION-LIMIT.md`
- Test: `plugin/tests/bench.test.tsx`

**Interfaces:**
- Produces: a command `/clawpit-bench <n> [eased]`, registered only when the environment variable `CLAWPIT_BENCH` is `1`. It makes the pane draw `n` walking crab Clients (M size), ignoring the budget; `eased` swaps the walk for an eased loop of the same size. `/clawpit-bench 0` restores the pane.

- [ ] **Step 1: Write the failing tests**

```ts
test('bench: the command is not registered by default', …)
test('bench: with CLAWPIT_BENCH=1, n crabs are drawn as n looping clients', …)     // n = 12 -> 12 Client nodes
test('bench: 0 restores the normal pane', …)
```

- [ ] **Step 2: Implement, run `G`.** Expected: passes.
- [ ] **Step 3 (maintainer, about 20 minutes): measure**, as `docs/decisions/ANIMATION-LIMIT.md` describes.
  1. Run `uptime` and check for stray processes first.
  2. For `n` = 0, 1, 3, 6, 12: run `/clawpit-bench n`, wait 10 s, then read "Claude Helper (Renderer)" and "Claude Helper (GPU)" in Activity Monitor: %CPU and Energy, averaged over 30 s. Write the numbers down.
  3. At `n` = 3, run `/clawpit-bench 3 eased` and read the same.
  4. Type in the prompt during `n` = 6 and note any stutter.
  5. Optional, a manual trace: Help → Enable Developer Mode; restart the app; right-click the panel → Inspect Element; in the Performance tab record 10 s at `n` = 6, and turn on Paint flashing with nothing running. **Undo afterwards**: remove `"allowDevTools": true` from the app's `developer_settings.json` (or turn Developer Mode off in the Help menu) and restart the app.
- [ ] **Step 4: Decide.** Pass bar: CPU within 3 to 5 points of `n` = 1; no stutter while typing; no paint flashes while idle. Set `BUDGET` in `loops.ts` to the largest counts that pass (keep `walkers` 3 and `walkersOnBeat` 2 unless the maintainer changes the locked rule). Run `G`. Expected: passes, because the tests read `BUDGET`.
- [ ] **Step 5: Record.** Add a dated "Measured" section to `docs/decisions/ANIMATION-LIMIT.md` with the table of numbers, the chosen budget and what was not measured. This edits a locked decision: it needs the maintainer's OK in the same step.
- [ ] **Step 6: Commit**

```bash
git add plugin docs/decisions/ANIMATION-LIMIT.md
git commit -m "loops: set the loop budget from the measured cost"
```

### Task 21: Docs, the preview rule and the README

**Files:**
- Modify: `AGENTS.md`, `README.md`, `design/mockups-all.html` (only if a deviation was accepted into the design), `design/preview-dark.png`, `design/preview-light.png`
- Test: `scripts/docs.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
test('docs: AGENTS.md keeps the preview rule and names the baselines', () => {
  const t = readFileSync('AGENTS.md', 'utf8')
  assert.match(t, /## The preview rule/); assert.match(t, /bash scripts\/preview\.sh/); assert.match(t, /npm run refresh:visual/)
})
test('docs: the README no longer says the build has not started', () => assert.doesNotMatch(readFileSync('README.md', 'utf8'), /build not started/))
```

- [ ] **Step 2: Run** `npm run test:scripts`. Expected: 2 failures.
- [ ] **Step 3: Edit.** `AGENTS.md`, "The preview rule": keep both existing steps and add a third, "Refresh the Playwright baselines in the same change: `npm run refresh:visual` runs it together with the previews." Add `npm run test:visual` and `npm run test:scripts` to "Quality gate", and the path `plugin` to the two `claude plugin` commands. `README.md`: the status line, an install section (`/plugin marketplace add nycom/clawpit`, then `/plugin install clawpit@clawpit`), the requirement that savvy-progress is installed, and a "How it is tested" paragraph.
- [ ] **Step 4: Run** `npm run refresh:visual`, then `G`. Expected: both previews rewritten; `G` passes.
- [ ] **Step 5: Commit**

```bash
git add AGENTS.md README.md design scripts/docs.test.mjs tests/visual
git commit -m "docs: keep the preview rule with the baselines and update the README"
```

### Task 22: Full verification

- [ ] **Step 1: The unit suite.** `claude plugin test plugin`. Expected: `0 fail`.
- [ ] **Step 2: Validate.** `claude plugin validate plugin`. Expected: no error. Read its list of hooks and state reads: it must name exactly the hooks of Tasks 14 to 17 and 20, and the reads `savvy-progress.flow`, `savvy-progress.agents` and `ponytail.band`.
- [ ] **Step 3: The mods-check gate.** The maintainer's local mods-check script for `clawpit` and `savvy-progress`. Expected: both `ok`.
- [ ] **Step 4: Playwright.** `npm run test:visual`. Expected: all pass, no baseline written.
- [ ] **Step 5: The script tests.** `npm run test:scripts`. Expected: `fail 0`.
- [ ] **Step 6: The app diff, every task's states.** Re-capture every state of `panel`, `sizes`, `pane`, `retire` and `filetree` (the app check procedure, steps 2 to 4), then `for t in panel sizes pane retire filetree; do npm run app-diff -- $t && npm run app-diff -- $t --idle; done`. Expected: every row `pass`, exit 0.
- [ ] **Step 7: The leak check.** `bash scripts/leak-check.sh`. Expected: `leak-check: clean`. Also `git status --short artifacts` prints nothing tracked.
- [ ] **Step 8: The previews.** `bash scripts/preview.sh`, then `git status --short design`. Expected: no change, or only the two PNGs if the design changed since Task 21; commit them if so.
- [ ] **Step 9: The savvy checkout.** `claude plugin test plugins/savvy-progress` in the claude-kit checkout. Expected: `187 pass`, `0 fail`. `git branch -r --contains clawpit/step-fields` prints nothing: the branch is on no remote.
- [ ] **Step 10: Write the "not checked" list** for the PR description, from design §19 and whatever the app checks left unsure. Open the PR only on the maintainer's go.

---

## Decisions only the maintainer can make

| # | Gap | Options | Recommendation |
|---|---|---|---|
| M1 | Two agents wait at once. The locked row "carries a ring pulse", and two rings are two images with two clocks that drift | (a) one ring, on the longest waiter; the others are tinted and still. (b) every waiter rings | (a). One beat on screen points at one thing, and it costs one loop slot |
| M2 | The mockup's "waiting 0:42" ticks each second, and a prop that changes each second restarts the ring's image | (a) the age in whole minutes: "waiting <1m", "waiting 3m". (b) keep m:ss and draw the ring as a separate layer over the row, which rests on absolute positioning that has not been seen working in the app | (a). No unknowns, and minutes are enough for "who has waited longest" |
| M3 | A flow not run by Hydra, and the mockup's "Hydra · retro fixes" | (a) show the flow's own title as sent. (b) always prefix "Hydra ·" | (a). The data does not say who runs the flow; Hydra can send the prefix itself |
| M4 | Background shells, monitors and crons have no place in the locked pane, and savvy's own pane no longer auto-opens | (a) leave them in savvy's `/agents-info` pane for now. (b) design a Background section for the Agents pane first | (a) for this build; (b) as a follow-up design |
| M5 | ponytail's reuse and callers-open tiles have no column in the locked panel | (a) drop them. (b) add columns, which changes a locked list | (a) |
| M6 | Session, tokens and agent-time figures | (a) this session only, from the plugin's load. (b) a running lifetime total in `$.store` | (a). It matches the engine's session cost beside it |
| M7 | The plan's "Hydra run" section and the model names in it describe how the build is run; `AGENTS.md` says the repo carries no tooling trace | (a) keep the section while building and remove it from the plan before the PR. (b) keep it: Hydra is a product the mod draws, and the section is the run's record. (c) move it to a local file now | (a) |
| M8 | Installing savvy's local change: the installed copy is refreshed from the local branch, so a later update of savvy from its public source would undo it | (a) accept and re-apply after each update. (b) pin savvy to the local checkout | (b) |

### Answers (the maintainer, 2026-11-21)

| ID | Answer |
|---|---|
| M1 | (a) One ring, on the longest waiter. |
| M2 | (a) Whole minutes: "waiting 3m". |
| M3 | (a) The flow's title as sent, no forced prefix. |
| M4 | (a) Background shells, monitors and crons stay in savvy's `/agents-info` for this build. A Background section in clawpit's pane is a later task. |
| M5 | **(b) Add reuse and callers-open as the two lowest-priority columns.** They show only when the width has room after every other column, and they step aside first. Before the Hydra run, read ponytail's source to find how it computes both figures and whether they can be read with its band off. Then amend Tasks 7 (tracker), 9 (column ranking: `reuse` and `callers` after `tokens` and `agent`), 12 (column drawing), 15 (by-eye list) and 18 Step 4 (both figures are kept, not dropped). |
| M6 | (a) This session only. |
| M7 | (a) Keep the "Hydra run" section and model names while building; strip them before this plan goes into a PR. |
| M8 | (a) Pin savvy-progress to the local claude-kit checkout, so an upstream update cannot undo the local change. |
| M9 | The fixture's flow tasks are titled as the runs they match (`savvy-progress implement`, `e2e tests`, …), as savvy's own contract asks, instead of the mockup's short names `fold`, `fixtures`. Asked during the build, because the plan's match rule could not link the mockup's names to the runs. |

**How M5 is built.** ponytail 5.3.3 keeps `reused`, `created` and `openCallers` in its `{ plugin: 'ponytail', key: 'band' }` atom. Its `tool.call` and `turn.complete` observers update it whatever the band flag says; only its `AbovePrompt` render hook reads `.ponytail-band`. So clawpit reads the atom, as savvy reads skins' theme, and computes the share the way ponytail does (`hooks/band/metrics.ts`, `percent`: no share under 3 functions). Nothing is computed twice and nothing needs the band on.

## Self-review

- **Spec coverage.** Panel columns, priorities and fit: Tasks 9, 12, 15. Sizes and the toggle: Tasks 9, 12, 16. Plan row: Tasks 10, 12. Chips, costume order, failed and struggling: Tasks 8, 10, 12. Pane sections, rows, drawer, helpers, crew bar, empty state: Tasks 10, 13, 17. Trackers (ETA, pace, turns left, auto-compact, tests, idle timer): Tasks 6, 7, wired in 14. Loop budget: Tasks 8, 12, 13, 20. Size budgets: Tasks 10, 12, 13, 17. Reduced motion, light and dark: Task 5, shot in 12 and 13. Error handling: Tasks 6, 14, 15, 17. savvy diff: Task 11. Retirements: Task 18. File tree: Task 19. Scaffolding, CI, validate gate: Task 1. Preview rule kept: Task 21. Playwright, parity, accessibility: Tasks 2, 5, 12, 13. In-app capture and diff: Tasks 3, 15 to 19, 22. Measurement: Task 20. Gaps found and closed while reviewing: the `image` helper was defined twice (Task 14 now unifies it); `clean` in Task 6 duplicated `oneLine` (Task 14 removes it).
- **Step scan.** Each test step names its tests and asserts with the spec's values; where a test body is a comment, the comment states the input and the expected value. Each code step gives the signature and the rule's section in the design.
- **Type consistency.** `LoopPlan`, `Crew`, `CrewAgent`, `PaneItem`, `PanelView`, `PaneView`, `ImageProps`, `Settle`, `Eta` are spelled the same in Tasks 4 to 17. `image(key, p, loop)` has one signature in Tasks 12, 13 and 14. Presses are `size`, `open`, `row:<id>`, `kids:<id>`, `ended` in the design, Task 13 and Task 14.
- **Review Focus.** Five lines, each with named tests in Tasks 5, 6, 7, 9, 10, 12, 14.
- **Proportion.** The plan is about twice the design's length; code blocks are test names and signatures, not bodies.

## Not verified while writing this plan

- Nothing was run: no test, no install, no app session.
- The exact output format of `claude plugin test` beyond its `N pass` / `N fail` summary lines, and whether it accepts a single-file filter (the plan never relies on one).
- `$.ui.mount`'s pointer and find helpers are used as the engine's test kit describes them; their exact names are checked in Task 1 when the first test runs.
- The pinned package versions were chosen from memory and are confirmed by `npm install` in Task 2.
- Hydra 0.3.9 is an unreleased line; if its arguments change before the run, the invocation follows its own skill file.
- Upstream filetree's option names; the fork's archive steps on its remote.
