import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { COMPACT_KEY } from '../hooks/panel/draw'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown>; text: string; children: unknown[] }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const USAGE = { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } }
const BAND = { bodyColumns: 120, hasSurvey: false, maxRows: 5 }

// The engine beneath clawpit: a frozen clock, a store in memory, the answers each event needs,
// a record of every atom write and of every command run.
const setup = (on: OnT, o: { store?: Record<string, unknown>; usage?: unknown; surfaces?: string[] } = {}) => {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(o.store ?? {}))
  const storeSets: string[] = []
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { storeSets.push(e.key); store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: (o.usage ?? USAGE) as never }))
  if (o.surfaces) { const surfaces = o.surfaces; on('session.surfaces', () => ({ value: surfaces as never })) }
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  let agent = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++agent}` }))
  const opens: string[] = []
  on('ui.open', (_$, e) => { opens.push(e.id); return { value: { isPlaced: true } } })
  const commands: string[] = []
  on('command.run', (_$, e) => { commands.push(e.command); return { text: '' } })
  const writes: { plugin: string; key: string; value: unknown }[] = []
  on('state.set', (_$, e, next) => { writes.push({ plugin: e.plugin, key: e.key, value: e.value }); return next(e) })
  const mine = () => writes.filter(w => w.plugin === 'clawpit').length
  const last = (key: string) => writes.filter(w => w.plugin === 'clawpit' && w.key === key).at(-1)?.value
  // The engine's own drawing of the band, keyed so a test can tell whether it is kept.
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  return { clock, store, storeSets, commands, mine, last, opens }
}

const start = ($: $T, surface: 'desktop' | 'terminal' = 'desktop') => $.session.start({ cwd: '/', surface, isInteractive: true })
const band = ($: $T, surface: 'desktop' | 'terminal' = 'desktop', props: Partial<typeof BAND> = {}) =>
  $.ui.mount({ plugin: 'clawpit', surface, component: 'AbovePrompt', props: { ...BAND, ...props } as never })
const spawn = ($: $T, description: string) =>
  $.agent.spawn({ tool_use_id: description, prompt: '', description, subagentType: 'implementer', provider: 'claude', parentModel: 'x', background: false, fork: false } as never)
type Band = Awaited<ReturnType<typeof band>>
const all = async (ui: Band) => (await ui.findAll({})) as unknown as Node[]
const columns = async (ui: Band) => (await all(ui)).filter(n => n.type === 'Box' && n.key?.startsWith('col-')).map(n => n.key!.slice(4))
// An image's own props: a Svg's, or what a Client hands its module.
const imageOf = (n?: Node) => (n?.type === 'Client' ? n.props.props : n?.props) as { source: string; alt: string } | undefined
// A drawn Svg carries no key, so a column's image is found as the only child of its keyed Box.
const image = async (ui: Band, key: string) => {
  const ns = await all(ui), box = ns.find(n => n.type === 'Box' && n.key === key)
  return imageOf(ns.find(n => n.type !== 'Box' && n.key === key) ?? (box?.children[0] as Node | undefined))
}

// savvy-progress as clawpit sees it: a run per spawn in its agents atom, any list set through a
// test-only tool, and its band, which stands down while clawpit's takeover atom is true.
const savvy = {
  name: 'savvy-progress',
  register(on: OnT) {
    const ref = { plugin: 'savvy-progress', key: 'agents' } as const
    on('agent.spawn', async ($, e, next) => {
      const out = await next(e)
      const list = ((await $.state.get(ref)).value ?? []) as unknown[]
      const run = { id: out.agentId, agentId: out.agentId, type: e.subagentType, description: e.description, model: out.model, status: 'running', startedAt: 0, contextTokens: 0, contextMax: 1, costUsd: 0 }
      await $.state.set(ref, [...list, run] as never)
      return out
    })
    on('tool.call', { tool: 'savvy-set' }, async ($, e) => {
      await $.state.set(ref, (e as unknown as { runs: never }).runs)
      return { result: {} } as never
    })
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      if ((await $.state.get({ plugin: 'clawpit', key: 'takeover' })).value === true) return next(e)
      return $.ui.resolve(e).Button({ key: 'savvy-agents', label: '1 agent', onPress: () => {} })
    })
  },
}

test('panel hook: desktop draws the panel root; terminal and a survey pass through', async ($, on) => {
  setup(on)
  await start($)
  const desk = await band($)
  expect((await desk.find({ key: 'clawpit-panel' }))?.type).toBe('Box')
  expect(await desk.find({ key: 'beneath' })).toBeUndefined()
  await desk.unmount()
  for (const ui of [await band($, 'terminal'), await band($, 'desktop', { hasSurvey: true })]) {
    expect(await ui.find({ key: 'clawpit-panel' })).toBeUndefined()
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    await ui.unmount()
  }
})

test('panel hook: bodyColumns sets the column count', async ($, on) => {
  const limits = [{ kind: 'five_hour', percentUsed: 60, resetsAt: new Date(T0 + 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 60 }]
  setup(on, { usage: { ...USAGE, rateLimits: limits } })
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '12 pass\n0 fail', stderr: '', interrupted: false } }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await band($, 'desktop', { bodyColumns: 46 })
  expect(await columns(ui)).toEqual(['context', 'turn', '5h'])
  await ui.redraw({ ...BAND, bodyColumns: 88 } as never)
  expect(await columns(ui)).toEqual(['context', 'turn', '5h', '7d', 'session', 'tests'])
  await ui.unmount()
})

test('panel hook: Compact now runs /compact once per press', async ($, on) => {
  const w = setup(on, { usage: { ...USAGE, context: { window: 200_000, percent: 92 } } })
  await start($)
  const ui = await band($)
  const button = (await ui.find({ key: COMPACT_KEY })) as unknown as Node
  expect(button.type).toBe('Button')
  expect(button.text).toBe('Compact now')
  expect(button.props.dimColor).toBeUndefined()
  await ui.press({ key: COMPACT_KEY })
  expect(w.commands).toEqual(['compact'])
  await ui.press({ key: COMPACT_KEY })
  expect(w.commands).toEqual(['compact', 'compact'])
  await ui.unmount()
})

test('panel hook: from 50% context a Compact button runs /compact once per press; below 50 there is none', async ($, on) => {
  const w = setup(on, { usage: { ...USAGE, context: { window: 200_000, percent: 60 } } })
  await start($)
  const ui = await band($)
  const button = (await ui.find({ key: COMPACT_KEY })) as unknown as Node
  expect(button.type).toBe('Button'); expect(button.text).toBe('Compact'); expect('dimColor' in button.props).toBe(false)
  await ui.press({ key: COMPACT_KEY })
  expect(w.commands).toEqual(['compact'])
  await ui.unmount()
})

test('panel hook: below 50% context there is no Compact button', async ($, on) => {
  setup(on, { usage: { ...USAGE, context: { window: 200_000, percent: 49 } } })
  await start($)
  const ui = await band($)
  expect(await ui.find({ key: COMPACT_KEY })).toBeUndefined()
  await ui.unmount()
})

test('panel hook: a press on the 5h or 7d column runs /usage, on the context column /context; nothing else changes', async ($, on) => {
  const limits = [{ kind: 'five_hour', percentUsed: 60, resetsAt: new Date(T0 + 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 60 }]
  const w = setup(on, { usage: { ...USAGE, context: { window: 200_000, percent: 30 }, rateLimits: limits } })
  await start($)
  const ui = await band($)
  const before = { writes: w.mine(), sets: w.storeSets.length }
  for (const key of ['col-5h', 'col-7d', 'col-context']) await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: key })
  expect(w.commands).toEqual(['usage', 'usage', 'context'])
  expect({ writes: w.mine(), sets: w.storeSets.length }).toEqual(before)
  await ui.unmount()
})

test('panel hook: a throwing draw shows the failure line, not a blank', async ($, on) => {
  setup(on)
  // A ui atom no version of clawpit writes: the drawing throws on it.
  on('state.get', { plugin: 'clawpit', key: 'ui' }, () => ({ value: { value: null, version: 1 } }) as never)
  await start($)
  const ui = await band($)
  expect(await ui.find({ key: 'clawpit-panel' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: 'clawpit could not draw this panel: throw' }))?.text).toBe('clawpit could not draw this panel: throw')
  await ui.unmount()
})

// The kit asks one chain over every plugin for the band (no `e.plugin`), where a session asks each plugin
// for its own row; so savvy loads above clawpit here, or clawpit's answer would hide savvy's row either way.
test('panel hook: savvy\'s band stays out while takeover is true', { plugins: [{ ...savvy, tier: 'prepend' }] }, async ($, on) => {
  setup(on)
  await start($, 'terminal')
  const term = await $.ui.mount({ plugin: 'savvy-progress', surface: 'desktop', component: 'AbovePrompt', props: BAND as never })
  expect(await term.find({ key: 'savvy-agents' })).toBeDefined()
  await term.unmount()
  await start($)
  const ui = await $.ui.mount({ plugin: 'savvy-progress', surface: 'desktop', component: 'AbovePrompt', props: BAND as never })
  expect(await ui.find({ key: 'savvy-agents' })).toBeUndefined()
  expect(await ui.find({ key: 'clawpit-panel' })).toBeDefined()
  await ui.unmount()
})

// What a tool call left on the agent's chip: its crab's prop, by the prop's own fill.
const PROP_FILL = { read: '#fffdf5', write: '#2b4aa8', search: '#2b4fa8' }
const propOn = (source = '') => Object.entries(PROP_FILL).filter(([, fill]) => source.includes(fill)).map(([prop]) => prop)

test('wiring: an agent\'s tool call sets that agent\'s activity, a main one the main\'s', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  on('tool.call', () => ({ result: {} }) as never)
  await start($)
  await spawn($, 'fix the cache')
  const ui = await band($)
  expect(propOn((await image(ui, 'chip-w1'))?.source)).toEqual([])
  await $.tool.call({ tool: 'Read', file_path: '/src/cache.ts', agentId: 'w1' } as never)
  await w.clock.advance(1_000)
  expect(propOn((await image(ui, 'chip-w1'))?.source)).toEqual(['read'])
  // The main loop's edit is the main's: the agent's chip keeps its own activity.
  await $.tool.call({ tool: 'Edit', file_path: '/src/main.ts', old_string: 'a', new_string: 'b' } as never)
  await w.clock.advance(1_000)
  expect(propOn((await image(ui, 'chip-w1'))?.source)).toEqual(['read'])
  await $.tool.call({ tool: 'Grep', pattern: 'ttl', agentId: 'w1' } as never)
  await w.clock.advance(1_000)
  expect(propOn((await image(ui, 'chip-w1'))?.source)).toEqual(['search'])
  await ui.unmount()
})

test('wiring: a test run shows the tests stat, and the next edit clears it', async ($, on) => {
  const w = setup(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '3 passed, 1 failed', interrupted: false } }) as never)
  on('tool.call', { tool: 'Edit' }, () => ({ result: { structuredPatch: [], type: 'update' } }) as never)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  const ui = await band($)
  expect(await columns(ui)).not.toContain('tests')
  await $.tool.call({ tool: 'Bash', command: 'npx vitest run' } as never)
  await w.clock.advance(1_000)
  expect(await columns(ui)).toContain('tests')
  expect((await image(ui, 'col-tests'))?.alt).toMatch(/^tests: 1 failed/)
  await $.tool.call({ tool: 'Edit', file_path: '/src/a.ts', old_string: 'a', new_string: 'b' } as never)
  await w.clock.advance(1_000)
  expect(await columns(ui)).not.toContain('tests')
  await ui.unmount()
})

test('wiring: savvy absent: the views still build, with the empty crew', async ($, on) => {
  setup(on)
  await start($)
  const ui = await band($)
  expect(await columns(ui)).toEqual(['context', 'session'])
  expect(await ui.find({ key: 'chips' })).toBeUndefined()
  expect(await ui.find({ key: 'mascot' })).toBeUndefined()
  await ui.unmount()
})

// ponytail as clawpit sees it: its band atom, written once the test asks.
const ponytail = {
  name: 'ponytail',
  register(on: OnT) {
    on('tool.call', { tool: 'ponytail-set' }, async $ => {
      await $.state.set({ plugin: 'ponytail', key: 'band' }, { reused: ['a', 'b'], created: ['c'], openCallers: ['src/cache.ts:get'] } as never)
      return { result: {} } as never
    })
  },
}

test('wiring: ponytail absent gives code null; its band atom gives reuse and callers', { plugins: [ponytail] }, async ($, on) => {
  setup(on)
  await start($)
  const ui = await band($, 'desktop', { bodyColumns: 88 })
  expect(await columns(ui)).toEqual(['context', 'session'])
  await $.tool.call({ tool: 'ponytail-set' } as never)
  expect(await columns(ui)).toEqual(['context', 'session', 'reuse', 'callers'])
  expect((await image(ui, 'col-reuse'))?.alt).toBe('reuse: 67%, 2 used · 1 new')
  expect((await image(ui, 'col-callers'))?.alt).toBe('callers: 1 open, src/cache.ts:get')
  await ui.unmount()
})

const SIZE_ALT = /^Panel: (everything|agents folded|one line)/
const sizeOf = async (ui: Band) => (await image(ui, 'toggle'))?.alt.match(SIZE_ALT)?.[1]

test('wiring: the size press cycles and persists; a bad stored size is full', async ($, on) => {
  const w = setup(on, { store: { size: 'huge' } })
  await start($)
  const ui = await band($)
  expect(await sizeOf(ui)).toBe('everything')
  await ui.post({ press: 'size' }, { in: 'toggle' })
  expect(await sizeOf(ui)).toBe('agents folded')
  expect(w.store.get('size')).toBe('gauges')
  await ui.post({ press: 'size' }, { in: 'toggle' })
  expect(await sizeOf(ui)).toBe('one line')
  expect(w.store.get('size')).toBe('line')
  await ui.post({ press: 'size' }, { in: 'toggle' })
  expect(await sizeOf(ui)).toBe('everything')
  expect(w.store.get('size')).toBe('full')
  await ui.unmount()
})

// A plugin reload inside a running session fires no session.start: the first observer does the start-up work.
test('wiring: without session.start, the first observer on a desktop session sets takeover and restores the stored size', async ($, on) => {
  const w = setup(on, { store: { size: 'gauges' }, surfaces: ['desktop'] })
  const ui = await band($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  expect(w.last('takeover')).toBe(true)
  expect(await sizeOf(ui)).toBe('agents folded')
  await ui.unmount()
})

test('wiring: an unknown press is ignored and answered {}', async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  const before = { writes: w.mine(), sets: w.storeSets.length, tree: JSON.stringify(await ui.drawn()) }
  for (const data of [null, 7, 'size', { press: 7 }, { press: 'nope' }, { press: 'row:' }, { press: 'kids:' }, { other: 'size' }])
    await ui.post(data as never, { in: 'toggle' })
  expect({ writes: w.mine(), sets: w.storeSets.length, tree: JSON.stringify(await ui.drawn()) }).toEqual(before)
  await ui.unmount()
})

test('wiring: ten minutes after the turn ends the view is no longer armed', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  const failed = { id: 'w1', agentId: 'w1', type: 'implementer', description: 'fix the cache', model: 'claude-opus-5-5', status: 'failed', heldDone: true, startedAt: T0, endedAt: T0 + 60_000, contextTokens: 0, contextMax: 1, costUsd: 0 }
  await $.tool.call({ tool: 'savvy-set', runs: [failed] } as never)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1_000, isAborted: false, turnId: 'm' } as never)
  const ui = await band($)
  const pulsing = async () => (await image(ui, 'chips-alert'))!.source.includes('class="s-halo35 pulse"')
  expect(await pulsing()).toBe(true)
  await w.clock.advance(599_999)
  expect(await pulsing()).toBe(true)
  await w.clock.advance(1)
  expect(await pulsing()).toBe(false)
  await ui.unmount()
})

test('image: a left press posts its press; no press prop posts nothing', async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'right', in: 'toggle' })
  expect(await sizeOf(ui)).toBe('everything')
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'toggle' })
  expect(await sizeOf(ui)).toBe('agents folded')
  await ui.key({ key: 'return', in: 'toggle' })
  expect(await sizeOf(ui)).toBe('one line')
  await ui.key({ key: ' ', in: 'toggle' })
  await ui.key({ key: 'a', in: 'toggle' })
  expect(await sizeOf(ui)).toBe('everything')
  // The context dial presses /context: pointer and key run it and change no state.
  const writes = w.mine(), sets = w.storeSets.length
  await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: 'col-context' })
  await ui.key({ key: 'return', in: 'col-context' })
  expect([w.mine(), w.storeSets.length]).toEqual([writes, sets])
  expect(w.commands).toEqual(['context', 'context'])
  await ui.unmount()
})

test('panel hook: pressing a chip opens the Agents pane', { plugins: [savvy] }, async ($, on) => {
  const { opens } = setup(on), closes: string[] = []
  on('ui.close', (_$, e) => { closes.push(e.id); return { value: undefined } as never })
  await start($)
  const run = (id: string, o: Record<string, unknown> = {}) =>
    ({ id, agentId: id, type: 'implementer', description: `worker ${id}`, model: 'm', status: 'running', startedAt: T0, contextTokens: 0, contextMax: 1, costUsd: 0, ...o })
  // An alert, three walkers, still chips, and more than two rows hold, so a '+N more' chip.
  const runs = [run('a0', { blocked: 'Which schema?' }), ...Array.from({ length: 40 }, (_, i) => run(`r${i}`))]
  await $.tool.call({ tool: 'savvy-set', runs } as never)
  const ui = await band($, 'desktop', { bodyColumns: 60 })
  const chips = (await all(ui)).filter(n => n.key === 'chips-alert' || n.key === 'chip-more' || n.key?.startsWith('chip-r'))
  expect(chips.map(n => n.key)).toEqual(expect.arrayContaining(['chips-alert', 'chip-more']))
  // Two walkers while someone needs you, so still chips are there too.
  expect(chips.filter(n => n.key?.startsWith('chip-r')).length).toBeGreaterThan(2)
  expect(chips.every(n => n.type === 'Client')).toBe(true)
  for (const n of chips) {
    const before = opens.length
    await ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: n.key! })
    expect(opens.slice(before)).toEqual(['clawpit-agents'])
  }
  expect(closes).toEqual([])
  await ui.unmount()
})

test('panel hook: a chip press opens the Agents pane with that agent\'s drawer open; the alert image presses the chip under the pointer', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on), closes: string[] = []
  on('ui.close', (_$, e) => { closes.push(e.id); return { value: undefined } as never })
  await start($)
  const run = (id: string, o: Record<string, unknown> = {}) =>
    ({ id, agentId: id, type: 'implementer', description: `worker ${id}`, model: 'm', status: 'running', startedAt: T0, contextTokens: 0, contextMax: 1, costUsd: 0, ...o })
  await $.tool.call({ tool: 'savvy-set', runs: [run('a0', { blocked: 'Which schema?' }), run('a1', { blocked: 'Which port?' }), run('r1')] } as never)
  const ui = await band($)
  const press = async (key: string, x = 0) => { const n = w.opens.length; await ui.pointer({ type: 'down', x, y: 0, button: 'left', in: key }); return { opened: w.opens.slice(n), open: (w.last('ui') as { open: string | null } | undefined)?.open } }
  expect(await press('chip-r1')).toEqual({ opened: ['clawpit-agents'], open: 'r1' })
  // The shared alert image: its left edge is the first alert, its right end the second.
  expect(await press('chips-alert', 0)).toEqual({ opened: ['clawpit-agents'], open: 'a0' })
  // Laid out as the desktop lays the image out: its pixels in cells of about 9.2 px.
  const cols = Math.ceil((((await all(ui)).find(n => n.key === 'chips-alert')!.props.props as { width: number }).width) / 9.2)
  await ui.resize({ columns: cols, rows: 2, in: 'chips-alert' })
  expect(await press('chips-alert', 0)).toEqual({ opened: ['clawpit-agents'], open: 'a0' })
  expect(await press('chips-alert', cols - 1)).toEqual({ opened: ['clawpit-agents'], open: 'a1' })
  // From the cost list, a chip press brings the crew back, so the drawer shows.
  await ui.post({ press: 'costs' }, { in: 'toggle' })
  expect((w.last('ui') as { view?: string }).view).toBe('costs')
  await press('chip-r1')
  expect(w.last('ui')).toMatchObject({ open: 'r1', view: 'crew' })
  // An empty id is not a press.
  const before = w.mine()
  await ui.post({ press: 'open:' }, { in: 'toggle' })
  expect(w.mine()).toBe(before)
  expect(closes).toEqual([])
  await ui.unmount()
})
