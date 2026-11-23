import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderInput, RenderNode, SessionRateLimit, Timer } from 'claude-code'
import type { Settle, Stats, TestStat, Ui } from '../types'
import { EMPTY_CREW, STILL } from './model'
import { moving, nextSize, parseSize, settle } from './panel/fold'
import { panelTree, type PanelView } from './panel/draw'
import type { El } from './draw'
import { isEdit, linesOf } from './track/activity'
import { parseTests } from './track/tests'
import { emptyTurn, onComplete, onCost, onLines, onStart } from './track/turn'
import { paceOf } from './track/pace'
import { contextOf, pushTurn, type CtxInput } from './track/context'
import { codeOf } from './track/code'

// clawpit's panel above the prompt, drawn alone: the gauges, no crew and no Agents pane. The drawing and the trackers
// are byte copies of clawpit's (scripts/sync-gauges.sh). This wiring is a hand-cut copy of clawpit's usage wiring in
// plugin/hooks/register.tsx, which nothing holds in sync: a fix there says in its PR whether this needs the same.

const PLUGIN = 'clawpit-gauges'
const UI0: Ui = { size: 'full', open: null, shut: [], paneOpen: false }
const STATS0: Stats = { context: null, limits: [], turn: null, tests: null, session: emptyTurn().session, code: null }

const stats = atom({ plugin: 'clawpit-gauges', key: 'stats' } as const, STATS0)
const ui = atom({ plugin: 'clawpit-gauges', key: 'ui' } as const, UI0)
const tick = atom({ plugin: 'clawpit-gauges', key: 'tick' } as const, 0)

// Module memory: what changes per tool call never touches an atom; the tick repaints it.
let turn = emptyTurn()
let tests: TestStat | null = null
let ctx: CtxInput = {}
let ctxHistory: number[] = []
let limits: SessionRateLimit[] = []
let settles: Record<string, Settle> = {}
let ticker: Timer | null = null
let period = 0
let booted: Promise<void> | null = null
let animations = true                           // the `animations` setting, read at each load: off draws nothing that moves
let errors = 0

const reset = () => {
  turn = emptyTurn(); tests = null; ctx = {}; ctxHistory = []; limits = []; settles = {}
  ticker?.cancel(); ticker = null; period = 0
}

const usdOf = (u: { cost?: { usd: number } }) => u.cost?.usd ?? null
const str = (v: unknown) => (typeof v === 'string' ? v : '')

const statsOf = (now: number, code: Stats['code']): Stats =>
  ({ context: contextOf(ctx, ctxHistory), limits: paceOf(limits, now), turn: turn.turn, tests, session: turn.session, code })

const takeUsage = (u: { context: { percent?: number; breakdown?: CtxInput['breakdown'] }; rateLimits: SessionRateLimit[]; cost?: { usd: number } }) => {
  ctx = { percent: u.context.percent, breakdown: u.context.breakdown }
  limits = u.rateLimits
  turn = onCost(turn, usdOf(u))
}

const writeStats = async ($: EngineInterface) => { const v = statsOf(await $.clock.now(), null); await update($, stats, () => v) }

// 1 Hz while a main turn runs; once a minute while a tests reading or a limit is shown (their ages, paces and reset
// times move); otherwise none, so nothing runs while idle.
const periodOf = (now: number) => (turn.turn ? 1000 : tests || paceOf(limits, now).length ? 60_000 : 0)

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

// Once per plugin load: a reload inside a running session fires no session.start, so the first observer runs it there.
const boot = ($: EngineInterface) => (booted ??= (async () => {
  try { const size = parseSize(await $.store.get('size')); await update($, ui, () => ({ ...UI0, size })) } catch { errors += 1 }
  try { takeUsage(await $.session.usage({ breakdown: 'summary' })); await writeStats($) } catch { errors += 1 }
  try { await retick($) } catch { errors += 1 }
})())

// The pure tree is rebuilt with the surface's own elements; a surface module loads only from a <Client> written here.
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

const failedLine = (kind: string): RenderElement => ({
  type: 'Box', props: { key: 'clawpit-failed', flexDirection: 'column' },
  children: [{ type: 'Text', props: {}, children: [`clawpit-gauges could not draw this panel: ${kind}`] }],
})

export const register: Register = (on, options) => {
  animations = options.animations !== false
  on('session.start', async ($, e, next) => {
    const out = await next(e)
    reset()
    booted = null
    await boot($)
    return out
  })

  on('tool.call', async ($, e, next) => {
    const out = await next(e)
    try {
      await boot($)
      const isError = out.deny !== undefined || out.isError === true
      if (!isError) turn = onLines(turn, linesOf(e.tool, out.result))
      const r = (out.result ?? {}) as { stdout?: unknown; stderr?: unknown }
      const t = e.tool === 'Bash' ? parseTests(str((e as { command?: unknown }).command), str(r.stdout), str(r.stderr), await $.clock.now()) : null
      const before = tests
      if (t) tests = t
      else if (isEdit(e.tool) && !isError) tests = null
      if (tests !== before) await retick($)
      // Awaited into a local first: `turn` is read only after the await, so a hook that ran meanwhile is not undone.
      if (e.agentId === undefined) { const usd = usdOf(await $.session.usage()); turn = onCost(turn, usd) }
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
        turn = onStart(turn, await $.clock.now(), usd)
        await writeStats($)
        await retick($)
      }
    } catch { errors += 1 }
    return out
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    try {
      await boot($)
      const at = await $.clock.now(), u = e.usage
      const tokens = u ? u.input_tokens + u.output_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens : 0
      if (e.agentId === undefined) {
        let usd = turn.session.costUsd
        try { usd = usdOf(await $.session.usage()) } catch { errors += 1 }
        if (ctx.breakdown) ctxHistory = pushTurn(ctxHistory, ctx.breakdown.totalTokens)
        turn = onComplete(turn, { isMain: true, durationMs: e.durationMs, tokens }, at, usd)
        await writeStats($)
        await retick($)
      } else turn = onComplete(turn, { isMain: false, durationMs: e.durationMs, tokens }, at, null)
    } catch { errors += 1 }
    return out
  })

  on('session.measure', async ($, e, next) => {
    const out = await next(e)
    try { await boot($); takeUsage(await $.session.usage({ breakdown: 'summary' })); await writeStats($); await retick($) } catch { errors += 1 }
    return out
  })

  // Desktop only, as clawpit's panel; a survey holds the band.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) return next(e)
    return liveOf($, e)(panelTree(await view($, e.props.bodyColumns)))
  }).catch((_$, _e, next) => { errors += 1; return failedLine(next.error.kind) })

  // With clawpit installed its own panel holds the gauges: this row steps out of the band whenever a clawpit row is in it.
  on('ui.render', { component: 'AbovePromptList' }, ($, e, next) =>
    e.props.rows.some(r => r.plugin === 'clawpit')
      ? next({ ...e, props: { ...e.props, rows: e.props.rows.filter(r => r.plugin !== PLUGIN) } })
      : next(e))

  on('ui.message', async ($, e) => {
    try {
      const press = (e.data as { press?: unknown } | null)?.press
      if (press === 'size') await $.store.set('size', (await update($, ui, u => ({ ...u, size: nextSize(u.size) }))).size)
      // Queued until the session is idle, so not awaited: the press answers at once, one command per press.
      else if (press === 'usage' || press === 'context' || press === 'compact') void $.command.run({ command: press }).catch(() => { errors += 1 })
    } catch { errors += 1 }
    return {}
  })
}

export const view = async ($: EngineInterface, bodyColumns: number): Promise<PanelView> => {
  const u = await read($, ui)
  await read($, tick); await read($, stats)   // read only to subscribe the drawing to the repaints
  let code: Stats['code'] = null
  try { code = codeOf(await read($, { plugin: 'ponytail', key: 'band' } as const)) } catch { errors += 1 }
  const now = await $.clock.now(), s = statsOf(now, code)
  if (s.context) settles.context = settle(settles.context, s.context.pct, now)
  for (const l of s.limits) { const k = l.kind === 'five_hour' ? '5h' : '7d'; settles[k] = settle(settles[k], l.pct, now) }
  return { stats: s, crew: EMPTY_CREW, ui: u, loops: STILL, busy: turn.turn !== null, armed: false, bodyColumns, now,
    settles: animations ? moving(settles, now) : {}, still: !animations, alone: true }
}
