import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, RenderNode, SessionRateLimit, Timer } from 'claude-code'
import type { SavvyRun, Settle, Stats, TestStat, Ui } from '../types'
import { crewOf } from './model'
import { pickLoops } from './loops'
import { moving, nextSize, parseSize, settle } from './panel/fold'
import { panelTree, type PanelView } from './panel/draw'
import type { El } from './draw'
import { benchTree, paneTree, type PaneView } from './pane/draw'
import { emptyFacts, isEdit, linesOf, onThink, onTool } from './track/activity'
import { diff, type Logs } from './track/steplog'
import { parseTests } from './track/tests'
import { STAGES, estimate, keysOf, record, usually, type History } from './track/eta'
import { emptyTurn, IDLE_ARM_MS, isArmed, onComplete, onCost, onLines, onStart } from './track/turn'
import { paceOf } from './track/pace'
import { contextOf, pushTurn, type CtxInput } from './track/context'
import { codeOf } from './track/code'
import { clip, oneLine } from './text'
import { MOTION } from './tokens'

// Wiring only: the atoms, the observers that feed the trackers, the render hooks, the Client presses, and `view`.

const PANE_ID = 'clawpit-agents'
const UI0: Ui = { size: 'full', open: null, shut: ['ended'], paneOpen: false }
const STATS0: Stats = { context: null, limits: [], turn: null, tests: null, session: emptyTurn().session, code: null }

const takeover = atom({ plugin: 'clawpit', key: 'takeover' } as const, false)
const stats = atom({ plugin: 'clawpit', key: 'stats' } as const, STATS0)
const ui = atom({ plugin: 'clawpit', key: 'ui' } as const, UI0)
const tick = atom({ plugin: 'clawpit', key: 'tick' } as const, 0)
const idleSince = atom({ plugin: 'clawpit', key: 'idleSince' } as const, null)
const flow = atom({ plugin: 'savvy-progress', key: 'flow' } as const, null)
const agents = atom({ plugin: 'savvy-progress', key: 'agents' } as const, [])
const stages = atom({ plugin: 'savvy-progress', key: 'stages' } as const, [])

// The stage words savvy publishes (the part before "="); anything but a non-empty list of strings falls back to STAGES.
const stageWords = async ($: EngineInterface): Promise<readonly string[]> => {
  try {
    const v = await read($, stages)
    return Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string') ? v.map(x => x.split('=')[0]) : STAGES
  } catch { errors += 1; return STAGES }
}

// Module memory: facts that change per tool call never touch an atom; the tick repaints them.
let facts = emptyFacts()
let logs: Logs = {}
let seen: SavvyRun[] = []                       // savvy's agents as last written, for the step-log diff
let parents: Record<string, string> = {}
let spawns: Record<string, { type: string; model: string; description: string }> = {}
let history: History = {}
let recorded = new Set<string>()                // agents whose first turn has ended
let turn = emptyTurn()
let tests: TestStat | null = null
let ctx: CtxInput = {}
let ctxHistory: number[] = []
let limits: SessionRateLimit[] = []
let settles: Record<string, Settle> = {}
let planSince: number | null = null            // when the plan bar first showed
let errors = 0
let ticker: Timer | null = null
let period = 0
let wake: Timer | null = null
let booted: Promise<void> | null = null
let paneAsked = false                           // the pane opened by itself this session
let benchOn = false                             // the `bench` setting, read at each load: /clawpit-bench is registered
let benchReg: Promise<unknown> | null = null
let animations = true                           // the `animations` setting, read at each load: off draws nothing that moves
let bench: { count: number; eased: boolean } | null = null

// The engine blanks Clients past 100,000 characters; one bench crab's props are about 1,750.
const BENCH_MAX = 48

const reset = () => {
  facts = emptyFacts(); logs = {}; seen = []; parents = {}; spawns = {}; history = {}; recorded = new Set()
  turn = emptyTurn(); tests = null; ctx = {}; ctxHistory = []; limits = []; settles = {}; planSince = null
  ticker?.cancel(); ticker = null; period = 0; wake?.cancel(); wake = null; paneAsked = false; benchReg = null; bench = null
}

const usdOf = (u: { cost?: { usd: number } }) => u.cost?.usd ?? null
const str = (v: unknown) => (typeof v === 'string' ? v : '')
const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id])

const statsOf = (now: number, code: Stats['code']): Stats =>
  ({ context: contextOf(ctx, ctxHistory), limits: paceOf(limits, now), turn: turn.turn, tests, session: turn.session, code })

const takeUsage = (u: { context: { percent?: number; breakdown?: CtxInput['breakdown'] }; rateLimits: SessionRateLimit[]; cost?: { usd: number } }) => {
  ctx = { percent: u.context.percent, breakdown: u.context.breakdown }
  limits = u.rateLimits
  turn = onCost(turn, usdOf(u))
}

const writeStats = async ($: EngineInterface) => { const v = statsOf(await $.clock.now(), null); await update($, stats, () => v) }

// The tick (design §4): 1 Hz while a main turn or an agent runs; once a minute while tests, a limit or an armed failed run is shown.
// shortcut: "on screen" is read as "present"; the render hooks know the fitted columns, so pass them in if idle minute ticks show up.
const periodOf = (now: number) =>
  turn.turn || seen.some(r => r.status === 'running') ? 1000
    : tests || paceOf(limits, now).length || (isArmed(turn, now) && seen.some(r => r.status === 'failed' && r.heldDone)) ? 60_000 : 0

const writeTick = async ($: EngineInterface) => {
  try { const at = await $.clock.now(); await update($, tick, () => at); await retick($) } catch { errors += 1 }
}

const retick = async ($: EngineInterface) => {
  const p = periodOf(await $.clock.now())
  if (p === period) return
  ticker?.cancel()
  period = p
  ticker = p ? $.clock.every(p, () => void writeTick($)) : null
}

const recordEta = async ($: EngineInterface, id: string, ms: number) => {
  const run = (await read($, agents)).find(r => r.agentId === id || r.id === id) ?? spawns[id]
  if (!run) return
  const keys = keysOf(run.type, run.model, run.description, await stageWords($))
  history = record(history, keys, ms)
  for (const k of keys) await $.store.set(`eta:${k}`, history[k])
}

const loadStore = async ($: EngineInterface) => {
  const size = parseSize(await $.store.get('size'))
  await update($, ui, () => ({ ...UI0, size }))
  for (const k of await $.store.keys()) {
    if (!k.startsWith('eta:')) continue
    const v = await $.store.get(k)
    if (Array.isArray(v)) history[k.slice(4)] = v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n)).slice(-20)
  }
}

// savvy-progress stands its band down on the desktop surface while this is true and keeps drawing on every other surface.
// Its panel auto-open stands down session-wide (known limit): a terminal on the same session gets no auto-open either.
// Every session but a terminal one takes over: a session one session starts runs with no surface until the desktop
// attaches, often after its first agent, and by then savvy would have opened its own pane. Accepted limit (LOCKED.md,
// "Takeover outside the terminal"): a session opened only in VS Code or on mobile gets no savvy auto-open and an empty pane.
// Written only when not yet true, so the repaint it causes schedules nothing more: no render loop.
const takeOver = async ($: EngineInterface) => {
  try { if ((await read($, takeover)) !== true) await update($, takeover, () => true) } catch { errors += 1 }
}

// Once per plugin load: a reload inside a running session fires no session.start, so the first observer runs it there.
const boot = ($: EngineInterface) => (booted ??= (async () => {
  try { const s = await $.session.surfaces(); if (s.includes('desktop') || !s.includes('terminal')) await takeOver($) } catch { errors += 1 }
  try { await loadStore($) } catch { errors += 1 }
  // The engine's record of panes outlives a reload; module memory and the ui atom's paneOpen do not.
  try { if ((await $.ui.panes()).some(p => p.id === PANE_ID)) await update($, ui, u => ({ ...u, paneOpen: true })) } catch { errors += 1 }
  try { seen = await read($, agents) } catch { errors += 1 }
  try { takeUsage(await $.session.usage({ breakdown: 'summary' })); await writeStats($) } catch { errors += 1 }
  try { await retick($) } catch { errors += 1 }
  try { await benchUp($) } catch { errors += 1 }
})())

// Once per load and session, only with the `bench` setting on. The panel's render calls it too: after /reload-plugins
// no session.start runs, and the panel redraws before any observer does.
const benchUp = ($: EngineInterface) => benchOn ? (benchReg ??= $.command.register({
  name: 'clawpit-bench', description: 'Draws n walking crabs in the Agents pane, past the loop budget; 0 restores it.', argumentHint: '<n> [eased]',
}).catch(() => { errors += 1 })) : undefined

// The pure tree is rebuilt with the surface's own elements: the engine refuses a plain Svg's `key` prop, and
// loads a surface module only from a <Client> written here with a literal path.
const liveOf = ($: EngineInterface, e: RenderInput) => {
  const table = $.ui.resolve(e), { Client } = table
  const live = (n: El | string): RenderNode => {
    if (typeof n === 'string') return n
    const p = n.props ?? {}
    if (n.type === 'Client') return <Client key={String(p.key)} module="./client/image.tsx" props={p.props} />
    const tag = (table as unknown as Record<string, (props: never) => RenderNode>)[n.type]
    return h(tag, p, ...(n.children ?? []).map(live)) as RenderNode
  }
  return live
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE_ID, title: 'Agents' })

// Jump in: an agent that waits on you is named in the prompt, at the cursor, once. The engine gives a plugin no way
// to focus the prompt box ($.ui.focus reaches only the plugin's own sites), so the person clicks into it.
const jumpIn = async ($: EngineInterface, id: string) => {
  const r = (await read($, agents)).find(x => x.id === id)
  if (!r?.blocked || r.status !== 'running') return
  const mention = `@${clip(oneLine(r.description), 60)}`
  if (!(await $.prompt.read()).text.includes(mention)) await $.prompt.fill({ text: `${mention} `, mode: 'insert' })
}

// Plain Box and Text data, so it cannot fail the way the drawing did.
const failedLine = (kind: string): RenderElement => ({
  type: 'Box', props: { key: 'clawpit-failed', flexDirection: 'column' },
  children: [{ type: 'Text', props: {}, children: [`clawpit could not draw this panel: ${kind}`] }],
})

export const register: Register = (on, options) => {
  benchOn = options.bench === true
  animations = options.animations !== false
  on('session.start', async ($, e, next) => {
    const out = await next(e)
    reset()
    booted = null
    if (e.surface !== 'terminal') await takeOver($)
    await boot($)
    return out
  })

  on('session.attach', { surface: 'desktop' }, async ($, e, next) => {
    const out = await next(e)
    await takeOver($)
    return out
  })

  // Booted before `next(e)`: savvy's progress tool and spawn auto-open read takeover beneath it.
  on('tool.call', async ($, e, next) => {
    await boot($)
    const out = await next(e)
    try {
      const at = await $.clock.now()
      const isError = out.deny !== undefined || out.isError === true
      facts = onTool(facts, { tool: e.tool, agentId: e.agentId, input: e as Record<string, unknown>, result: out.result, isError, at })
      if (!isError) turn = onLines(turn, linesOf(e.tool, out.result))
      const r = (out.result ?? {}) as { stdout?: unknown; stderr?: unknown }
      const t = e.tool === 'Bash' ? parseTests(str((e as { command?: unknown }).command), str(r.stdout), str(r.stderr), at) : null
      const before = tests
      if (t) tests = t
      else if (isEdit(e.tool) && !isError) tests = null
      if (tests !== before) await retick($)
      // Awaited into a local first: `turn` is read only after the await, so a hook that ran meanwhile is not undone.
      if (e.agentId === undefined) { const usd = usdOf(await $.session.usage()); turn = onCost(turn, usd) }
    } catch { errors += 1 }
    return out
  })

  on('agent.spawn', async ($, e, next) => {
    await boot($)
    const out = await next(e)
    try {
      if (out.deny === undefined) {
        const id = out.agentId ?? e.tool_use_id
        if (e.parentAgentId) parents = { ...parents, [id]: e.parentAgentId }
        spawns[id] = { type: e.subagentType, model: out.model, description: e.description }
        if (e.resume) recorded.add(id)
        // Once per session, on its first agent, in every session but a terminal one (takeover); after that only the open press.
        // The store keeps the session it opened for, so a reload mid-session does not open it again.
        if (!paneAsked && (await read($, takeover)) === true) {
          paneAsked = true
          const sid = await $.session.id()
          if ((await $.store.get('paneAutoOpenedFor')) !== sid) { await openPane($); await $.store.set('paneAutoOpenedFor', sid) }
        }
      }
    } catch { errors += 1 }
    return out
  })

  on('turn.start', async ($, e, next) => {
    const out = await next(e)
    try {
      await boot($)
      if (e.agentId === undefined) {
        let usd = turn.session.costUsd
        try { usd = usdOf(await $.session.usage()) } catch { errors += 1 }
        const at = await $.clock.now()
        turn = onStart(turn, at, usd)
        wake?.cancel(); wake = null
        await update($, idleSince, () => null)
        await writeStats($)
        await retick($)
      }
    } catch { errors += 1 }
    return out
  })

  // `think` is the model's turn before any tool of the step runs, so it is set as the step starts.
  on('turn.step', async function* ($, e, next) {
    try { await boot($); const at = await $.clock.now(); facts = onThink(facts, e.agentId, at) } catch { errors += 1 }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      await boot($)
      const at = await $.clock.now()
      const u = e.usage
      const tokens = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
      if (e.agentId === undefined) {
        let usd = turn.session.costUsd
        try { usd = usdOf(await $.session.usage()) } catch { errors += 1 }
        if (ctx.breakdown) ctxHistory = pushTurn(ctxHistory, ctx.breakdown.totalTokens)
        turn = onComplete(turn, { isMain: true, durationMs: e.durationMs, tokens }, at, usd)
        wake?.cancel()
        wake = $.clock.after(IDLE_ARM_MS, () => void writeTick($))
        await update($, idleSince, () => at)
        await writeStats($)
        await retick($)
      } else {
        turn = onComplete(turn, { isMain: false, durationMs: e.durationMs, tokens }, at, null)
        // Only an agent's first run counts: a resumed, failed or aborted one records nothing.
        if (!recorded.has(e.agentId)) { recorded.add(e.agentId); if (e.reason === 'answer') await recordEta($, e.agentId, e.durationMs) }
      }
    } catch { errors += 1 }
    return out
  })

  on('session.measure', async ($, e, next) => {
    const out = await next(e)
    try { await boot($); takeUsage(await $.session.usage({ breakdown: 'summary' })); await writeStats($); await retick($) } catch { errors += 1 }
    return out
  })

  // The engine hands every write of savvy's agents atom to this observer, in order, so no step is lost to a coalesced render.
  on('state.set', { plugin: 'savvy-progress', key: 'agents' }, async ($, e, next) => {
    const out = await next(e)
    try {
      await boot($)
      if (out.value?.isSet && Array.isArray(e.value)) {
        const at = await $.clock.now()
        logs = diff(logs, seen, e.value, parents, at)
        seen = e.value
        await retick($)
      }
    } catch { errors += 1 }
    return out
  })

  // clawpit draws its own row only, never what `next(e)` returns; on desktop savvy's band stands down (takeover).
  // shortcut: vscode and mobile pass through like the terminal, and savvy draws its band there; draw clawpit there too if asked.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    void benchUp($)
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    return liveOf($, e)(panelTree((await view($, e.props.bodyColumns)).panel))
  }).catch((_$, _e, next) => { errors += 1; return failedLine(next.error.kind) })

  // shortcut: vscode and mobile pass through like the terminal, as the panel does.
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    if (bench) return liveOf($, e)(benchTree(bench.count, bench.eased))
    return liveOf($, e)(paneTree((await view($, e.props.bodyColumns)).pane))
  }).catch((_$, _e, next) => { errors += 1; return failedLine(next.error.kind) })

  // `/clawpit-bench <n> [eased]`: the pane draws n looping crabs until `/clawpit-bench 0`. Unregistered, it passes through.
  on('command.run', { command: 'clawpit-bench' }, async ($, e, next) => {
    if (!benchOn) return next(e)
    const [arg, mode] = e.args.trim().split(/\s+/), count = Number(arg)
    if (!/^\d+$/.test(arg) || count > BENCH_MAX || (mode !== undefined && mode !== 'eased'))
      return { text: `Usage: /clawpit-bench <n> [eased], n from 0 to ${BENCH_MAX}.` }
    bench = count ? { count, eased: mode === 'eased' } : null
    if (bench) await openPane($)
    $.ui.invalidate('ui.render')
    return { text: bench ? `Bench: ${count} ${bench.eased ? 'eased' : 'stepped'} crabs in the Agents pane.` : 'Bench off: the Agents pane is back.' }
  })

  // paneOpen follows the pane itself. clawpit never closes it: the desktop leaves an emptied tile as a tab no one can close.
  on('ui.open', { id: PANE_ID }, async ($, e, next) => {
    const out = await next(e)
    try { if (out.value) await update($, ui, u => ({ ...u, paneOpen: true })) } catch { errors += 1 }
    return out
  })

  on('ui.close', { id: PANE_ID }, async ($, e, next) => {
    const out = await next(e)
    try { await update($, ui, u => ({ ...u, paneOpen: false })) } catch { errors += 1 }
    return out
  })

  on('ui.message', async ($, e) => {
    try {
      const press = (e.data as { press?: unknown } | null)?.press
      if (typeof press !== 'string') return {}
      if (press === 'size') await $.store.set('size', (await update($, ui, u => ({ ...u, size: nextSize(u.size) }))).size)
      else if (press === 'open') await openPane($)
      else if (press.startsWith('open:') && press.length > 5) { const id = press.slice(5); await update($, ui, u => ({ ...u, open: id, view: 'crew' })); await openPane($) }
      // Queued until the session is idle, so not awaited: the press answers at once, one command per press.
      else if (press === 'usage' || press === 'context' || press === 'compact') void $.command.run({ command: press }).catch(() => { errors += 1 })
      else if (press === 'ended') await update($, ui, u => ({ ...u, shut: toggle(u.shut, 'ended') }))
      else if (press.startsWith('row:') && press.length > 4) { const id = press.slice(4); await update($, ui, u => ({ ...u, open: u.open === id ? null : id })); await jumpIn($, id) }
      else if (press.startsWith('ask:') && press.length > 4) await jumpIn($, press.slice(4))
      else if (press === 'costs') { await update($, ui, u => ({ ...u, view: 'costs' })); await openPane($) }
      else if (press === 'crew') await update($, ui, u => ({ ...u, view: 'crew' }))
      else if (press.startsWith('kids:') && press.length > 5) { const id = press.slice(5); await update($, ui, u => ({ ...u, shut: toggle(u.shut, id) })) }
    } catch { errors += 1 }
    return {}
  })
}

// Both surfaces from one read of the atoms and module memory, and one crew.
export const view = async ($: EngineInterface, bodyColumns: number): Promise<{ panel: PanelView; pane: PaneView }> => {
  const u = await read($, ui), f = await read($, flow), runs = await read($, agents)
  await read($, tick); await read($, stats)   // read only to subscribe the drawing to the repaints
  let code: Stats['code'] = null
  try { code = codeOf(await read($, { plugin: 'ponytail', key: 'band' } as const)) } catch { errors += 1 }
  const now = await $.clock.now()
  const words = await stageWords($)
  const keys = (r: SavvyRun) => keysOf(r.type, r.model, r.description, words)
  const crew = crewOf({ flow: f, runs: Array.isArray(runs) ? runs : [], parents, activity: facts.activity, logs, now,
    etaOf: (r, ms) => estimate(history, keys(r), ms), usuallyOf: r => usually(history, keys(r)) })
  const s = statsOf(now, code), busy = turn.turn !== null, armed = isArmed(turn, now)
  if (s.context) settles.context = settle(settles.context, s.context.pct, now)
  for (const l of s.limits) { const k = l.kind === 'five_hour' ? '5h' : '7d'; settles[k] = settle(settles[k], l.pct, now) }
  planSince = crew.plan ? planSince ?? now : null
  const loops = pickLoops(crew, u, busy, armed, animations)
  return {
    panel: { stats: s, crew, ui: u, loops, busy, armed, bodyColumns, now, settles: animations ? moving(settles, now) : {}, still: !animations,
      planGrow: animations && planSince !== null && now - planSince < MOTION.fillMs },
    pane: { crew, ui: u, loops, columns: bodyColumns, now, session: s.session, still: !animations },
  }
}
