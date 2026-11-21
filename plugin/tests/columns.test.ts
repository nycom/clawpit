import { test, expect } from 'claude-code/testing'
import type { Crew, CrewAgent, LimitStat, Stats } from '../types'
import { maxColumns, candidates, fit, lineParts, ORDER } from '../hooks/panel/columns'

const stats = (o: Partial<Stats> = {}): Stats => ({
  context: { pct: 40, msgsPct: 30, turnsLeft: 20, autoPct: null, alarm: false }, limits: [], turn: null, tests: null,
  session: { costUsd: 1, lastTurnUsd: 0.1, turns: 1, tokens: 1000, agentMs: 0 }, code: null, ...o,
})
const limit = (kind: LimitStat['kind'], hot = false): LimitStat => ({ kind, pct: hot ? 60 : 10, pacePct: null, projected: null, ahead: false, hot })
const agent = { id: 'a' } as CrewAgent
const crew = (o: Partial<Crew> = {}): Crew => ({
  title: 'Subagents', agents: [], ended: [], counts: { need: 0, failed: 0, running: 0, done: 0 }, costUsd: 0, leftMin: null, plan: null, ...o,
})
const plan = { title: 'p', phase: 'delegate' as const, done: 1, total: 3, tasks: [] }
const prio = (cols: { key: string; priority: number }[]) => Object.fromEntries(cols.map(c => [c.key, c.priority]))
const turns3 = { costUsd: 1, lastTurnUsd: 0.1, turns: 3, tokens: 1000, agentMs: 1 }

test('columns: one per fourteen cells, between two and six', () => {
  expect(maxColumns(20)).toBe(2); expect(maxColumns(46)).toBe(3); expect(maxColumns(88)).toBe(6); expect(maxColumns(300)).toBe(6)
})
test('columns: calm, idle, three turns: the priorities', () => {
  const s = stats({ limits: [limit('five_hour'), limit('seven_day')], session: turns3 })
  expect(prio(candidates(s, crew(), 'full', false))).toEqual({ context: 100, session: 80, '5h': 40, '7d': 35, tokens: 30, agent: 28 })
})
test('columns: a hot limit jumps forward', () => {
  const p = prio(candidates(stats({ limits: [limit('five_hour', true), limit('seven_day', true)] }), crew(), 'full', false))
  expect(p['5h']).toBe(96); expect(p['7d']).toBe(90)
})
test('columns: this turn only while busy; tests drop to 20 while busy', () => {
  const s = stats({ tests: { passed: 1, failed: 0, at: 1 } })
  const idle = prio(candidates(s, crew(), 'full', false)), busy = prio(candidates(s, crew(), 'full', true))
  expect(idle.turn).toBeUndefined(); expect(idle.tests).toBe(45)
  expect(busy.turn).toBe(95); expect(busy.tests).toBe(20)
})
test('columns: tokens and agent time only after three turns', () => {
  const keys = (turns: number) => candidates(stats({ session: { ...turns3, turns } }), crew(), 'full', false).map(c => c.key)
  expect(keys(2)).not.toContain('tokens'); expect(keys(2)).not.toContain('agent')
  expect(keys(3)).toContain('tokens'); expect(keys(3)).toContain('agent')
})
test('columns: missing limits produce no limit column', () => {
  const keys = candidates(stats({ limits: [] }), crew(), 'full', true).map(c => c.key)
  expect(keys).not.toContain('5h'); expect(keys).not.toContain('7d')
  expect(candidates(stats({ limits: [limit('seven_day')] }), crew(), 'full', false).map(c => c.key)).not.toContain('5h')
})
test('columns: reuse and callers are the two lowest and step aside first', () => {
  const s = stats({ tests: { passed: 1, failed: 0, at: 1 }, limits: [limit('five_hour'), limit('seven_day')], session: turns3,
    code: { reusePct: 50, reused: 1, created: 1, callers: ['f'] } })
  const p = prio(candidates(s, crew(), 'full', true))
  expect(p.reuse).toBe(12); expect(p.callers).toBe(10)
  for (const [k, v] of Object.entries(p)) if (k !== 'reuse' && k !== 'callers') expect(v).toBeGreaterThan(12)
  const k = (code: Stats['code']) => candidates(stats({ code }), crew(), 'full', false).map(c => c.key)
  expect(k({ reusePct: null, reused: 0, created: 0, callers: [] })).toEqual(['context', 'session'])
  expect(k({ reusePct: 0, reused: 0, created: 1, callers: [] })).toContain('reuse')
  expect(k({ reusePct: null, reused: 0, created: 0, callers: ['x'] })).toContain('callers')
  expect(k(null)).toEqual(['context', 'session'])
  const hydra = candidates(s, crew({ agents: [agent], plan }), 'gauges', false)
  const kept = fit(hydra, maxColumns(60))
  expect(maxColumns(60)).toBe(4); expect(kept).not.toContain('reuse'); expect(kept).not.toContain('callers')
})
test('columns: plan and agents are columns only when folded', () => {
  const c = crew({ agents: [agent], plan })
  expect(candidates(stats(), c, 'full', false).map(x => x.key)).not.toContain('plan')
  expect(candidates(stats(), c, 'full', false).map(x => x.key)).not.toContain('agents')
  const p = prio(candidates(stats(), c, 'gauges', false)); expect(p.plan).toBe(97); expect(p.agents).toBe(99)
  const none = prio(candidates(stats(), crew(), 'gauges', false)); expect(none.plan).toBeUndefined(); expect(none.agents).toBeUndefined()
})
test('columns: fit keeps the top by priority and lays them in the fixed order', () =>
  expect(fit([{ key: 'agents', priority: 99 }, { key: 'session', priority: 80 }, { key: 'context', priority: 100 }, { key: 'tokens', priority: 30 }], 3)).toEqual(['context', 'session', 'agents']))
test('columns: ORDER is the fixed layout', () =>
  expect([...ORDER]).toEqual(['context', 'turn', '5h', '7d', 'plan', 'session', 'tests', 'tokens', 'agent', 'reuse', 'callers', 'agents']))
test('columns: the one-line parts', () => {
  const s = stats({ limits: [limit('five_hour', true), limit('seven_day')], code: { reusePct: 50, reused: 1, created: 1, callers: ['f'] } })
  expect(lineParts(s, crew())).toEqual(['context', '5h', 'session'])
  expect(lineParts(s, crew({ agents: [agent], plan }))).toEqual(['context', '5h', 'plan', 'agents'])
  expect(lineParts(stats({ limits: [limit('seven_day', true)] }), crew())).toEqual(['context', '7d', 'session'])
})
