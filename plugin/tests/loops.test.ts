import { test, expect } from 'claude-code/testing'
import { BUDGET, pickLoops } from '../hooks/loops'
import type { Crew, CrewAgent, CrewState, Ui } from '../types'

let n = 0
const agent = (state: CrewState, over: Partial<CrewAgent> = {}): CrewAgent => ({
  id: `a${++n}`, title: 't', role: 'implement', model: 'm', state, struggling: false, tries: 0,
  prop: 'none', activity: null, stepDone: 0, stepTotal: 1, eta: { kind: 'none' }, usuallyMin: null,
  startedAt: n, contextPct: 0, costUsd: 0, helpers: [], log: [], ...over,
})
const crewOf = (...agents: CrewAgent[]): Crew => ({
  title: 'c', agents, ended: [], costUsd: 0, leftMin: null, plan: null,
  counts: { need: agents.filter(a => a.state === 'need').length, failed: agents.filter(a => a.state === 'failed').length, running: agents.filter(a => a.state === 'running').length, done: 0 },
})
const ui = (size: Ui['size'], paneOpen: boolean): Ui => ({ size, open: null, shut: [], paneOpen })
const running = (k: number) => Array.from({ length: k }, () => agent('running'))

test('loops: idle, nothing loops', () => expect(pickLoops(crewOf(), ui('full', true), false, false)).toEqual({ walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }))

test('loops: three walkers, the newest running agents', () => {
  const rs = running(5)
  const p = pickLoops(crewOf(...rs), ui('full', false), true, false)
  expect(p.walkers).toEqual(rs.slice(-BUDGET.walkers).reverse().map(a => a.id))
})

test('loops: two walkers while someone needs you, and one ring on the longest waiter', () => {
  const late = agent('need', { waitingSince: 500 }), early = agent('need', { waitingSince: 100 })
  const p = pickLoops(crewOf(late, early, ...running(4)), ui('full', true), true, false)
  expect(p.walkers.length).toBe(BUDGET.walkersOnBeat); expect(p.ring).toBe(early.id); expect(p.chipPulse).toBe(true)
})

test('loops: an armed failure takes the beat slot; unarmed it does not', () => {
  const c = crewOf(agent('failed'), ...running(4))
  const on = pickLoops(c, ui('full', false), true, true), off = pickLoops(c, ui('full', false), true, false)
  expect(on.walkers.length).toBe(BUDGET.walkersOnBeat); expect(on.chipPulse).toBe(true)
  expect(off.walkers.length).toBe(BUDGET.walkers); expect(off.chipPulse).toBe(false)
})

test('loops: idle with a held failure, armed: only the pulse', () => {
  const c = crewOf(agent('failed'))
  const full = pickLoops(c, ui('full', false), false, true)
  expect(full.count).toBe(1); expect(full.chipPulse).toBe(true)
  const g = pickLoops(c, ui('gauges', false), false, true)
  expect(g.mascot).toBe('sway'); expect(g.count).toBe(1)
  expect(pickLoops(c, ui('full', false), false, false).count).toBe(0)
})

test('loops: a helper walks only when a slot is left', () => {
  const walkersWith = (tops: number) => {
    const h = agent('running'), ts = running(tops); ts[0].helpers = [h]
    return { h, w: pickLoops(crewOf(...ts), ui('full', true), true, false).walkers }
  }
  const full = walkersWith(BUDGET.walkers), room = walkersWith(BUDGET.walkers - 1)
  expect(full.w).not.toContain(full.h.id)
  expect(room.w[room.w.length - 1]).toBe(room.h.id)
})

test('loops: a helper walks only when its row is on screen', () => {
  const h = agent('running'), top = agent('running', { helpers: [h] })
  const walkers = (u: Ui) => pickLoops(crewOf(top), u, true, false).walkers
  expect(walkers(ui('full', true))).toContain(h.id)
  expect(walkers(ui('full', false))).not.toContain(h.id)
  expect(walkers({ ...ui('full', true), shut: [top.id] })).not.toContain(h.id)
  expect(pickLoops(crewOf(top), { ...ui('full', true), shut: [top.id] }, true, false).count).toBe(2)
})

test('loops: the mascot costume order', () => {
  const g = ui('gauges', false)
  expect(pickLoops(crewOf(agent('need'), agent('failed')), g, true, true).mascot).toBe('hop')
  expect(pickLoops(crewOf(agent('failed'), ...running(1)), g, true, true).mascot).toBe('sway')
  expect(pickLoops(crewOf(...running(1)), g, true, false).mascot).toBe('walk')
  expect(pickLoops(crewOf(...running(1)), ui('full', false), true, false).mascot).toBe('still')
})

test('loops: the count is what is on screen', () => {
  const c = crewOf(...running(BUDGET.walkers))
  expect(pickLoops(c, ui('full', true), true, false).count).toBe(BUDGET.walkers * 2)
  expect(pickLoops(c, ui('full', false), true, false).count).toBe(BUDGET.walkers)
  expect(pickLoops(c, ui('line', true), true, false).count).toBe(1 + BUDGET.walkers)
})

test('loops: the count never passes the budget', () => {
  const c = crewOf(agent('need'), agent('failed'), ...running(20))
  for (const size of ['full', 'gauges', 'line'] as const) for (const pane of [true, false])
    expect(pickLoops(c, ui(size, pane), true, true).count).toBeLessThanOrEqual(BUDGET.max)
})

test('loops: over the budget, walkers are cut from the end', () => {
  const was = BUDGET.max, rs = running(3)
  try {
    BUDGET.max = 4
    const p = pickLoops(crewOf(...rs), ui('full', true), true, false)
    expect(p.walkers).toEqual([rs[2].id, rs[1].id]); expect(p.count).toBe(4)
  } finally { BUDGET.max = was }
})

test('loops: a struggling agent never pulses', () => {
  const p = pickLoops(crewOf(agent('running', { struggling: true, tries: 3 })), ui('full', true), true, true)
  expect(p.chipPulse).toBe(false); expect(p.ring).toBeNull()
})

test('loops: a helper that needs you beats like a top-level waiter', () => {
  const p = pickLoops(crewOf(agent('running', { helpers: [agent('need')] })), ui('gauges', false), true, true)
  expect(p.mascot).toBe('hop')
  expect(pickLoops(crewOf(agent('running', { helpers: [agent('failed')] })), ui('full', false), true, true).chipPulse).toBe(true)
})
