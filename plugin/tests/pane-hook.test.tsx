import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown>; text: string; children: unknown[] }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const USAGE = { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } }
const PANE = 'clawpit-agents'
const PANE_PROPS = { title: 'Agents', isFocused: false, bodyColumns: 64, placement: 'dock' }
const BAND = { bodyColumns: 120, hasSurvey: false, maxRows: 5 }

// The engine beneath clawpit: a frozen clock, a store in memory, the answers each event needs,
// a session id per session.start, the panes up, and a record of every atom write, every pane opened and every pane closed.
const setup = (on: OnT, o: { store?: Record<string, unknown>; surfaces?: string[]; panes?: string[]; usage?: () => unknown } = {}) => {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(o.store ?? {}))
  const storeSets: string[] = []
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { storeSets.push(e.key); store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  let session = 0
  on('session.start', (_$, e) => { session += 1; return { cwd: e.cwd } })
  on('session.id', () => ({ value: `s${session}` }))
  if (o.surfaces) { const surfaces = o.surfaces; on('session.surfaces', () => ({ value: surfaces as never })) }
  on('session.usage', () => ({ value: (o.usage?.() ?? USAGE) as never }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  let agent = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++agent}` }))
  const opens: { id: string; title?: string }[] = []
  const closes: { id: string; by: string }[] = []
  const up = new Set(o.panes ?? [])
  on('ui.open', (_$, e) => { opens.push({ id: e.id, title: e.title }); up.add(e.id); return { value: { isPlaced: true } } })
  on('ui.close', (_$, e, next) => { closes.push({ id: e.id, by: next.origin.plugin }); up.delete(e.id); return { value: undefined } as never })
  on('ui.panes', () => ({ value: [...up].map(id => ({ id, title: 'Agents', isShown: true, isFocused: false, isPlaced: true })) }) as never)
  const writes: { plugin: string; key: string; value: unknown }[] = []
  on('state.set', (_$, e, next) => { writes.push({ plugin: e.plugin, key: e.key, value: e.value }); return next(e) })
  const mine = () => writes.filter(w => w.plugin === 'clawpit')
  const paneOpen = () => (mine().filter(w => w.key === 'ui').at(-1)?.value as { paneOpen?: boolean } | undefined)?.paneOpen
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  return { clock, store, storeSets, opens, closes, mine, paneOpen }
}

const start = ($: $T, surface: 'desktop' | 'terminal' = 'desktop') => $.session.start({ cwd: '/', surface, isInteractive: true })
const spawn = ($: $T, description: string, parentAgentId?: string) =>
  $.agent.spawn({ tool_use_id: description, prompt: '', description, subagentType: 'implementer', provider: 'claude', parentModel: 'x', background: false, fork: false,
    ...(parentAgentId ? { parentAgentId } : {}) } as never)
const pane = ($: $T, surface: 'desktop' | 'terminal' = 'desktop') =>
  $.ui.mount({ plugin: 'clawpit', surface, component: 'Pane', requestId: PANE, props: PANE_PROPS as never })
// The person closing the pane by its mark. A test's $ raises no ui.close, so a stand-in plugin closes it; clawpit hears the same event.
const closeByHand = ($: $T) => $.tool.call({ tool: 'close-pane' } as never)
type Pane = Awaited<ReturnType<typeof pane>>
const all = async (ui: Pane) => (await ui.findAll({})) as unknown as Node[]
// A drawn Svg carries no key, so a plain image is found by its alt text.
const svgAlt = async (ui: Pane, re: RegExp) => (await all(ui)).find(n => n.type === 'Svg' && re.test(String(n.props.alt)))?.props as { source: string; alt: string } | undefined
const client = async (ui: Pane, key: string) => ((await all(ui)).find(n => n.type === 'Client' && n.key === key)?.props.props) as { source: string; alt: string } | undefined
const press = (ui: Pane, key: string) => ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: key })

const run = (id: string, description: string, o: Record<string, unknown> = {}) =>
  ({ id, agentId: id, type: 'implementer', description, model: 'claude-opus-5-5', status: 'running', startedAt: T0, contextTokens: 0, contextMax: 1, costUsd: 0, ...o })

// savvy-progress as clawpit sees it: a run per spawn in its agents atom, and any list or flow set through test-only tools.
const savvy = {
  name: 'savvy-progress',
  register(on: OnT) {
    const ref = { plugin: 'savvy-progress', key: 'agents' } as const
    on('agent.spawn', async ($, e, next) => {
      const out = await next(e)
      const list = ((await $.state.get(ref)).value ?? []) as unknown[]
      const r = { id: out.agentId, agentId: out.agentId, type: e.subagentType, description: e.description, model: out.model, status: 'running', startedAt: 0, contextTokens: 0, contextMax: 1, costUsd: 0 }
      await $.state.set(ref, [...list, r] as never)
      return out
    })
    on('tool.call', { tool: 'savvy-set' }, async ($, e) => {
      await $.state.set(ref, (e as unknown as { runs: never }).runs)
      return { result: {} } as never
    })
    on('tool.call', { tool: 'savvy-flow' }, async ($, e) => {
      await $.state.set({ plugin: 'savvy-progress', key: 'flow' }, (e as unknown as { flow: never }).flow)
      return { result: {} } as never
    })
  },
}
const setRuns = ($: $T, runs: unknown[]) => $.tool.call({ tool: 'savvy-set', runs } as never)
const person = {
  name: 'person',
  register(on: OnT) {
    on('tool.call', { tool: 'close-pane' }, async $ => { await $.ui.close({ id: 'clawpit-agents' }); return { result: {} } as never })
  },
}

test('pane hook: the first spawn of the session opens the pane once; no later spawn, flow or crew reopens a closed pane; the open press does', { plugins: [savvy, person] }, async ($, on) => {
  const w = setup(on, { store: { size: 'gauges' } })
  await start($)
  expect(w.opens).toEqual([])
  await spawn($, 'fix the cache')
  expect(w.opens).toEqual([{ id: PANE, title: 'Agents' }])
  expect(w.paneOpen()).toBe(true)
  expect(w.store.get('paneAutoOpenedFor')).toBe('s1')
  await spawn($, 'write the docs')
  expect(w.opens.length).toBe(1)
  await closeByHand($)
  expect(w.paneOpen()).toBe(false)
  await spawn($, 'review the fix')
  await $.tool.call({ tool: 'savvy-flow', flow: { title: 'Cache', total: 2, done: 0, phase: 'delegate', isFinished: false, tasks: [{ title: 'fix the cache' }, { title: 'write the docs' }] } } as never)
  await setRuns($, [run('w1', 'fix the cache', { status: 'done', endedAt: T0 + 60_000 }), run('w2', 'write the docs'), run('w3', 'review the fix')])
  expect(w.opens.length).toBe(1)
  // The folded agents column, at the gauges size, is the open press.
  const band = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt', props: BAND as never })
  await band.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'mascot' })
  await band.unmount()
  expect(w.opens).toEqual([{ id: PANE, title: 'Agents' }, { id: PANE, title: 'Agents' }])
  expect(w.paneOpen()).toBe(true)
  // The next session opens it by itself once more.
  await closeByHand($)
  await start($)
  await spawn($, 'next session')
  await spawn($, 'next session again')
  expect(w.opens.length).toBe(3)
  expect(w.store.get('paneAutoOpenedFor')).toBe('s2')
})

// A reload inside a running session fires no session.start; each test is a fresh load, here over the store the last load wrote.
test('pane hook: after a reload in the same session, a closed pane is not reopened by itself', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on, { store: { paneAutoOpenedFor: 's0' }, surfaces: ['desktop'] })
  await spawn($, 'after the reload')
  await spawn($, 'and again')
  expect(w.mine().some(x => x.key === 'takeover' && x.value === true)).toBe(true)
  expect(w.opens).toEqual([])
})

test('pane hook: after a reload in a new session, the first spawn opens the pane', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on, { store: { paneAutoOpenedFor: 'an older session' }, surfaces: ['desktop'] })
  await spawn($, 'after the reload')
  expect(w.opens).toEqual([{ id: PANE, title: 'Agents' }])
  expect(w.store.get('paneAutoOpenedFor')).toBe('s0')
})

test('pane hook: after a reload with the pane still up, the first observer sets paneOpen', async ($, on) => {
  const w = setup(on, { store: { size: 'gauges' }, surfaces: ['desktop'], panes: [PANE] })
  const ui = await pane($)
  expect(w.paneOpen()).toBeUndefined()
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  expect(w.paneOpen()).toBe(true)
  await ui.unmount()
})

test('pane hook: after a reload with no pane up, paneOpen stays false', async ($, on) => {
  const w = setup(on, { surfaces: ['desktop'], panes: ['another'] })
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  expect(w.paneOpen()).toBe(false)
})

test('pane hook: pressing a row opens its drawer; pressing it again closes it; another row moves it', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'write the docs')
  const ui = await pane($)
  const drawers = async () => (await all(ui)).filter(n => n.type === 'Svg' && / log(, |$)/.test(String(n.props.alt))).map(n => n.props.alt)
  expect(await drawers()).toEqual([])
  await press(ui, 'row-w1')
  expect(await drawers()).toEqual(['fix the cache log, Opus 5.5'])
  await press(ui, 'row-w1')
  expect(await drawers()).toEqual([])
  await press(ui, 'row-w1')
  await press(ui, 'crab-w2')
  expect(await drawers()).toEqual(['write the docs log, Opus 5.5'])
  await ui.unmount()
})

test('pane hook: pressing the helpers toggle and the Ended toggle fold and unfold', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'read the tests', 'w1')
  await spawn($, 'old work')
  await setRuns($, [run('w1', 'fix the cache'), run('w2', 'read the tests'), run('w3', 'old work', { status: 'done', endedAt: T0 + 60_000 })])
  const ui = await pane($)
  const kidsAlt = async () => (await client(ui, 'kids-w1'))?.alt
  const helper = async () => (await svgAlt(ui, /^read the tests, /))?.alt
  const endedAlt = async () => (await client(ui, 'ended'))?.alt
  const endedRow = async () => (await svgAlt(ui, /^old work /))?.alt
  expect([await kidsAlt(), await helper()]).toEqual(['1 helpers, open', expect.stringMatching(/^read the tests, /)])
  await press(ui, 'kids-w1')
  expect([await kidsAlt(), await helper()]).toEqual(['1 helpers, folded', undefined])
  await press(ui, 'kids-w1')
  expect(await helper()).toMatch(/^read the tests, /)
  expect([await endedAlt(), await endedRow()]).toEqual(['Ended 1, folded', undefined])
  await press(ui, 'ended')
  expect([await endedAlt(), await endedRow()]).toEqual(['Ended 1, open', expect.stringMatching(/^old work /)])
  await press(ui, 'ended')
  expect(await endedRow()).toBeUndefined()
  await ui.unmount()
})

test('pane hook: closing the pane clears paneOpen, and the ring leaves the loop count', { plugins: [savvy, person] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'fix the cache')
  await setRuns($, [run('w1', 'fix the cache', { blocked: 'Keep the old key?' })])
  const ui = await pane($)
  const ringing = async () => (await client(ui, 'row-w1'))!.source.includes('class="s-ring60 ring"')
  expect(w.paneOpen()).toBe(true)
  expect(await ringing()).toBe(true)
  await closeByHand($)
  expect(w.paneOpen()).toBe(false)
  expect(await ringing()).toBe(false)
  await ui.unmount()
})

test('pane hook: with no agents the pane draws the empty state', async ($, on) => {
  setup(on)
  await start($)
  const desk = await pane($)
  expect((await desk.find({ key: 'clawpit-pane' }))?.type).toBe('Box')
  expect((await svgAlt(desk, /^No agents yet/))?.alt).toBe('No agents yet. Agents you start show up here')
  expect(await desk.find({ key: 'beneath' })).toBeUndefined()
  await desk.unmount()
  // The terminal keeps what the engine beneath draws.
  const term = await pane($, 'terminal')
  expect(await term.find({ key: 'clawpit-pane' })).toBeUndefined()
  expect(await term.find({ key: 'beneath' })).toBeDefined()
  await term.unmount()
})

test('pane hook: a terminal session never opens the pane', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($, 'terminal')
  await spawn($, 'fix the cache')
  expect(w.opens).toEqual([])
})

test('pane hook: a throwing draw shows the failure line', async ($, on) => {
  setup(on)
  // A ui atom no version of clawpit writes: the drawing throws on it.
  on('state.get', { plugin: 'clawpit', key: 'ui' }, () => ({ value: { value: null, version: 1 } }) as never)
  await start($)
  const ui = await pane($)
  expect(await ui.find({ key: 'clawpit-pane' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'clawpit could not draw this panel: throw' }))?.text).toBe('clawpit could not draw this panel: throw')
  await ui.unmount()
})

test('pane hook: 80 agents mount within the bounds on desktop', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  await start($)
  await setRuns($, Array.from({ length: 80 }, (_, i) => run(`m${i}`, `worker ${i + 1}`, { startedAt: T0 - 10_000 - i * 1_000, stepDone: i % 4, stepTotal: 4, stepNote: `Step ${i % 4} of worker ${i + 1}.` })))
  const ui = await pane($)
  await press(ui, 'row-m0')
  expect((await svgAlt(ui, /^worker 1 log, /))?.alt).toMatch(/^worker 1 log, \S/)
  expect((await svgAlt(ui, /more agents$/))?.alt).toMatch(/^\d+ more agents$/)
  expect(JSON.stringify(await ui.drawn()).length).toBeLessThanOrEqual(200_000)
  await ui.unmount()
})

test('pane hook: clawpit never closes its own pane', { plugins: [savvy, person] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'read the tests', 'w1')
  const ui = await pane($)
  for (const key of ['row-w1', 'kids-w1', 'kids-w1', 'row-w1']) await press(ui, key)
  await setRuns($, [run('w1', 'fix the cache', { status: 'done', endedAt: T0 + 60_000 }), run('w2', 'read the tests', { status: 'failed', heldDone: true, endedAt: T0 + 30_000 })])
  await setRuns($, [])
  await ui.unmount()
  await closeByHand($)
  await start($)
  await spawn($, 'next session')
  expect(w.closes.length).toBe(1)
  expect(w.closes.filter(c => c.by !== 'person')).toEqual([])
})

test('wiring: row, kids and ended presses change only the ui atom and never the store', { plugins: [savvy, person] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'read the tests', 'w1')
  await spawn($, 'old work')
  await setRuns($, [run('w1', 'fix the cache'), run('w2', 'read the tests'), run('w3', 'old work', { status: 'done', endedAt: T0 + 60_000 })])
  const ui = await pane($)
  const writes = w.mine().length, sets = w.storeSets.length
  for (const key of ['row-w1', 'kids-w1', 'ended']) await press(ui, key)
  expect(w.mine().slice(writes).map(x => x.key)).toEqual(['ui', 'ui', 'ui'])
  expect(w.storeSets.length).toBe(sets)
  await ui.unmount()
})

test('wiring: the step log follows savvy\'s agents atom', { plugins: [savvy, person] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'fix the cache')
  const ui = await pane($)
  await press(ui, 'row-w1')
  const log = async () => (await svgAlt(ui, /^fix the cache log, Opus 5\.5$/))!.source
  await setRuns($, [run('w1', 'fix the cache', { stepDone: 1, stepTotal: 3, stepNote: 'Read the cache module.' })])
  expect(await log()).toContain('Read the cache module.')
  await w.clock.advance(1_000)
  await setRuns($, [run('w1', 'fix the cache', { stepDone: 2, stepTotal: 3, stepNote: 'Wrote the fix.' })])
  expect(await log()).toContain('Wrote the fix.')
  expect(await log()).toContain('Read the cache module.')
  await ui.unmount()
})

test('image: hover toggles state', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  await start($)
  await spawn($, 'fix the cache')
  const ui = await pane($)
  const wash = async () => ((await ui.find({ type: 'Box', in: 'row-w1' })) as unknown as Node | undefined)?.props.backgroundColor
  expect(await wash()).toBeUndefined()
  await ui.pointer({ type: 'enter', x: 0, y: 0, in: 'row-w1' })
  expect(await wash()).toBe('#80808014')
  await ui.pointer({ type: 'leave', x: 0, y: 0, in: 'row-w1' })
  expect(await wash()).toBeUndefined()
  await ui.unmount()
})

// The prompt box beneath clawpit: a draft, and every fill clawpit asks for.
const promptBox = (on: OnT, draft = '') => {
  const box = { text: draft, cursor: draft.length }, fills: { text: string; mode: string }[] = []
  on('prompt.read', () => ({ value: { ...box } }) as never)
  on('prompt.fill', (_$, e) => {
    fills.push({ text: e.text, mode: e.mode })
    box.text = box.text.slice(0, box.cursor) + e.text + box.text.slice(box.cursor); box.cursor += e.text.length
    return { isFilled: true } as never
  })
  return { box, fills }
}

test('pane hook: pressing a needs-you row puts @ and its title into the prompt once and still opens its drawer', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  const p = promptBox(on, 'ok, ')
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'write the docs')
  await setRuns($, [run('w1', 'fix the cache', { blocked: 'Keep the old key?' }), run('w2', 'write the docs')])
  const ui = await pane($)
  await press(ui, 'row-w1')
  expect(p.fills).toEqual([{ text: '@fix the cache ', mode: 'insert' }]); expect(p.box.text).toBe('ok, @fix the cache ')
  expect((await svgAlt(ui, /^fix the cache log, Opus 5\.5$/))?.alt).toBe('fix the cache log, Opus 5.5')
  // Pressed again, it folds the drawer and leaves a draft that already names the agent.
  await press(ui, 'row-w1')
  expect(p.fills.length).toBe(1); expect(await svgAlt(ui, /^fix the cache log$/)).toBeUndefined()
  // A running row only opens its drawer.
  await press(ui, 'row-w2')
  expect(p.fills.length).toBe(1)
  await ui.unmount()
})

test('pane hook: pressing a helper that waits on you puts @ and its title into the prompt', { plugins: [savvy, person] }, async ($, on) => {
  setup(on)
  const p = promptBox(on)
  await start($)
  await spawn($, 'fix the cache')
  await spawn($, 'read the tests', 'w1')
  await setRuns($, [run('w1', 'fix the cache'), run('w2', 'read the tests', { blocked: 'Which suite?' })])
  const ui = await pane($)
  await press(ui, 'helper-w2')
  expect(p.fills).toEqual([{ text: '@read the tests ', mode: 'insert' }])
  // An id no agent waits under fills nothing.
  await ui.post({ press: 'ask:nobody' }, { in: 'helper-w2' })
  await ui.post({ press: 'ask:w1' }, { in: 'helper-w2' })
  expect(p.fills.length).toBe(1)
  await ui.unmount()
})

test('pane hook: the costs press opens the pane on the costs view; the back row returns to the crew', { plugins: [savvy, person] }, async ($, on) => {
  let usd = 1
  const w = setup(on, { usage: () => ({ ...USAGE, cost: { usd } }) })
  await start($)
  for (const next of [1.5, 1.75]) { await $.turn.start({ text: 'go', turnId: 'm' } as never); usd = next; await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1000, isAborted: false, turnId: 'm' } as never) }
  await setRuns($, [run('w1', 'fix the cache')])
  const ui = await pane($)
  const view = () => (w.mine().filter(x => x.key === 'ui').at(-1)?.value as { view?: string } | undefined)?.view
  // The panel's session column posts this press; here a row's Client stands in for it.
  await ui.post({ press: 'costs' }, { in: 'row-w1' })
  expect(w.opens).toEqual([{ id: PANE, title: 'Agents' }]); expect(view()).toBe('costs')
  const list = await svgAlt(ui, /^Session cost/)
  expect(list?.alt).toContain('turn 2 $0.25'); expect(list?.alt).toContain('turn 1 $0.50')
  expect(list!.alt.indexOf('turn 2')).toBeLessThan(list!.alt.indexOf('turn 1'))
  await press(ui, 'back')
  expect(view()).toBe('crew'); expect(await svgAlt(ui, /^Session cost/)).toBeUndefined()
  expect((await client(ui, 'row-w1'))?.alt).toMatch(/^fix the cache, /)
  await ui.unmount()
})
