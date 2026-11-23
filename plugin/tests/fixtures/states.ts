// Named fixture states, shared by the unit tests and the visual suite. `hydra` is the mockup's dataset
// (seed() and ST in design/mockups-all.html); the flow's task titles equal the run descriptions they match,
// as savvy-progress's contract asks of real data.
import type { ConfigRow } from 'claude-code'
import type { Activity, Eta, LogLine, SavvyFlow, SavvyNeed, SavvyRun, Stats, Ui } from '../../types'

export const NOW = 1_800_000_000_000

export type StateName = 'idle' | 'busy' | 'hydra' | 'needsYou' | 'failed' | 'both' | 'context90' | 'limitAhead'
  | 'sizeGauges' | 'sizeLine' | 'drawerOpen' | 'helpers' | 'emptyPane' | 'manyAgents' | 'codeColumns' | 'oneRunning' | 'oneNeedsYou'
  | 'sessionNeed' | 'sessionNeedCrew'
  | 'filePlan' | 'planOutOfOrder'
  | 'offer' | 'offerCrew'
export type Fixture = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>
  logs: Record<string, LogLine[]>; stats: Stats; ui: Ui; busy: boolean; armed: boolean; need?: SavvyNeed | null
  config?: ConfigRow[] }   // config: the `/config` rows, as $.config.list() returns them

const MAX = 200_000
const run = (id: string, type: string, description: string, model: string, ago: number, o: Partial<SavvyRun>): SavvyRun =>
  ({ id, agentId: id, type, description, model, status: 'running', startedAt: NOW - ago, contextTokens: 0, contextMax: MAX, costUsd: 0, ...o })
const ctx = (pct: number) => ({ contextTokens: pct * MAX / 100 })
const act = (kind: Activity['kind'], verb: string, target: string, ago: number): Activity => ({ kind, verb, target, at: NOW - ago })

const HYDRA_RUNS: SavvyRun[] = [
  run('e2e', 'validator', 'e2e tests', 'claude-haiku-5-5', 210_000, { ...ctx(62), costUsd: 0.07, stepDone: 2, stepTotal: 4, stepNote: 'Seeded the fixture data.' }),
  run('imp', 'implementer', 'savvy-progress implement', 'claude-sonnet-5-5[1m]', 260_000, { ...ctx(38), effort: 'medium', costUsd: 0.31, stepDone: 3, stepTotal: 5, stepNote: 'Wired the fold to isWorking. Writing the test next.' }),
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
const line = (kind: LogLine['kind'], text: string, ago: number): LogLine => ({ kind, text, at: NOW - ago })
// Step logs, newest first, as the step-log tracker keeps them; texts and ages from the mockup's seed().
const LOGS: Record<string, LogLine[]> = {
  e2e: [line('step', 'Seeded the fixture data.', 120_000), line('step', 'Wrote the login flow test.', 180_000)],
  imp: [line('step', 'Wired the fold to isWorking. Writing the test next.', 12_000), line('step', 'Read band render and the mainTurn atom.', 120_000), line('step', 'Started on the twinkle gate.', 240_000)],
  rev: [line('step', 'Searching for UNATTENDED across hooks/.', 60_000), line('step', 'Opened the cache-tax diff.', 180_000)],
  pln: [line('step', 'Drafting the release order.', 30_000)],
}
const NEEDS_LOGS = { ...LOGS, e2e: [line('ask', 'Asked: Postgres or SQLite for the fixture?', 42_000), ...LOGS.e2e] }
const FAILED_LOGS = {
  ...LOGS,
  e2e: [line('fail', 'Failed at step 3 of 4: run the login flow test', 40_000), line('try', 'Try 3 failed: still refused.', 40_000),
    line('try', 'Try 2 failed: restarted the container.', 60_000), line('try', 'Try 1 failed: connection refused.', 60_000), line('step', 'Seeded the fixture data.', 120_000)],
  rev: [line('try', 'Try 3 failed: 2 hunks still rejected.', 20_000), line('helper', 'Helper "map the cache keys" failed after 0:48: no "cacheKey" in src/', 50_000),
    line('try', 'Try 2 failed: rebased, same hunks.', 60_000), line('try', 'Try 1 failed: the diff does not apply.', 120_000), line('step', 'Opened the cache-tax diff.', 180_000)],
}
const BOTH_LOGS = { ...FAILED_LOGS, pln: [line('ask', 'Asked: Ship the release notes in this PR, or after it?', 18_000), ...LOGS.pln] }

// The one estimate table both draw builders use (by run id); a run not listed has no estimate.
export const ETA: Record<string, Eta> = {
  e2e: { kind: 'left', minutes: 3, slow: false }, imp: { kind: 'left', minutes: 2, slow: false }, rev: { kind: 'left', minutes: 4, slow: true },
  k1: { kind: 'left', minutes: 0, slow: false }, k2: { kind: 'left', minutes: 1, slow: false }, pln: { kind: 'left', minutes: 9, slow: false },
}
export const USUALLY: Record<string, number> = { e2e: 4, imp: 6, rev: 7, pln: 12 }

const FLOW: SavvyFlow = {
  title: 'Hydra · retro fixes', total: 7, done: 2, phase: 'delegate', isFinished: false,
  tasks: ['schema', 'api', 'savvy-progress implement', 'e2e tests', 'cache-tax review c1', 'plan the release', 'merge'].map(title => ({ title })),
}
// A plan read from a checklist: 12 tasks, 5 checked out of order, no agents.
const FILE_TASKS = ['schema', 'api', 'docs page', 'auth flow', 'login page', 'settings page', 'search index', 'export csv', 'import csv', 'error pages', 'release notes', 'changelog']
const FILE_FLOW: SavvyFlow = {
  title: 'Site rebuild', total: 12, done: 5, phase: 'delegate', isFinished: false, tasks: FILE_TASKS.map(title => ({ title })),
  doneTitles: ['schema', 'api', 'docs page', 'login page', 'settings page'],
}
// api finished first while schema still runs.
const OUT_OF_ORDER_FLOW: SavvyFlow = {
  title: 'Site rebuild', total: 4, done: 1, phase: 'delegate', isFinished: false, tasks: ['schema', 'api', 'docs page', 'release notes'].map(title => ({ title })),
  doneTitles: ['api'],
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
  code: { reusePct: 72, reused: 18, created: 7, callers: ['hooks/band.ts:41', 'tests/fold.test.ts:12'] },
}
const UI: Ui = { size: 'full', open: null, shut: ['ended'], paneOpen: true }

const patch = (runs: SavvyRun[], id: string, o: Partial<SavvyRun>) => runs.map(r => (r.id === id ? { ...r, ...o } : r))
const base = (o: Partial<Fixture> = {}): Fixture =>
  ({ flow: FLOW, runs: HYDRA_RUNS, parents: PARENTS, activity: ACTIVITY, logs: LOGS, stats: STATS, ui: UI, busy: true, armed: true, ...o })

const NEEDS = patch(HYDRA_RUNS, 'e2e', { blocked: 'Postgres or SQLite for the fixture?' })
const FAILED = patch(patch(patch(HYDRA_RUNS,
  'e2e', { status: 'failed', heldDone: true, startedAt: NOW - 170_000, endedAt: NOW - 40_000, failedAttempts: 3,
    failNote: 'Could not reach Postgres on :5432', failLine: 'connect ECONNREFUSED 127.0.0.1:5432' }),
  'rev', { failedAttempts: 3, failNote: '2 hunks still rejected.' }),
  'k2', { status: 'failed', heldDone: true, endedAt: NOW - 12_000, failNote: 'no "cacheKey" in src/' })
const FAILED_ACT = { ...ACTIVITY, rev: act('run', 'Retrying', 'the diff against main', 20_000) }
const IDLE_STATS: Stats = { ...STATS, turn: null, tests: null }
// The main session has waited 12 minutes on a question, longer than e2e's 42 seconds in the crew state.
const SESSION_NEED: SavvyNeed = { text: 'Ship the schema change behind a flag, or migrate every row now?', since: NOW - 12 * 60_000 }
// savvy-progress's session-need setting, not yet asked: the one row the pane offers.
const UNASKED: ConfigRow[] = [{ key: 'savvy-progress.sessionNeed', label: 'Session needs you', description: 'Light Needs you when this session asks you a question?',
  kind: 'choice', value: 'unasked', options: ['unasked', 'off', 'both', 'ask', 'tool'], provider: { plugin: 'savvy-progress', tier: 'user' }, isLocked: false }]

export const STATES: Record<StateName, Fixture> = {
  idle: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {}, stats: IDLE_STATS, busy: false, armed: false }),
  busy: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {} }),
  hydra: base(),
  needsYou: base({ runs: NEEDS, logs: NEEDS_LOGS }),
  failed: base({ runs: FAILED, activity: FAILED_ACT, logs: FAILED_LOGS }),
  both: base({ runs: patch(FAILED, 'pln', { blocked: 'Ship the release notes in this PR, or after it?' }), activity: FAILED_ACT, logs: BOTH_LOGS }),
  context90: base({ stats: { ...STATS, context: { pct: 92, msgsPct: 34, turnsLeft: 1, autoPct: 97, alarm: true } } }),
  limitAhead: base({ stats: { ...STATS, limits: [{ kind: 'five_hour', pct: 62, pacePct: 62 / 1.31, projected: 131, ahead: true, hot: true }, STATS.limits[1]] } }),
  sizeGauges: base({ runs: NEEDS, logs: NEEDS_LOGS, ui: { ...UI, size: 'gauges' } }),
  sizeLine: base({ runs: NEEDS, logs: NEEDS_LOGS, ui: { ...UI, size: 'line' } }),
  drawerOpen: base({ ui: { ...UI, open: 'imp' } }),
  helpers: base({ ui: { ...UI, shut: ['ended', 'rev'] } }),
  emptyPane: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {}, stats: IDLE_STATS, busy: false, armed: false }),
  // Few enough columns that the two lowest (reuse, callers) have room: idle, under three turns.
  codeColumns: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {}, busy: false, armed: false,
    stats: { ...IDLE_STATS, session: { costUsd: 4.1, lastTurnUsd: 1.9, turns: 2, tokens: 9_400_000, agentMs: 380_000 } } }),
  // One agent and no plan: the folded agents column names it instead of counting it.
  oneRunning: base({ flow: null, runs: HYDRA_RUNS.filter(r => r.id === 'imp'), parents: {}, ui: { ...UI, size: 'gauges' } }),
  oneNeedsYou: base({ flow: null, runs: NEEDS.filter(r => r.id === 'e2e'), parents: {}, logs: NEEDS_LOGS, ui: { ...UI, size: 'gauges' } }),
  // No flow in either, so no plan line changes these pictures.
  sessionNeed: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {}, stats: IDLE_STATS, busy: false, armed: false, need: SESSION_NEED }),
  sessionNeedCrew: base({ flow: null, runs: NEEDS, logs: NEEDS_LOGS, need: SESSION_NEED }),
  filePlan: base({ flow: FILE_FLOW, runs: [], parents: {}, activity: {}, logs: {}, busy: false, armed: false }),
  // The one-time setup row, in an empty pane and over two running agents.
  offer: base({ flow: null, runs: [], parents: {}, activity: {}, logs: {}, stats: IDLE_STATS, busy: false, armed: false, config: UNASKED }),
  offerCrew: base({ flow: null, runs: HYDRA_RUNS.filter(r => r.id === 'imp' || r.id === 'pln'), parents: {}, config: UNASKED }),
  planOutOfOrder: base({ flow: OUT_OF_ORDER_FLOW, runs: HYDRA_RUNS.filter(r => r.id === 'imp').map(r => ({ ...r, description: 'schema' })), parents: {} }),
  manyAgents: base({
    flow: null, parents: {}, activity: {}, logs: {},
    runs: Array.from({ length: 80 }, (_, i) => run(`m${i}`, 'general-purpose', `worker ${i + 1}`, 'claude-sonnet-5-5', 10_000 + i * 1_000,
      { ...ctx(20 + (i % 60)), costUsd: 0.05, stepDone: i % 4, stepTotal: 4, stepNote: `Step ${i % 4} of worker ${i + 1}.` })),
  }),
}
