import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown> }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const OFF = { options: { animations: false } }
const LIMITS = [{ kind: 'five_hour', percentUsed: 60, resetsAt: new Date(T0 + 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 40 }]
const USAGE = { startedAt: T0, context: { window: 200_000, percent: 30 }, rateLimits: LIMITS, cost: { usd: 1 } }

// The engine beneath clawpit, with a frozen clock, a store in memory, and the pane up.
const setup = (on: OnT) => {
  const clock = mock.clock(on, { now: T0 })
  mock.store(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }))
  on('session.usage', () => ({ value: USAGE as never }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [{ id: 'clawpit-agents', title: 'Agents', isShown: true, isFocused: false, isPlaced: true }] }) as never)
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  return { clock }
}

const run = (id: string, o: Record<string, unknown> = {}) =>
  ({ id, agentId: id, type: 'implementer', description: `worker ${id}`, model: 'm', status: 'running', startedAt: T0, contextTokens: 0, contextMax: 1, costUsd: 0, ...o })
const savvy = {
  name: 'savvy-progress',
  register(on: OnT) {
    on('tool.call', { tool: 'savvy-set' }, async ($, e) => { await $.state.set({ plugin: 'savvy-progress', key: 'agents' }, (e as unknown as { runs: never }).runs); return { result: {} } as never })
    on('tool.call', { tool: 'savvy-flow' }, async ($, e) => { await $.state.set({ plugin: 'savvy-progress', key: 'flow' }, (e as unknown as { flow: never }).flow); return { result: {} } as never })
  },
}

// A busy crew: walkers, a needs-you row, a failed row, a plan, and a fresh step line in an open drawer.
const draw = async ($: $T, on: OnT) => {
  setup(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't' } as never)
  const runs = [run('a0', { blocked: 'Which schema?' }), run('f0', { status: 'failed', heldDone: true, endedAt: T0 }), run('r1', { stepDone: 1, stepTotal: 3, stepNote: 'Read the cache module.' }), run('r2'), run('r3'), run('r4')]
  await $.tool.call({ tool: 'savvy-flow', flow: { title: 'Cache', total: 2, done: 0, phase: 'delegate', isFinished: false, tasks: [{ title: 'one' }, { title: 'two' }] } } as never)
  await $.tool.call({ tool: 'savvy-set', runs } as never)
  const panel = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, maxRows: 5 } as never })
  const pane = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'Pane', requestId: 'clawpit-agents', props: { title: 'Agents', isFocused: false, bodyColumns: 64, placement: 'dock' } as never })
  await pane.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'row-r1' })
  const nodes = [...(await panel.findAll({})), ...(await pane.findAll({}))] as unknown as Node[]
  await panel.unmount(); await pane.unmount()
  const sources = nodes.filter(n => n.type === 'Client' || n.type === 'Svg').map(n => String((n.type === 'Client' ? (n.props.props as { source: string }) : n.props).source))
  return { looping: sources.filter(s => s.includes('infinite')), css: sources.filter(s => /animation|transition|@keyframes/.test(s)), sources }
}

test('animations off: a busy crew draws no looping client and no animation or transition CSS, in the panel and the pane', { plugins: [savvy], ...OFF }, async ($, on) => {
  const d = await draw($, on)
  expect(d.sources.length).toBeGreaterThan(5)
  expect(d.looping).toHaveLength(0)
  expect(d.css).toHaveLength(0)
})

test('animations on (the default): the busy crew still loops and animates', { plugins: [savvy] }, async ($, on) => {
  const d = await draw($, on)
  expect(d.looping.length).toBeGreaterThanOrEqual(4)
  expect(d.css.length).toBeGreaterThan(d.looping.length)
})
