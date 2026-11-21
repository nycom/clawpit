import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown>; children: unknown[] }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const USAGE = { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } }
const BAND = { bodyColumns: 120, hasSurvey: false, maxRows: 5 }

// The engine beneath clawpit: a frozen clock, a store in memory, and a record of every pane opened or closed.
const setup = (on: OnT, o: { store?: Record<string, unknown> } = {}) => {
  mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(o.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE as never }))
  const opened: unknown[] = [], closed: unknown[] = []
  on('ui.open', (_$, e) => { opened.push({ id: e.id, title: e.title }); return { value: { isPlaced: true } } })
  on('ui.close', (_$, e) => { closed.push(e); return { value: undefined } as never })
  return { store, opened, closed }
}

// savvy-progress as clawpit sees it: its agents atom, set through a test-only tool.
const savvy = {
  name: 'savvy-progress',
  register(on: OnT) {
    on('tool.call', { tool: 'savvy-set' }, async ($, e) => {
      await $.state.set({ plugin: 'savvy-progress', key: 'agents' }, (e as unknown as { runs: never }).runs)
      return { result: {} } as never
    })
  },
}
const run = (id: string, more: Record<string, unknown> = {}) =>
  ({ id, agentId: id, type: 'implementer', description: `task ${id}`, model: 'claude-opus-5-5', status: 'running', startedAt: T0, contextTokens: 0, contextMax: 1, costUsd: 0, ...more })
const setRuns = ($: $T, runs: unknown[]) => $.tool.call({ tool: 'savvy-set', runs } as never)

const start = ($: $T) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const band = ($: $T) => $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt', props: BAND as never })
type Band = Awaited<ReturnType<typeof band>>
const all = async (ui: Band) => (await ui.findAll({})) as unknown as Node[]
const client = async (ui: Band, key: string) => (await all(ui)).find(n => n.type === 'Client' && n.key === key)
const imageOf = async (ui: Band, key: string) => (await client(ui, key))?.props.props as { source: string; alt: string; press?: string } | undefined
const sizeOf = async (ui: Band) => (await imageOf(ui, 'toggle'))?.alt.match(/^Panel: (everything|agents folded|one line)/)?.[1]
const has = async (ui: Band, key: string) => (await all(ui)).some(n => n.key === key)
// A press as the person makes it: a left button down on that Client's region.
const click = (ui: Band, key: string) => ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: key })

test('sizes: pressing the toggle steps full, gauges, line, full and redraws each', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setRuns($, [run('w1'), run('w2')])
  const ui = await band($)
  // Each size draws its own rows: chips only in full, the agents column only in gauges, one row only in line.
  const shape = async () => ({ size: await sizeOf(ui), chips: await has(ui, 'chips'), agentsCol: await has(ui, 'col-agents'), line: await has(ui, 'line') })
  expect(await shape()).toEqual({ size: 'everything', chips: true, agentsCol: false, line: false })
  await click(ui, 'toggle')
  expect(await shape()).toEqual({ size: 'agents folded', chips: false, agentsCol: true, line: false })
  expect(w.store.get('size')).toBe('gauges')
  await click(ui, 'toggle')
  expect(await shape()).toEqual({ size: 'one line', chips: false, agentsCol: false, line: true })
  expect(w.store.get('size')).toBe('line')
  await click(ui, 'toggle')
  expect(await shape()).toEqual({ size: 'everything', chips: true, agentsCol: false, line: false })
  expect(w.store.get('size')).toBe('full')
  await ui.unmount()
})

test('sizes: the size survives a new session.start', async ($, on) => {
  setup(on)
  await start($)
  const ui = await band($)
  await click(ui, 'toggle')
  await click(ui, 'toggle')
  expect(await sizeOf(ui)).toBe('one line')
  await ui.unmount()
  await start($)
  const next = await band($)
  expect(await sizeOf(next)).toBe('one line')
  await next.unmount()
})

test('sizes: the mascot client keeps its key across gauges and line', { plugins: [savvy] }, async ($, on) => {
  setup(on)
  await start($)
  await setRuns($, [run('w1'), run('w2')])
  const ui = await band($)
  expect(await client(ui, 'mascot')).toBeUndefined()
  await click(ui, 'toggle')
  expect((await imageOf(ui, 'mascot'))?.press).toBe('open')
  await click(ui, 'toggle')
  expect(await sizeOf(ui)).toBe('one line')
  expect((await imageOf(ui, 'mascot'))?.press).toBe('open')
  expect((await all(ui)).filter(n => n.key === 'mascot')).toHaveLength(1)
  await ui.unmount()
})

test('sizes: pressing the folded agents column opens the pane clawpit-agents', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setRuns($, [run('w1'), run('w2')])
  const ui = await band($)
  await click(ui, 'toggle')
  await click(ui, 'mascot')
  expect(w.opened).toEqual([{ id: 'clawpit-agents', title: 'Agents' }])
  await click(ui, 'toggle')
  await click(ui, 'mascot')
  expect(w.opened).toEqual([{ id: 'clawpit-agents', title: 'Agents' }, { id: 'clawpit-agents', title: 'Agents' }])
  expect(w.closed).toEqual([])
  await ui.unmount()
})

const DOT = '<circle cx="11.8" cy="2.2" r="2" class="er"/>'

test('sizes: the toggle shows the dot only while folded with a waiter or a failure', { plugins: [savvy] }, async ($, on) => {
  setup(on)
  await start($)
  const ui = await band($)
  const dot = async () => { const t = (await imageOf(ui, 'toggle'))!; return { dot: t.source.includes(DOT), alt: t.alt } }
  const cases: [unknown[], string | null][] = [
    [[run('w1'), run('w2')], null],
    [[run('w1', { blocked: 'which cache?' }), run('w2')], '. An agent needs you'],
    [[run('w1', { status: 'failed', heldDone: true, endedAt: T0 + 60_000 }), run('w2')], '. An agent failed'],
  ]
  for (const [runs, alert] of cases) {
    await setRuns($, runs)
    for (const size of ['everything', 'agents folded', 'one line']) {
      while (await sizeOf(ui) !== size) await click(ui, 'toggle')
      const shown = size !== 'everything' && alert !== null, t = await dot()
      expect({ size, dot: t.dot, named: /An agent/.test(t.alt) }).toEqual({ size, dot: shown, named: shown })
      if (shown) expect(t.alt.endsWith(alert!)).toBe(true)
    }
  }
  await ui.unmount()
})

// The count badge: a pill of rx 7.5 at the crab's corner, in both folded sizes.
const BADGE = 'rx="7.5"'

test('sizes: one agent folds to a crab with no count badge; two show the badge', { plugins: [savvy] }, async ($, on) => {
  setup(on)
  await start($)
  const ui = await band($)
  await click(ui, 'toggle')
  for (const size of ['agents folded', 'one line']) {
    while (await sizeOf(ui) !== size) await click(ui, 'toggle')
    await setRuns($, [run('w1')])
    const one = (await imageOf(ui, 'mascot'))!
    expect(one.source.includes(BADGE)).toBe(false)
    expect(one.alt).toMatch(/^Agents: show them all\. 1 agents?, /)
    await setRuns($, [run('w1'), run('w2')])
    const two = (await imageOf(ui, 'mascot'))!
    expect(two.source.includes(BADGE)).toBe(true)
    expect(two.alt).toMatch(/^Agents: show them all\. 2 agents, /)
  }
  await ui.unmount()
})
