import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Write = { plugin: string; key: string; value: unknown }

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0)
const USAGE = { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 1 } }

// The engine beneath clawpit: a frozen clock, a store in memory whose writes are counted, the answers
// each event needs, and a record of every atom write.
const setup = (on: OnT, o: { store?: Record<string, unknown>; usage?: () => unknown; surfaces?: () => string[] } = {}) => {
  const clock = mock.clock(on, { now: T0 })
  const store = new Map<string, unknown>(Object.entries(o.store ?? {}))
  const storeSets: string[] = []
  on('store.get', (_$, e) => ({ value: store.get(e.key) }))
  on('store.set', (_$, e) => { storeSets.push(e.key); store.set(e.key, e.value); return { value: undefined } })
  on('store.keys', () => ({ value: [...store.keys()] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.usage', async () => ({ value: (await (o.usage ?? (() => USAGE))()) as never }))
  if (o.surfaces) { const surfaces = o.surfaces; on('session.surfaces', () => ({ value: surfaces() as never })) }
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('session.attach', (_$, e) => ({ clientId: e.clientId }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  let agent = 0
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: `w${++agent}` }))
  const writes: Write[] = []
  on('state.set', (_$, e, next) => { writes.push({ plugin: e.plugin, key: e.key, value: e.value }); return next(e) })
  const mine = (key?: string) => writes.filter(w => w.plugin === 'clawpit' && (key === undefined || w.key === key))
  const last = (key: string) => mine(key).at(-1)?.value
  return { clock, store, storeSets, writes, mine, last }
}

const start = ($: $T, surface: 'desktop' | 'terminal' = 'desktop') => $.session.start({ cwd: '/', surface, isInteractive: true })
const spawn = ($: $T, description: string, parentAgentId?: string, resume?: string) =>
  $.agent.spawn({ tool_use_id: description, prompt: '', description, subagentType: 'implementer', provider: 'claude', parentModel: 'x', background: false, fork: false,
    ...(parentAgentId ? { parentAgentId } : {}), ...(resume ? { resume: { agentId: resume } } : {}) } as never)
const done = ($: $T, agentId: string | undefined, reason = 'answer', durationMs = 120_000) =>
  $.turn.complete({ reason, answer: '', durationMs, isAborted: reason === 'aborted', turnId: agentId ?? 'm', ...(agentId ? { agentId } : {}),
    usage: { model: 'claude-opus-5-5', input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5, cache_creation_input_tokens: 1 } } as never)

test('wiring: a throwing tracker leaves the tool result untouched', async ($, on) => {
  setup(on)
  const beneath = { result: { structuredPatch: 7, type: 'update', gitDiff: null } }
  on('tool.call', () => beneath as never)
  await start($)
  const out = await $.tool.call({ tool: 'Edit', file_path: 7 as never, old_string: '', new_string: '' } as never)
  expect(out.result).toEqual(beneath.result)
  expect(out.deny).toBeUndefined()
})

test('wiring: N tool calls write no atom', async ($, on) => {
  const w = setup(on)
  on('tool.call', () => ({ result: { type: 'text', file: { filePath: '/a.ts', content: '', numLines: 0, startLine: 1, totalLines: 0 } } }) as never)
  await start($)
  await spawn($, 'fix the cache')
  const before = w.mine().length
  for (let i = 0; i < 20; i++) await $.tool.call({ tool: 'Read', file_path: `/src/f${i}.ts`, agentId: 'w1' } as never)
  expect(w.mine().length).toBe(before)
})

test('wiring: turn.start then turn.complete fills the session figures and idleSince', async ($, on) => {
  let usd = 1
  const w = setup(on, { usage: () => ({ ...USAGE, cost: { usd } }) })
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  expect(w.last('idleSince')).toBeNull()
  usd = 1.25
  await w.clock.advance(90_000)
  await done($, undefined)
  expect(w.last('idleSince')).toBe(T0 + 90_000)
  const s = w.last('stats') as { turn: unknown; session: { turns: number; tokens: number; agentMs: number; lastTurnUsd: number; costUsd: number } }
  expect(s.turn).toBeNull()
  expect(s.session).toEqual({ costUsd: 1.25, lastTurnUsd: 0.25, turns: 1, tokens: 126, agentMs: 120_000, turnCosts: [0.25] })
})

// Two hooks in flight at once: a main tool call waits on its usage reading while the turn starts.
test('wiring: a tool call waiting on usage does not undo a turn that starts meanwhile', async ($, on) => {
  let usd = 1, hold = false, release = () => {}, reached = () => {}
  const atUsage = new Promise<void>(r => { reached = r })
  const w = setup(on, { usage: async () => {
    if (hold) { hold = false; reached(); await new Promise<void>(r => { release = r }) }
    return { ...USAGE, cost: { usd } }
  } })
  on('tool.call', () => ({ result: {} }) as never)
  await start($)
  hold = true
  const call = $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  await atUsage
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  release()
  await call
  usd = 1.25
  await done($, undefined)
  expect((w.last('stats') as { session: { lastTurnUsd: number | null } }).session.lastTurnUsd).toBe(0.25)
})

test('wiring: an answered agent turn records its duration once, a second run of the same agent does not', async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'implement the fold')
  await done($, 'w1', 'answer', 300_000)
  await done($, 'w1', 'answer', 60_000)
  const key = 'eta:implementer · claude-opus-5-5 · implement'
  expect(w.store.get(key)).toEqual([300_000])
  expect(w.store.get('eta:implementer · claude-opus-5-5')).toEqual([300_000])
  expect(w.store.get('eta:implementer')).toEqual([300_000])
})

test('wiring: a failed or aborted agent turn records nothing', async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'implement a')
  await spawn($, 'implement b')
  await spawn($, 'implement c', undefined, 'w0')
  await done($, 'w1', 'error')
  await done($, 'w2', 'aborted')
  await done($, 'w3', 'answer')
  expect(w.storeSets.filter(k => k.startsWith('eta:'))).toEqual([])
})

test('wiring: a stored size is restored at session.start; a bad stored size is full', async ($, on) => {
  const w = setup(on, { store: { size: 'line' } })
  await start($)
  expect(w.last('ui')).toEqual({ size: 'line', open: null, shut: ['ended'], paneOpen: false })
  w.store.set('size', 'huge')
  await start($)
  expect((w.last('ui') as { size: string }).size).toBe('full')
})

test('wiring: the stored durations are loaded at session.start and a new one appends to them', async ($, on) => {
  const w = setup(on, { store: { 'eta:implementer': [1, 2], 'eta:junk': 'x', other: [9] } })
  await start($)
  await spawn($, 'implement the fold')
  await done($, 'w1', 'answer', 300_000)
  expect(w.store.get('eta:implementer')).toEqual([1, 2, 300_000])
  expect(w.store.get('other')).toEqual([9])
})

test('wiring: the tick runs at 1 Hz while busy and stops when idle with nothing time-based on screen', async ($, on) => {
  const w = setup(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  const at = w.mine('tick').length
  await w.clock.advance(3_000)
  expect(w.mine('tick').length - at).toBe(3)
  await done($, undefined)
  const idle = w.mine('tick').length
  await w.clock.advance(60_000)
  expect(w.mine('tick').length).toBe(idle)
})

// savvy-progress as clawpit sees it: a run per spawn in its agents atom, ended by the agent's turn.complete.
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
    on('turn.complete', async ($, e, next) => {
      const out = await next(e)
      const list = ((await $.state.get(ref)).value ?? []) as { agentId?: string }[]
      await $.state.set(ref, list.map(r => (r.agentId === e.agentId ? { ...r, status: 'done', endedAt: 1 } : r)) as never)
      return out
    })
  },
}

test('wiring: a running agent keeps the tick at 1 Hz with no main turn', { plugins: [savvy] }, async ($, on) => {
  const w = setup(on)
  await start($)
  await spawn($, 'fix it')
  let at = w.mine('tick').length
  await w.clock.advance(2_000)
  expect(w.mine('tick').length - at).toBe(2)
  await done($, 'w1')
  at = w.mine('tick').length
  await w.clock.advance(5_000)
  expect(w.mine('tick').length).toBe(at)
})

test('wiring: ten minutes after the turn ends one tick fires', async ($, on) => {
  const w = setup(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  await done($, undefined)
  const at = w.mine('tick').length
  await w.clock.advance(599_999)
  expect(w.mine('tick').length).toBe(at)
  await w.clock.advance(1)
  expect(w.mine('tick').length).toBe(at + 1)
  await w.clock.advance(1_200_000)
  expect(w.mine('tick').length).toBe(at + 1)
})

test('wiring: a new turn cancels the ten-minute wake', async ($, on) => {
  const w = setup(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  await done($, undefined)
  await w.clock.advance(300_000)
  await $.turn.start({ text: 'again', turnId: 'm2' } as never)
  await done($, undefined)
  const at = w.mine('tick').length
  await w.clock.advance(300_000)
  expect(w.mine('tick').length).toBe(at)
  await w.clock.advance(300_000)
  expect(w.mine('tick').length).toBe(at + 1)
})

test('wiring: on the terminal surface takeover stays false', async ($, on) => {
  const w = setup(on)
  await start($, 'terminal')
  expect(w.mine('takeover')).toEqual([])
})

test('wiring: on the desktop surface takeover is true', async ($, on) => {
  const w = setup(on)
  await start($)
  expect(w.last('takeover')).toBe(true)
})

test('wiring: the start-up work runs once', async ($, on) => {
  let usage = 0
  const w = setup(on, { usage: () => (usage += 1, USAGE), surfaces: () => ['desktop'] })
  await Promise.all([spawn($, 'fix the cache'), spawn($, 'fix the tests')])
  expect(usage).toBe(1)
  expect(w.last('takeover')).toBe(true)
})

test('wiring: after a reload, the first observer call on a desktop session sets takeover', async ($, on) => {
  const w = setup(on, { surfaces: () => ['desktop'] })
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  expect(w.last('takeover')).toBe(true)
})

test('wiring: a terminal-only session never sets takeover', async ($, on) => {
  const w = setup(on, { surfaces: () => ['terminal'] })
  on('tool.call', () => ({ result: {} }) as never)
  await start($, 'terminal')
  await $.turn.start({ text: 'go', turnId: 'm' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  await done($, undefined)
  expect(w.mine('takeover')).toEqual([])
})

test('wiring: a desktop surface attaching sets takeover', async ($, on) => {
  let roster = ['terminal']
  const w = setup(on, { surfaces: () => roster })
  await start($, 'terminal')
  expect(w.mine('takeover')).toEqual([])
  roster = ['terminal', 'desktop']
  const out = await $.session.attach({ surface: 'desktop', clientId: 'desktop:default' })
  expect(out).toEqual({ clientId: 'desktop:default' })
  expect(w.last('takeover')).toBe(true)
})
