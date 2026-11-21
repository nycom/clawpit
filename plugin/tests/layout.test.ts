import { test, expect } from 'claude-code/testing'
import type { LoopPlan, SavvyRun } from '../types'
import { crewOf, type CrewInput } from '../hooks/model'
import { ENGINE_MAX, HOST_MAX, paneLayout, type PaneItem } from '../hooks/pane/layout'
import { ETA, NOW, STATES, USUALLY } from './fixtures/states'

const input = (s: keyof typeof STATES, over: Partial<CrewInput> = {}): CrewInput =>
  ({ ...STATES[s], etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' as const }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW, ...over })
const noLoops: LoopPlan = { walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }
const unit = () => ({ host: 1, engine: 1 })
const idOf = (i: PaneItem) => ('agent' in i ? i.agent.id : 'parentId' in i ? i.parentId : '')
const line = (i: PaneItem) => `${i.kind}${i.kind === 'section' ? `:${i.name}` : ''}${idOf(i) ? `:${idOf(i)}` : ''}`

test('paneLayout: the section order and the default-shut Ended', () => {
  const items = paneLayout(crewOf(input('needsYou')), STATES.needsYou.ui, noLoops, unit)
  expect(items.map(line)).toEqual(['head', 'section:need', 'row:e2e', 'section:running', 'row:rev', 'helper:k2', 'helper:k1', 'kids:rev', 'row:pln', 'row:imp', 'section:ended'])
  expect(items.at(-1)).toEqual({ kind: 'section', name: 'ended', count: 1, shut: true })
  expect(items[1]).toEqual({ kind: 'section', name: 'need', count: 1 })
  const open = paneLayout(crewOf(input('needsYou')), { ...STATES.needsYou.ui, shut: [] }, noLoops, unit)
  expect(open.slice(-2).map(line)).toEqual(['section:ended', 'ended:docs']); expect(open.at(-2)).toMatchObject({ shut: false })
})

test('paneLayout: an open drawer follows its row; helpers follow unless shut', () => {
  const drawer = paneLayout(crewOf(input('drawerOpen')), STATES.drawerOpen.ui, noLoops, unit).map(line)
  expect(drawer.indexOf('drawer:imp')).toBe(drawer.indexOf('row:imp') + 1)
  const rev = paneLayout(crewOf(input('hydra')), { ...STATES.hydra.ui, open: 'rev' }, noLoops, unit).map(line)
  expect(rev.slice(rev.indexOf('row:rev'), rev.indexOf('kids:rev') + 1)).toEqual(['row:rev', 'drawer:rev', 'helper:k2', 'helper:k1', 'kids:rev'])
  const shut = paneLayout(crewOf(input('helpers')), STATES.helpers.ui, noLoops, unit)
  expect(shut.some(i => i.kind === 'helper')).toBe(false)
  expect(shut.find(i => i.kind === 'kids')).toEqual({ kind: 'kids', parentId: 'rev', count: 2, failed: 0, shut: true })
  expect(paneLayout(crewOf(input('failed')), STATES.failed.ui, noLoops, unit).find(i => i.kind === 'kids')).toMatchObject({ count: 2, failed: 1, shut: false })
})

test('paneLayout: only the ring id rings, only walker ids walk', () => {
  const loops = { ...noLoops, walkers: ['imp', 'k1'], ring: 'e2e' }
  const items = paneLayout(crewOf(input('needsYou')), STATES.needsYou.ui, loops, unit)
  const rows = items.flatMap(i => (i.kind === 'row' || i.kind === 'helper' ? [i] : []))
  expect(rows.filter(i => i.walk).map(i => i.agent.id)).toEqual(['k1', 'imp'])
  expect(rows.filter(i => i.kind === 'row' && i.ring).map(i => i.agent.id)).toEqual(['e2e'])
  expect(rows.some(i => i.kind === 'row' && i.open)).toBe(false)
})

test('paneLayout: no agents gives head-less empty', () => expect(paneLayout(crewOf(input('idle')), STATES.idle.ui, noLoops, unit)).toEqual([{ kind: 'empty' }]))

test('paneLayout: 80 agents and an open drawer stay under both bounds', () => {
  const items = paneLayout(crewOf(input('manyAgents')), { ...STATES.manyAgents.ui, open: STATES.manyAgents.runs[0].id }, noLoops, () => ({ host: 4000, engine: 1800 }))
  const sum = items.reduce((a, i) => ({ host: a.host + 4000, engine: a.engine + 1800 }), { host: 0, engine: 0 })
  expect(sum.host).toBeLessThanOrEqual(HOST_MAX); expect(sum.engine).toBeLessThanOrEqual(ENGINE_MAX)
  expect(items.some(i => i.kind === 'more' && i.count > 0)).toBe(true); expect(items.some(i => i.kind === 'drawer')).toBe(true)
  const more = items.find(i => i.kind === 'more')
  expect(items.filter(i => i.kind === 'row').length + (more?.kind === 'more' ? more.count : 0)).toBe(80)
  expect(more).toMatchObject({ section: 'running' }); expect(items.at(-1)).toBe(more)
})
