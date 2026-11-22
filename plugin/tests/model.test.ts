import { test, expect } from 'claude-code/testing'
import type { SavvyRun } from '../types'
import { alertsOf, crewOf, roleOf, type CrewInput } from '../hooks/model'
import { ETA, NOW, STATES, USUALLY } from './fixtures/states'

const input = (s: keyof typeof STATES, over: Partial<CrewInput> = {}): CrewInput =>
  ({ ...STATES[s], etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' as const }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW, ...over })
const patch = (runs: SavvyRun[], id: string, o: Partial<SavvyRun>) => runs.map(r => (r.id === id ? { ...r, ...o } : r))
const failedRun = { id: 'r', type: 'validator', description: 'e2e tests', model: 'm', status: 'failed', startedAt: 0, endedAt: 130_000, contextTokens: 0, contextMax: 1, costUsd: 0, heldDone: true } as SavvyRun

test('crewOf: the hydra fixture gives the mockup counts', () => {
  const c = crewOf(input('needsYou')); expect(c.counts).toEqual({ need: 1, failed: 0, running: 3, done: 1 })
  expect(c.agents[0].title).toBe('e2e tests'); expect(c.agents.length).toBe(4); expect(c.ended.map(a => a.title)).toEqual(['docs pass'])
  expect(c.agents.find(a => a.title === 'cache-tax review c1')!.helpers.length).toBe(2); expect(c.title).toBe(STATES.needsYou.flow!.title)
})

test('crewOf: section order is need, failed, running with struggling first', () => {
  const c = crewOf(input('both'))
  expect(c.agents.map(a => a.state)).toEqual(['need', 'failed', 'running', 'running'])
  expect(c.agents.map(a => a.id)).toEqual(['pln', 'e2e', 'rev', 'imp']); expect(c.agents[2].struggling).toBe(true)
  // imp has no ask line, so it waits since its start, longer than pln's ask
  const two = crewOf(input('both', { runs: patch(STATES.both.runs, 'imp', { blocked: 'Which branch?' }) }))
  expect(two.agents.filter(a => a.state === 'need').map(a => a.id)).toEqual(['imp', 'pln'])
})

test('crewOf: a failed run is failed while held, ended after', () => {
  expect(crewOf(input('idle', { runs: [failedRun] })).agents[0].state).toBe('failed')
  expect(crewOf(input('idle', { runs: [{ ...failedRun, heldDone: false }] })).ended[0].prop).toBe('fail')
})

test('crewOf: a run whose last step failed ends as failed, even when it ended on its own', () => {
  const lastFailed = { ...failedRun, status: 'done', failedAttempts: 3, failNote: 'Could not reach Postgres', failLine: 'ECONNREFUSED' } as SavvyRun
  expect(crewOf(input('idle', { runs: [lastFailed] })).agents[0]).toMatchObject({ state: 'failed', prop: 'fail', reason: 'Could not reach Postgres', errorLine: 'ECONNREFUSED' })
  expect(crewOf(input('idle', { runs: [{ ...lastFailed, heldDone: false }] })).ended[0]).toMatchObject({ prop: 'fail', reason: 'Could not reach Postgres' })
  // savvy clears failedAttempts and the reason on a step that moves on
  const recovered = { ...failedRun, status: 'done' } as SavvyRun
  expect(crewOf(input('idle', { runs: [recovered] })).ended[0]).toMatchObject({ state: 'ended', prop: 'done' })
})

test('crewOf: a helper whose parent ended is listed flat', () => {
  const c = crewOf(input('hydra', { runs: patch(STATES.hydra.runs, 'rev', { status: 'done', endedAt: NOW - 5_000 }) }))
  expect(c.agents.map(a => a.id)).toEqual(expect.arrayContaining(['k1', 'k2']))
  expect(c.agents.find(a => a.id === 'k1')!.parentId).toBeUndefined()
  expect(c.ended.find(a => a.id === 'rev')!.helpers).toEqual([])
  expect(crewOf(input('hydra')).agents.find(a => a.id === 'rev')!.helpers.map(h => h.parentId)).toEqual(['rev', 'rev'])
})

test('crewOf: waitingSince is the newest ask line, else startedAt', () => {
  const e2e = (i: CrewInput) => crewOf(i).agents.find(a => a.id === 'e2e')!
  expect(e2e(input('needsYou')).waitingSince).toBe(NOW - 42_000)
  expect(e2e(input('needsYou', { logs: {} })).waitingSince).toBe(STATES.needsYou.runs.find(r => r.id === 'e2e')!.startedAt)
  expect(crewOf(input('needsYou')).agents.find(a => a.id === 'imp')!.waitingSince).toBeUndefined()
})

test('crewOf: one time-left figure, the largest running estimate', () => {
  expect(crewOf(input('hydra')).leftMin).toBe(9)
  // a needs-you agent's estimate does not count
  expect(crewOf(input('needsYou', { etaOf: r => (r.id === 'e2e' ? { kind: 'left', minutes: 99, slow: false } : ETA[r.id] ?? { kind: 'none' }) })).leftMin).toBe(9)
  expect(crewOf(input('hydra', { etaOf: () => ({ kind: 'none' }) })).leftMin).toBeNull()
})

test('crewOf: tolerates a run with only the required fields', () => {
  const bare = { id: 'b', type: 'x', description: 'y', model: 'm', status: 'running', startedAt: 0, contextTokens: 0, contextMax: 0, costUsd: 0 } as SavvyRun
  const a = crewOf(input('idle', { runs: [bare] })).agents[0]
  expect(a).toMatchObject({ stepDone: 0, stepTotal: 0, tries: 0, struggling: false, contextPct: 0, prop: 'none', activity: null, log: [] })
})

test('crewOf: null flow and empty agents give the empty crew', () =>
  expect(crewOf(input('idle'))).toMatchObject({ title: 'Subagents', agents: [], ended: [], plan: null, leftMin: null }))

test('roleOf: a plugin prefix is stripped before the type lookup', () => {
  expect(roleOf('x:implementer', '')).toBe('implement'); expect(roleOf('x:Explore', '')).toBe('explore'); expect(roleOf('x:reviewer', '')).toBe('review')
  expect(roleOf('implementer', '')).toBe('implement'); expect(roleOf('plugin:code-reviewer', '')).toBe('review'); expect(roleOf('x:unknown', 'fix it')).toBe('implement')
})

test('roleOf: by type, then by description, else explore', () => {
  expect(roleOf('implementer', 'x')).toBe('implement'); expect(roleOf('validator', 'x')).toBe('test'); expect(roleOf('general-purpose', 'cache-tax review c1')).toBe('review')
  expect(roleOf('general-purpose', 'plan the release')).toBe('design'); expect(roleOf('whatever', 'look around')).toBe('explore')
  expect(roleOf('superpowers:code-reviewer', 'x')).toBe('review'); expect(roleOf('Plan', 'fix it')).toBe('design')
  expect(roleOf('general-purpose', 'review the fix')).toBe('review'); expect(roleOf('constructor', 'look')).toBe('explore')
})

test('planOf: task states from the newest matching run; live fill never under 8 percent', () => {
  const p = crewOf(input('needsYou')).plan!
  expect(p.tasks.map(t => t.state)).toEqual(['done', 'done', 'live', 'need', 'live', 'live', 'todo']); expect(p.done).toBe(2); expect(p.total).toBe(7)
  expect(p.tasks[2]).toEqual({ name: 'savvy-progress implement', state: 'live', role: 'implement', fill: 0.6 })
  expect(p.tasks[6]).toEqual({ name: 'merge', state: 'todo', fill: 0 })
  const noSteps = crewOf(input('needsYou', { runs: patch(STATES.needsYou.runs, 'pln', { stepDone: 0 }) })).plan!
  expect(noSteps.tasks[5].fill).toBe(0.08)
  const rerun = { ...failedRun, id: 'old', description: 'merge', status: 'done', startedAt: NOW - 900_000, heldDone: false } as SavvyRun
  const newer = { ...rerun, id: 'new', status: 'running', startedAt: NOW - 1_000 } as SavvyRun
  expect(crewOf(input('needsYou', { runs: [...STATES.needsYou.runs, rerun, newer] })).plan!.tasks[6].state).toBe('live')
})

test('planOf: the session accepted count ticks the first tasks; a finished run never ticks its own', () => {
  const none = crewOf(input('hydra', { runs: [] })).plan!
  expect(none.tasks.map(t => t.state)).toEqual(['done', 'done', 'todo', 'todo', 'todo', 'todo', 'todo']); expect(none.done).toBe(2)
  const finished = { ...failedRun, id: 'f', description: 'savvy-progress implement', type: 'implementer', status: 'done', heldDone: false } as SavvyRun
  const p = crewOf(input('hydra', { runs: [finished] })).plan!
  expect(p.done).toBe(2); expect(p.tasks.map(t => t.state)).toEqual(['done', 'done', 'live', 'todo', 'todo', 'todo', 'todo'])
  expect(p.tasks[2]).toEqual({ name: 'savvy-progress implement', state: 'live', role: 'implement', fill: 1 })
  // a run on an accepted task does not untick it
  const failedOnApi = { ...finished, id: 'a', description: 'api', status: 'failed' } as SavvyRun
  expect(crewOf(input('hydra', { runs: [failedOnApi] })).plan!.tasks[1].state).toBe('done')
})

test('planOf: design phase reads as plan; a finished flow is null', () => {
  const flow = STATES.hydra.flow!
  expect(crewOf(input('hydra', { flow: { ...flow, phase: 'design' } })).plan!.phase).toBe('plan')
  expect(crewOf(input('hydra')).plan!.phase).toBe('delegate')
  expect(crewOf(input('hydra', { flow: { ...flow, isFinished: true } }))).toMatchObject({ plan: null, title: 'Subagents' })
})

test('planOf: a run belongs to its longest matching task only', () => {
  const run = { ...failedRun, id: 'k2', description: 'kit-pr2 review', status: 'running', startedAt: NOW - 1_000, endedAt: undefined, heldDone: false } as SavvyRun
  const flow = { ...STATES.hydra.flow!, done: 0, tasks: [{ title: 'kit' }, { title: 'kit-pr2' }] } as typeof STATES.hydra.flow
  expect(crewOf(input('hydra', { flow, runs: [run] })).plan!.tasks.map(t => t.state)).toEqual(['todo', 'live'])
})

// Built by hand, no fixture: p runs; h helps p; g helps h; d helps g, one level past what nests.
const live = (id: string, o: Partial<SavvyRun> = {}) => ({ id, type: 'Explore', description: id, model: 'm', status: 'running', startedAt: 0, contextTokens: 0, contextMax: 1, costUsd: 0, ...o }) as SavvyRun
const handCrew = (runs: SavvyRun[], parents: Record<string, string>) =>
  crewOf({ flow: null, runs, parents, activity: {}, logs: {}, etaOf: () => ({ kind: 'none' }), usuallyOf: () => null, now: 0 })

test('crewOf: a helper of a live helper nests one more level under it, not at the top', () => {
  const c = handCrew([live('p'), live('h'), live('g'), live('d')], { h: 'p', g: 'h', d: 'g' })
  const p = c.agents.find(a => a.id === 'p')!, h = p.helpers[0], g = h.helpers[0]
  expect(c.agents.map(a => a.id).sort()).toEqual(['d', 'p']); expect(p.helpers.map(a => a.id)).toEqual(['h'])
  expect(h.helpers.map(a => a.id)).toEqual(['g']); expect(g.parentId).toBe('h'); expect(g.helpers).toEqual([])
  expect(c.agents.find(a => a.id === 'd')!.parentId).toBeUndefined()
  // a helper whose own parent ended is top level, so its helpers nest one level under it
  const ended = handCrew([live('p', { status: 'done', endedAt: 1 }), live('h'), live('g')], { h: 'p', g: 'h' })
  expect(ended.agents.map(a => a.id)).toEqual(['h']); expect(ended.agents[0].helpers.map(a => a.id)).toEqual(['g'])
  expect(handCrew([live('a'), live('b')], { a: 'b', b: 'a' }).agents.map(a => a.helpers.length)).toEqual([0, 0])
})

test('crewOf and alertsOf: a helper that waits on you needs you, at either depth; the sections stay top level', () => {
  const c = handCrew([live('p'), live('h', { blocked: 'Which key?' }), live('g', { blocked: 'Keep it?' }), live('f', { status: 'failed', heldDone: true, endedAt: 1 })], { h: 'p', g: 'h', f: 'h' })
  expect(c.agents.map(a => a.id)).toEqual(['p']); expect(c.counts).toEqual({ need: 0, failed: 0, running: 1, done: 0 })
  expect(alertsOf(c)).toEqual({ need: 2, failed: 1 })
  expect(alertsOf(handCrew([live('p', { blocked: 'Go?' }), live('h')], { h: 'p' }))).toEqual({ need: 1, failed: 0 })
})
