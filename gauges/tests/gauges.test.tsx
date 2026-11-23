import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown>; text: string; children: unknown[] }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const LIMITS = [{ kind: 'five_hour', percentUsed: 30, resetsAt: new Date(T0 + 3_600_000).toISOString() }, { kind: 'seven_day', percentUsed: 20 }]
const USAGE = { startedAt: T0, context: { window: 200_000, percent: 55 }, rateLimits: LIMITS, cost: { usd: 3 } }
const BAND = { bodyColumns: 120, hasSurvey: false, maxRows: 5 }

// The engine beneath the gauges: a frozen clock, a store in memory, a usage reading, a record of commands and atom writes.
const setup = (on: OnT, o: { store?: Record<string, unknown>; usage?: unknown } = {}) => {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(o.store ?? {}))
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  let usage = o.usage ?? USAGE
  on('session.usage', () => ({ value: usage as never }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  const commands: string[] = []
  on('command.run', (_$, e) => { commands.push(e.command); return { text: '' } })
  const writes: { key: string }[] = []
  on('state.set', (_$, e, next) => { if (e.plugin === 'clawpit-gauges') writes.push({ key: e.key }); return next(e) })
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  return { clock, store, commands, ticks: () => writes.filter(w => w.key === 'tick').length, setUsage: (u: unknown) => { usage = u } }
}

const start = ($: $T, surface: 'desktop' | 'terminal' = 'desktop') => $.session.start({ cwd: '/', surface, isInteractive: true })
const band = ($: $T, surface: 'desktop' | 'terminal' = 'desktop', props: Partial<typeof BAND> = {}) =>
  $.ui.mount({ plugin: 'clawpit-gauges', surface, component: 'AbovePrompt', props: { ...BAND, ...props } as never })
type Band = Awaited<ReturnType<typeof band>>
const all = async (ui: Band) => (await ui.findAll({})) as unknown as Node[]
const keys = async (ui: Band) => (await all(ui)).flatMap(n => (n.key ? [n.key] : []))
const imageOf = (n?: Node) => (n?.type === 'Client' ? n.props.props : n?.props) as { source: string; alt: string; press?: string } | undefined
const image = async (ui: Band, key: string) => {
  const ns = await all(ui), box = ns.find(n => n.type === 'Box' && n.key === key)
  return imageOf(ns.find(n => n.type !== 'Box' && n.key === key) ?? (box?.children[0] as Node | undefined))
}
const pressAt = (ui: Band, key: string) => ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: key })

test('gauges: desktop draws the gauge columns and nothing of a crew; terminal and a survey pass through', async ($, on) => {
  setup(on)
  await start($)
  const desk = await band($)
  const k = await keys(desk)
  expect(k).toContain('clawpit-panel')
  for (const col of ['col-context', 'col-5h', 'col-7d', 'col-session']) expect(k).toContain(col)
  for (const crew of ['col-agents', 'col-plan', 'chips', 'plan-line', 'plan-bar', 'mascot']) expect(k).not.toContain(crew)
  await desk.unmount()
  for (const ui of [await band($, 'terminal'), await band($, 'desktop', { hasSurvey: true })]) {
    expect(await ui.find({ key: 'clawpit-panel' })).toBeUndefined()
    expect(await ui.find({ key: 'beneath' })).toBeDefined()
    await ui.unmount()
  }
})

test('gauges: the toggle steps everything, folded, one line and back; the size is stored and read at the next load', async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  const alt = async () => (await image(ui, 'toggle'))!.alt
  expect(await alt()).toBe('Panel: gauges. Press twice for one line')
  await pressAt(ui, 'toggle'); expect(await alt()).toBe('Panel: gauges. Show one line'); expect(w.store.get('size')).toBe('gauges')
  await pressAt(ui, 'toggle'); expect(await alt()).toBe('Panel: one line. Show the gauges'); expect(w.store.get('size')).toBe('line')
  expect(await keys(ui)).toContain('line')
  await pressAt(ui, 'toggle'); expect(w.store.get('size')).toBe('full')
  await ui.unmount()
})

test('gauges: a stored size is drawn from the start', async ($, on) => {
  setup(on, { store: { size: 'line' } })
  await start($)
  const ui = await band($)
  expect(await keys(ui)).toContain('line')
  await ui.unmount()
})

test('gauges: context runs /context, the limits /usage, the chip /compact; the session column presses nothing', async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  await pressAt(ui, 'col-context'); await pressAt(ui, 'col-5h'); await pressAt(ui, 'col-7d'); await pressAt(ui, 'compact')
  expect(w.commands).toEqual(['context', 'usage', 'usage', 'compact'])
  // Not pressable: a plain Svg, not a Client, so nothing to press.
  const ses = (await all(ui)).find(n => n.type === 'Box' && n.key === 'col-session')!.children[0] as Node
  expect(ses.type).toBe('Svg'); expect(imageOf(ses)!.press).toBeUndefined()
  expect(w.commands.length).toBe(4)
  await ui.unmount()
})

test('gauges: a turn ticks at 1 Hz; idle with limits shown, once a minute; idle with nothing timed, never', async ($, on) => {
  const w = setup(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  let at = w.ticks()
  await w.clock.advance(3_000)
  expect(w.ticks() - at).toBe(3)
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 3_000, isAborted: false, turnId: 'm',
    usage: { model: 'claude-opus-5-5', input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1 } } as never)
  at = w.ticks()
  await w.clock.advance(59_000); expect(w.ticks()).toBe(at)
  await w.clock.advance(1_000); expect(w.ticks() - at).toBe(1)
})

test('gauges: with no limits and no tests, idle starts no tick at all', async ($, on) => {
  const w = setup(on, { usage: { ...USAGE, rateLimits: [] } })
  await start($)
  const at = w.ticks()
  await w.clock.advance(600_000)
  expect(w.ticks()).toBe(at)
})

test('gauges: a passing test run shows the tests column', async ($, on) => {
  setup(on)
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '12 pass\n0 fail', stderr: '', interrupted: false } }) as never)
  await start($)
  await $.tool.call({ tool: 'Bash', command: 'npm test' } as never)
  const ui = await band($, 'desktop', { bodyColumns: 140 })
  expect(await keys(ui)).toContain('col-tests')
  await ui.unmount()
})

// The engine's settled rows, as AbovePromptList hands them over.
const row = (plugin: string, key: string) => ({ plugin, tree: { type: 'Box', props: { key }, children: [] } })
const list = async ($: $T, on: OnT, rows: ReturnType<typeof row>[]) => {
  let got: string[] = []
  on('ui.render', { component: 'AbovePromptList' } as never, (h: $T, e: { props: { rows: { plugin: string }[] } }) => {
    got = e.props.rows.map(r => r.plugin); return (h as never as { ui: { resolve: (e: unknown) => { Box: (p: unknown) => unknown } } }).ui.resolve(e).Box({ key: 'list', children: [] })
  })
  const ui = await $.ui.mount({ plugin: 'clawpit-gauges', surface: 'desktop', component: 'AbovePromptList', props: { ...BAND, rows } as never })
  await ui.unmount()
  return got
}

test('gauges: with a clawpit row in the band the gauges row steps out; every other row stays', async ($, on) => {
  expect(await list($, on, [row('clawpit', 'a'), row('clawpit-gauges', 'b'), row('savvy-progress', 'c')])).toEqual(['clawpit', 'savvy-progress'])
})

test('gauges: with no clawpit row the gauges row stays', async ($, on) => {
  expect(await list($, on, [row('skins', 'a'), row('clawpit-gauges', 'b')])).toEqual(['skins', 'clawpit-gauges'])
})

test('gauges: with animations off a moved reading draws no needle sweep', { options: { animations: false } }, async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  w.setUsage({ ...USAGE, context: { window: 200_000, percent: 80 } })
  await $.session.measure({ changed: ['context'] } as never)
  await ui.redraw({ ...BAND } as never)
  expect((await image(ui, 'col-context'))!.source).not.toMatch(/animation|transition/)
  await ui.unmount()
})

test('gauges: with animations on a moved reading sweeps its needle once', async ($, on) => {
  const w = setup(on)
  await start($)
  const ui = await band($)
  w.setUsage({ ...USAGE, context: { window: 200_000, percent: 80 } })
  await $.session.measure({ changed: ['context'] } as never)
  await ui.redraw({ ...BAND } as never)
  const src = (await image(ui, 'col-context'))!.source
  expect(src).toMatch(/animation|transition/); expect(src).not.toContain('infinite')
  await ui.unmount()
})
