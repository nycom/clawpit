// Named fixture states, shared by the unit tests and the visual suite. `hydra` is the mockup's dataset
// (seed() and ST in design/mockups-all.html); the flow's task titles equal the run descriptions they match,
// as savvy-progress's contract asks of real data.
import type { Activity, SavvyFlow, SavvyRun, Stats, Ui } from '../../types'

export const NOW = 1_800_000_000_000

export type StateName = 'idle' | 'busy' | 'hydra' | 'needsYou' | 'failed' | 'both' | 'context90' | 'limitAhead'
  | 'sizeGauges' | 'sizeLine' | 'drawerOpen' | 'helpers' | 'emptyPane' | 'manyAgents'
export type Fixture = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>
  stats: Stats; ui: Ui; busy: boolean; armed: boolean }

const MAX = 200_000
const run = (id: string, type: string, description: string, model: string, ago: number, o: Partial<SavvyRun>): SavvyRun =>
  ({ id, agentId: id, type, description, model, status: 'running', startedAt: NOW - ago, contextTokens: 0, contextMax: MAX, costUsd: 0, ...o })
const ctx = (pct: number) => ({ contextTokens: pct * MAX / 100 })
const act = (kind: Activity['kind'], verb: string, target: string, ago: number): Activity => ({ kind, verb, target, at: NOW - ago })

const HYDRA_RUNS: SavvyRun[] = [
  run('e2e', 'validator', 'e2e tests', 'claude-haiku-5-5', 210_000, { ...ctx(62), costUsd: 0.07, stepDone: 2, stepTotal: 4, stepNote: 'Seeded the fixture data.' }),
  run('imp', 'implementer', 'savvy-progress implement', 'claude-sonnet-5-5', 260_000, { ...ctx(38), costUsd: 0.31, stepDone: 3, stepTotal: 5, stepNote: 'Wired the fold to isWorking. Writing the test next.' }),
  run('rev', 'general-purpose', 'cache-tax review c1', 'claude-opus-5-5', 190_000, { ...ctx(21), costUsd: 0.18, stepDone: 1, stepTotal: 4, stepNote: 'Searching for UNATTENDED across hooks/.' }),
  run('k1', 'Explore', 'find callers of guard', 'claude-haiku-5-5', 90_000, { ...ctx(12), costUsd: 0.02, stepDone: 2, stepTotal: 3 }),
  run('k2', 'Explore', 'map the cache keys', 'claude-haiku-5-5', 60_000, { ...ctx(9), costUsd: 0.01, stepDone: 1, stepTotal: 3 }),
  run('pln', 'general-purpose', 'plan the release', 'claude-fable-5-2', 250_000, { ...ctx(30), costUsd: 0.44, stepDone: 1, stepTotal: 6, stepNote: 'Drafting the release order.' }),
  run('docs', 'Explore', 'docs pass', 'claude-haiku-5-5', 400_000, { ...ctx(15), costUsd: 0.03, status: 'done', endedAt: NOW - 335_000 }),
]
const PARENTS = { k1: 'rev', k2: 'rev' }
const ACTIVITY: Record<string, Activity> = {
  e2e: act('run', 'Running', 'npm test -- login', 20_000),
  imp: act('edit', 'Editing', 'hooks/register.tsx', 12_000),
  rev: act('search', 'Searching', '"UNATTENDED" in hooks/', 60_000),
  k1: act('read', 'Reading', 'types/index.d.ts', 10_000),
  k2: act('search', 'Searching', '"cacheKey" in src/', 15_000),
  pln: act('think', 'Thinking', '', 30_000),
}
const FLOW: SavvyFlow = {
  title: 'Hydra · retro fixes', total: 7, done: 2, phase: 'delegate', isFinished: false,
  tasks: ['schema', 'api', 'savvy-progress implement', 'e2e tests', 'cache-tax review c1', 'plan the release', 'merge'].map(title => ({ title })),
}
const STATS: Stats = {
  context: { pct: 58, msgsPct: 34, turnsLeft: 7, autoPct: 97, alarm: false },
  limits: [
    { kind: 'five_hour', pct: 21, pacePct: 36, projected: 21 / 0.36, ahead: false, hot: false },
    { kind: 'seven_day', pct: 63, pacePct: 48, projected: 63 / 0.48, ahead: true, hot: true },
  ],
  turn: { startedAt: NOW - 102_000, added: 38, removed: 6, costUsd: 0.42 },
  tests: { passed: 179, failed: 0, at: NOW - 180_000 },
  session: { costUsd: 267, lastTurnUsd: 2.46, turns: 44, tokens: 441_000_000, agentMs: 39_000_000 },
}
const UI: Ui = { size: 'full', open: null, shut: ['ended'], paneOpen: true }

const patch = (runs: SavvyRun[], id: string, o: Partial<SavvyRun>) => runs.map(r => (r.id === id ? { ...r, ...o } : r))
const base = (o: Partial<Fixture> = {}): Fixture =>
  ({ flow: FLOW, runs: HYDRA_RUNS, parents: PARENTS, activity: ACTIVITY, stats: STATS, ui: UI, busy: true, armed: true, ...o })

const NEEDS = patch(HYDRA_RUNS, 'e2e', { blocked: 'Postgres or SQLite for the fixture?' })
const FAILED = patch(patch(patch(HYDRA_RUNS,
  'e2e', { status: 'failed', heldDone: true, startedAt: NOW - 170_000, endedAt: NOW - 40_000, failedAttempts: 3,
    failNote: 'Could not reach Postgres on :5432', failLine: 'connect ECONNREFUSED 127.0.0.1:5432' }),
  'rev', { failedAttempts: 3, failNote: '2 hunks still rejected.' }),
  'k2', { status: 'failed', heldDone: true, endedAt: NOW - 12_000, failNote: 'no "cacheKey" in src/' })
const FAILED_ACT = { ...ACTIVITY, rev: act('run', 'Retrying', 'the diff against main', 20_000) }
const IDLE_STATS: Stats = { ...STATS, turn: null, tests: null }

export const STATES: Record<StateName, Fixture> = {
  idle: base({ flow: null, runs: [], parents: {}, activity: {}, stats: IDLE_STATS, busy: false, armed: false }),
  busy: base({ flow: null, runs: [], parents: {}, activity: {} }),
  hydra: base(),
  needsYou: base({ runs: NEEDS }),
  failed: base({ runs: FAILED, activity: FAILED_ACT }),
  both: base({ runs: patch(FAILED, 'pln', { blocked: 'Ship the release notes in this PR, or after it?' }), activity: FAILED_ACT }),
  context90: base({ stats: { ...STATS, context: { pct: 92, msgsPct: 34, turnsLeft: 1, autoPct: 97, alarm: true } } }),
  limitAhead: base({ stats: { ...STATS, limits: [{ kind: 'five_hour', pct: 62, pacePct: 62 / 1.31, projected: 131, ahead: true, hot: true }, STATS.limits[1]] } }),
  sizeGauges: base({ runs: NEEDS, ui: { ...UI, size: 'gauges' } }),
  sizeLine: base({ runs: NEEDS, ui: { ...UI, size: 'line' } }),
  drawerOpen: base({ ui: { ...UI, open: 'imp' } }),
  helpers: base({ ui: { ...UI, shut: ['ended', 'rev'] } }),
  emptyPane: base({ flow: null, runs: [], parents: {}, activity: {}, stats: IDLE_STATS, busy: false, armed: false }),
  manyAgents: base({
    flow: null, parents: {}, activity: {},
    runs: Array.from({ length: 80 }, (_, i) => run(`m${i}`, 'general-purpose', `worker ${i + 1}`, 'claude-sonnet-5-5', 10_000 + i * 1_000,
      { ...ctx(20 + (i % 60)), costUsd: 0.05, stepDone: i % 4, stepTotal: 4, stepNote: `Step ${i % 4} of worker ${i + 1}.` })),
  }),
}
