import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { bgHash } from '../hooks/model'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown> }

const T0 = Date.UTC(2026, 10, 23, 12, 0, 0)
const USAGE = { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } }
const PANE_PROPS = { title: 'Agents', isFocused: false, bodyColumns: 52, placement: 'dock' }

// The engine beneath clawpit: a frozen clock, a store in memory, every tick written, every toast, and the stop tools,
// answering as `answer` says (a deny, an error, or a result).
const setup = (on: OnT, answer: ($: $T, e: Record<string, unknown>) => unknown = () => ({ result: {} })) => {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>()
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', () => ({ value: USAGE as never }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  const ticks: unknown[] = [], toasts: string[] = [], calls: Record<string, unknown>[] = []
  on('state.set', (_$, e, next) => { if (e.plugin === 'clawpit' && e.key === 'tick') ticks.push(e.value); return next(e) })
  on('ui.toast', (_$, e) => { toasts.push(e.text); return { value: undefined } as never })
  for (const tool of ['TaskStop', 'CronDelete', 'ScheduleWakeup'])
    on('tool.call', { tool } as never, (($: $T, e: Record<string, unknown>) => { calls.push(e); return answer($, e) }) as never)
  return { clock, ticks, toasts, calls }
}

// savvy-progress as clawpit sees it: its background atom, set through a test-only tool. An older savvy never writes it.
const savvy = {
  name: 'savvy-progress',
  register(on: OnT) {
    on('tool.call', { tool: 'savvy-bg' }, async ($, e) => {
      await $.state.set({ plugin: 'savvy-progress', key: 'background' } as never, (e as unknown as { list: never }).list)
      return { result: {} } as never
    })
  },
}
const setBg = ($: $T, list: unknown[]) => $.tool.call({ tool: 'savvy-bg', list } as never)
const task = (id: string, kind: string, text: string, status: string, o: Record<string, unknown> = {}) => ({ id, kind, text, status, startedAt: T0, ...o })
const start = ($: $T) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const pane = ($: $T) => $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'Pane', requestId: 'clawpit-agents', props: PANE_PROPS as never })
type Pane = Awaited<ReturnType<typeof pane>>
const alts = async (ui: Pane) => ((await ui.findAll({})) as unknown as Node[])
  .flatMap(n => (n.type === 'Svg' ? [String(n.props.alt)] : n.type === 'Client' ? [String((n.props.props as { alt?: unknown } | undefined)?.alt)] : []))
const stop = (ui: Pane, id: string) => ui.pointer({ type: 'down', x: 0, y: 0, button: 'left', in: `stop-${bgHash(id)}` })
const prompt = ($: $T, kind: string) => $.prompt.submit({ text: 'go', wait: false, origin: { kind } } as never)
// A running row's alt ends with its start as a clock time, in the machine's zone and 12/24 h: matched by shape.
const since = (head: string) => (list: string[]) => list.some(a => a.startsWith(`${head}, since `) && /, since \d{1,2}:\d{2}( [AP]M)?$/.test(a))
const CONSENT = (kind: string, title: string) => `The user pressed Stop on the background ${kind} "${title}" in the Agents pane.`

test('background hook: with no background atom the pane draws today\'s empty state; savvy\'s rows draw the section', { plugins: [savvy] }, async ($, on) => {
  setup(on)
  await start($)
  const ui = await pane($)
  expect(await alts(ui)).toEqual(['No agents yet. Agents you start show up here'])
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  expect(await alts(ui)).toEqual(expect.arrayContaining(['Background: 1 running or waiting', 'Stop npm run dev']))
  expect(since('npm run dev, shell, running <1m')(await alts(ui))).toBe(true)
  await ui.unmount()
})

test('background hook: the minute tick runs for a running row or a wakeup with a time, not for a cron alone, and stops with the last', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setBg($, [task('c1', 'cron', 'check CI', 'scheduled', { schedule: 'every 10 minutes' })])
  let at = w.ticks.length
  await w.clock.advance(120_000)
  expect(w.ticks.length).toBe(at)
  await setBg($, [task('c1', 'cron', 'check CI', 'scheduled'), task('b1', 'shell', 'npm run dev', 'running')])
  at = w.ticks.length
  await w.clock.advance(60_000)
  expect(w.ticks.length).toBe(at + 1)
  await setBg($, [task('c1', 'cron', 'check CI', 'scheduled'), task('b1', 'shell', 'npm run dev', 'done', { endedAt: T0 + 60_000 })])
  at = w.ticks.length
  await w.clock.advance(180_000)
  expect(w.ticks.length).toBe(at)
  await setBg($, [task('wake:x', 'wakeup', 'resume', 'scheduled', { nextAt: T0 + 600_000 })])
  at = w.ticks.length
  await w.clock.advance(60_000)
  expect(w.ticks.length).toBe(at + 1)
})

test('background hook: Stop calls TaskStop, CronDelete or ScheduleWakeup stop with a consent line, hides the row and repaints at once', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running'), task('c1', 'cron', 'check CI', 'scheduled', { schedule: 'hourly' }),
    task('wake:a', 'wakeup', 'resume a', 'scheduled', { nextAt: T0 + 600_000 }), task('wake:b', 'wakeup', 'resume b', 'scheduled', { nextAt: T0 + 900_000 })])
  const ui = await pane($)
  let at = w.ticks.length
  await stop(ui, 'b1')
  expect(w.calls.length).toBe(1); expect(w.calls[0]).toMatchObject({ tool: 'TaskStop', task_id: 'b1', consent: CONSENT('shell', 'npm run dev') })
  expect(w.ticks.length).toBe(at + 1)
  expect((await alts(ui)).some(a => a.startsWith('npm run dev'))).toBe(false)
  await stop(ui, 'c1')
  expect(w.calls[1]).toMatchObject({ tool: 'CronDelete', id: 'c1', consent: CONSENT('cron', 'check CI') })
  // One wakeup stop ends them all, so every wakeup row hides.
  await stop(ui, 'wake:a')
  expect(w.calls[2]).toMatchObject({ tool: 'ScheduleWakeup', stop: true, consent: CONSENT('wakeup', 'resume a') }); expect(w.calls.length).toBe(3)
  expect(await alts(ui)).toEqual(['No agents yet. Agents you start show up here'])
  // Nothing timed is left: the minute tick is off.
  at = w.ticks.length
  await w.clock.advance(180_000)
  expect(w.ticks.length).toBe(at)
  expect(w.toasts).toEqual([])
  await ui.unmount()
})

test('background hook: a stopped id that comes back with a new start shows again; an unknown hash does nothing', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setBg($, [task('wake:a', 'wakeup', 'resume a', 'scheduled', { nextAt: T0 + 600_000 })])
  const ui = await pane($)
  await stop(ui, 'wake:a')
  expect((await alts(ui)).some(a => a.startsWith('resume a'))).toBe(false)
  await setBg($, [task('wake:a', 'wakeup', 'resume a', 'scheduled', { startedAt: T0 + 5_000, nextAt: T0 + 900_000 })])
  expect((await alts(ui)).some(a => a.startsWith('resume a'))).toBe(true)
  for (const press of ['stop:nothere', 'stop:']) await ui.post({ press } as never, { in: `stop-${bgHash('wake:a')}` })
  expect(w.calls.length).toBe(1)
  expect((await alts(ui)).some(a => a.startsWith('resume a'))).toBe(true)
  await stop(ui, 'wake:a')
  expect(w.calls.length).toBe(2)
  await ui.unmount()
})

test('background hook: a refused or failed Stop toasts the reason and the row stays', { plugins: [savvy] }, async ($, on) => {
  let n = 0
  const w = setup(on, () => (n++ ? { isError: true, result: 'Shell could not be signalled', text: 'Shell could not be signalled' } : { deny: 'Blocked by policy' }))
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  const ui = await pane($)
  await stop(ui, 'b1')
  await stop(ui, 'b1')
  expect(w.toasts).toEqual(["Couldn't stop npm run dev: Blocked by policy", "Couldn't stop npm run dev: Shell could not be signalled"])
  expect(since('npm run dev, shell, running <1m')(await alts(ui))).toBe(true)
  await ui.unmount()
})

test('background hook: a Stop on a task or cron that is already gone hides its row without a toast', { plugins: [savvy] }, async ($, on) => {
  // The engine's own words when the id no longer exists (TaskStop, CronDelete), as seen on Claude Code 2.1.330.
  // The engine appends hints to the TaskStop wording; a shell that ended on its own is still on record but not running.
  const said: Record<string, string> = {
    b1: 'No task found with ID: b1. Did you mean: b2?', b2: 'Task b2 is not running (status: completed)', c1: "No scheduled job with id 'c1'" }
  const w = setup(on, (_$, e) => { const m = said[String(e.task_id ?? e.id)]; return { isError: true, result: m, text: m } })
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running'), task('b2', 'monitor', 'watch CI', 'running'),
    task('c1', 'cron', 'check CI', 'scheduled', { schedule: 'every 10 minutes' })])
  const ui = await pane($)
  for (const id of ['b1', 'b2', 'c1']) await stop(ui, id)
  expect(w.toasts).toEqual([])
  expect((await alts(ui)).some(a => ['npm run dev', 'watch CI', 'check CI'].some(t => a.startsWith(t)))).toBe(false)
  await ui.unmount()
})

test('background hook: a deny always toasts, even one worded like an already-gone answer; a still-running answer toasts', { plugins: [savvy] }, async ($, on) => {
  let n = 0
  const w = setup(on, () => (n++ ? { isError: true, result: 'Task b1 is not running (status: running)', text: 'Task b1 is not running (status: running)' } : { deny: 'No task found with ID: b1' }))
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  const ui = await pane($)
  await stop(ui, 'b1')
  await stop(ui, 'b1')
  expect(w.toasts).toEqual(["Couldn't stop npm run dev: No task found with ID: b1", "Couldn't stop npm run dev: Task b1 is not running (status: running)"])
  expect((await alts(ui)).some(a => a.startsWith('npm run dev'))).toBe(true)
  await ui.unmount()
})

test('background hook: a failed row shows until the next composer or bridge prompt, not past it; a notification keeps it', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  const failed = (at: number) => task(`b${at}`, 'shell', `build ${at}`, 'failed', { endedAt: T0 + at })
  await w.clock.advance(1_000)
  await setBg($, [failed(1_000)])
  const ui = await pane($)
  expect(await alts(ui)).toContain('build 1000, shell, failed after <1m')
  await prompt($, 'task-notification')
  expect(await alts(ui)).toContain('build 1000, shell, failed after <1m')
  await prompt($, 'composer')
  expect(await alts(ui)).toEqual(['No agents yet. Agents you start show up here'])
  await w.clock.advance(1_000)
  await setBg($, [failed(1_000), failed(2_000)])
  expect(await alts(ui)).toContain('build 2000, shell, failed after <1m')
  await prompt($, 'bridge')
  expect(await alts(ui)).toEqual(['No agents yet. Agents you start show up here'])
  await ui.unmount()
})

test('background hook: a second press while a Stop is in flight calls the tool once', { plugins: [savvy] }, async ($, on) => {
  let release = () => {}
  const w = setup(on, () => new Promise(done => { release = () => done({ result: {} }) }))
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  const ui = await pane($)
  const first = stop(ui, 'b1'), second = stop(ui, 'b1')
  await new Promise(r => setTimeout(r, 20))
  release()
  await Promise.all([first, second])
  expect(w.calls.length).toBe(1)
  // The guard clears once the call ends: a later press reaches the tool again.
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running', { startedAt: T0 + 1 })])
  const third = stop(ui, 'b1')
  await new Promise(r => setTimeout(r, 20))
  release()
  await third
  expect(w.calls.length).toBe(2)
  await ui.unmount()
})

// savvy, and a new shell it records while TaskStop runs.
const savvyStartsMore = {
  name: 'savvy-progress',
  register(on: OnT) {
    const ref = { plugin: 'savvy-progress', key: 'background' } as const
    on('tool.call', { tool: 'savvy-bg' }, async ($, e) => {
      await $.state.set(ref as never, (e as unknown as { list: never }).list)
      return { result: {} } as never
    })
    on('tool.call', { tool: 'TaskStop' } as never, (async ($: $T, e: never, next: (e: never) => unknown) => {
      const at = Date.UTC(2026, 10, 23, 12, 0, 0)
      await $.state.set(ref as never, [{ id: 'b1', kind: 'shell', text: 'npm run dev', status: 'running', startedAt: at },
        { id: 'b2', kind: 'shell', text: 'npm test -- --watch', status: 'running', startedAt: at }] as never)
      return next(e)
    }) as never)
  },
}
test('background hook: after a Stop, the rows savvy wrote meanwhile decide the minute tick', { plugins: [savvyStartsMore] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  const ui = await pane($)
  await stop(ui, 'b1')
  expect(since('npm test -- --watch, shell, running <1m')(await alts(ui))).toBe(true)
  const at = w.ticks.length
  await w.clock.advance(60_000)
  expect(w.ticks.length).toBe(at + 1)
  await ui.unmount()
})

// Claude Code's timeFormat row decides how the clock times read; it is read with the setup rows, never per render.
const timeFormat = (on: OnT, value: string) => {
  const seen = { lists: 0 }
  on('config.list', () => { seen.lists += 1; return { value: [{ key: 'timeFormat', label: 'Time format', description: 'Clock times', kind: 'choice', value,
    options: ['auto', '12-hour', '24-hour'], provider: { plugin: 'claude-code', tier: 'user' }, isLocked: false }] } as never })
  return seen
}
for (const [value, shape] of [['12-hour', / [AP]M$/], ['24-hour', /, since \d{2}:\d{2}$/]] as const)
  test(`background hook: the timeFormat row ${value} decides the clock times, read once and not per render`, { plugins: [savvy] }, async ($, on) => {
    const w = setup(on), seen = timeFormat(on, value)
    await start($)
    await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
    const ui = await pane($)
    const row = (await alts(ui)).find(a => a.startsWith('npm run dev, shell, running'))!
    expect(row).toMatch(shape)
    const lists = seen.lists
    await w.clock.advance(180_000)
    expect((await alts(ui)).find(a => a.startsWith('npm run dev, shell, running'))).toMatch(/running 3m, since /)
    expect(seen.lists).toBe(lists)
    await ui.unmount()
  })

// The person changing timeFormat in /config, as another plugin would; the engine beneath keeps the row's new value.
const picker = {
  name: 'picker',
  register(on: OnT) {
    on('tool.call', { tool: 'config-pick' }, async ($, e) => { await $.config.set((e as unknown as { pick: never }).pick); return { result: {} } as never })
  },
}
test('background hook: a timeFormat change in /config shows at the next render', { plugins: [savvy, picker] }, async ($, on) => {
  setup(on)
  let value = '24-hour'
  on('config.list', () => ({ value: [{ key: 'timeFormat', label: 'Time format', description: 'Clock times', kind: 'choice', value,
    options: ['auto', '12-hour', '24-hour'], provider: { plugin: 'claude-code', tier: 'user' }, isLocked: false }] }) as never)
  on('config.set', (_$, e) => { if (e.key === 'timeFormat') value = String(e.value); return { value: e.value } })
  await start($)
  await setBg($, [task('b1', 'shell', 'npm run dev', 'running')])
  const ui = await pane($)
  const row = async () => (await alts(ui)).find(a => a.startsWith('npm run dev, shell, running'))!
  expect(await row()).toMatch(/, since \d{2}:\d{2}$/)
  await $.tool.call({ tool: 'config-pick', pick: { key: 'timeFormat', value: '12-hour' } } as never)
  expect(await row()).toMatch(/ [AP]M$/)
  await ui.unmount()
})
