// The panel above the prompt as plain RenderElement data (design §7.3). Pure: no host imports.
import type { ColumnKey, Crew, CrewAgent, ImageProps, LimitStat, LoopPlan, Plan, Settle, Stats, Ui } from '../../types'
import { crab } from '../crab'
import { dial, icon, segBar, toggleIcon } from '../icons'
import { CELL_PX, FONT, MOTION, SIZE, SURFACE, svg } from '../tokens'
import { clip, fit as fitText, fmtAge, fmtClock, fmtCost, fmtDuration, fmtLeft, fmtTokens, oneLine, textWidth, xml } from '../text'
import { alertsOf, helpersOf } from '../model'
import { contextText } from '../track/context'
import { paceText } from '../track/pace'
import { candidates, fit, lineParts, maxColumns } from './columns'
import { hasDot } from './fold'
import { image, type El } from '../draw'

export { image, type El }

export type PanelView = { stats: Stats; crew: Crew; ui: Ui; loops: LoopPlan; busy: boolean; armed: boolean; bodyColumns: number; now: number; settles: Record<string, Settle> }
export const COMPACT_KEY = 'clawpit-compact'

// ---------- text ----------
// shortcut: the kit's width table runs up to ~10% short of SF Pro, so drawn widths add 10%; drop SLACK once the table is measured.
const SLACK = 1.1
const widthOf = (s: string, size: number, w?: Weight) => textWidth(s, size, w) * SLACK
const fitTo = (s: string, max: number, size: number, w?: Weight) => fitText(s, max / SLACK, size, w)
type Weight = 400 | 600 | 700
// [text, paint, weight]: a paint is a token class, or a fixed '#rrggbb' fill.
type Run = [string, string, Weight?]
const paint = (p: string) => (p.startsWith('#') ? `fill="${p}"` : `class="${p}"`)
const weight = (w?: Weight) => (w && w !== 400 ? ` font-weight="${w}"` : '')
// Outside text is cleaned and clipped here, then fitted to its width and escaped.
const clean = (s: unknown, max: number) => clip(oneLine(s), max)
const text = (x: number, y: number, s: string, size: number, p: string, o: { w?: Weight; max?: number; end?: boolean } = {}) =>
  `<text ${paint(p)} x="${x}" y="${y}" font-size="${size}"${weight(o.w)}${o.end ? ' text-anchor="end"' : ''}>${xml(o.max === undefined ? s : fitTo(s, o.max, size, o.w))}</text>`
// Runs on one baseline; the last run is fitted to whatever width is left.
const runs = (x: number, y: number, size: number, parts: Run[], max: number, end = false) => {
  let left = max
  const spans = parts.map(([s, p, w], i) => {
    const t = i === parts.length - 1 ? fitTo(s, Math.max(0, left), size, w) : s
    left -= widthOf(t, size, w)
    return `<tspan ${paint(p)}${weight(w)}>${xml(t)}</tspan>`
  })
  return `<text x="${x}" y="${y}" font-size="${size}"${end ? ' text-anchor="end"' : ''}>${spans.join('')}</text>`
}
const runsWidth = (parts: Run[], size: number) => parts.reduce((w, [s, , wt]) => w + widthOf(s, size, wt), 0)
// A dial's needle settle is an inline animation, so any animated body gets the reduced-motion rule.
const doc = (w: number, h: number, body: string, animated = false) =>
  svg(w, h, `<g font-family="${FONT}" style="font-variant-numeric:tabular-nums">${body}</g>`, animated || body.includes('animation:'))
const at = (x: number, y: number, body: string) => `<g transform="translate(${x} ${y})">${body}</g>`

// ---------- the columns ----------
const COL_H = 58, LINE_H = 28
type Cell = { label: string; value: string; valueTone: string; small?: string; so: Run[]; art?: { body: string; w: number; client: boolean } }

const limitOf = (stats: Stats, key: '5h' | '7d') => stats.limits.find(l => l.kind === (key === '5h' ? 'five_hour' : 'seven_day'))
const limitTone = (l: LimitStat) => (l.ahead || l.pct >= 80 ? 'warn' : 'accent')
const contextTone = (stats: Stats) => { const c = stats.context; return !c ? 'accent' : c.alarm ? 'er' : c.pct >= 70 ? 'warn' : 'accent' }
const pctOf = (n: number) => `${Math.round(n)}%`
const contextDial = (v: PanelView, small = false) => {
  const c = v.stats.context
  return dial(c?.pct ?? 0, contextTone(v.stats), { small, settle: v.settles.context, base: c && c.msgsPct !== null ? Math.max(0, c.pct - c.msgsPct) : 0 })
}
const limitDial = (v: PanelView, key: '5h' | '7d', l: LimitStat, small = false) =>
  dial(l.pct, limitTone(l), { small, settle: v.settles[key], ghost: l.pacePct ?? undefined })
const planSegs = (plan: Plan) => plan.tasks.map(({ state, role, fill }) => ({ state, role, fill }))
// Finished figures are exact, as in the mockup ('$267', 'last turn $2.46'); only the running turn's cost is '≈'.
const usd = (n: number | null) => (n === null ? '—' : fmtCost(n).replace('≈', ''))

const cellOf = (key: ColumnKey, v: PanelView): Cell | null => {
  const { stats, crew, now } = v, s = stats.session
  switch (key) {
    case 'context': {
      const c = stats.context
      return { label: 'context', value: c ? pctOf(c.pct) : '—', valueTone: c?.alarm ? 'er' : 'fg', so: [[contextText(c, s.turns), c?.alarm ? 'er' : 'muted']], art: { body: contextDial(v), w: 34, client: true } }
    }
    case 'turn': {
      const t = stats.turn
      if (!t) return { label: 'this turn', value: '—', valueTone: 'fg', so: [['no reading yet', 'muted']] }
      return { label: 'this turn', value: fmtClock(now - t.startedAt), valueTone: 'fg',
        so: [[`+${t.added}`, 'okText'], [` −${t.removed}${t.costUsd === null ? '' : ` · ${fmtCost(t.costUsd)}`}`, 'muted']] }
    }
    case '5h': case '7d': {
      const l = limitOf(stats, key)
      if (!l) return null
      const tone = limitTone(l)
      return { label: `${key} limit`, value: pctOf(l.pct), valueTone: tone === 'warn' ? 'warn' : 'fg', so: [[paceText(l), l.ahead ? 'warn' : 'muted']], art: { body: limitDial(v, key, l), w: 34, client: true } }
    }
    case 'plan': {
      const p = crew.plan
      if (!p) return null
      return { label: `plan · ${p.phase}`, value: `${p.done}/${p.total}`, valueTone: 'fg',
        so: [[`${clean(p.title, 60)}${crew.leftMin === null ? '' : ` · ${fmtLeft(crew.leftMin)}`}`, 'muted']],
        art: { body: at(0, 8, segBar(planSegs(p), 58, 'compact')), w: 58, client: false } }
    }
    case 'session':
      return { label: 'session', value: usd(s.costUsd), valueTone: 'fg',
        so: [[s.costUsd === null ? 'no reading yet' : !s.turns ? 'no turns yet' : s.lastTurnUsd === null ? '' : `last turn ${usd(s.lastTurnUsd)}`, 'muted']] }
    case 'tests': {
      const t = stats.tests
      if (!t) return null
      const bad = t.failed > 0
      return { label: 'tests', value: String(bad ? t.failed : t.passed), valueTone: bad ? 'er' : 'okText', small: bad ? 'failed' : 'passed', so: [[`${now - t.at < 60_000 ? '<1m' : fmtAge(now - t.at)} ago`, 'muted']] }
    }
    case 'tokens': return { label: 'tokens', value: fmtTokens(s.tokens), valueTone: 'fg', so: [[`${s.turns} turns`, 'muted']] }
    case 'agent': return { label: 'agent time', value: fmtDuration(s.agentMs), valueTone: 'fg', so: [[s.turns ? `avg ${fmtDuration(s.agentMs / s.turns)} per turn` : '', 'muted']] }
    case 'reuse': {
      const c = stats.code
      if (!c || c.reusePct === null) return null
      return { label: 'reuse', value: pctOf(c.reusePct), valueTone: 'fg', so: [[`${c.reused} used · ${c.created} new`, 'muted']] }
    }
    case 'callers': {
      const c = stats.code
      if (!c || !c.callers.length) return null
      return { label: 'callers', value: `${c.callers.length} open`, valueTone: 'warn', so: [[c.callers.slice(0, 2).map(r => clean(r, 120)).join(', '), 'muted']] }
    }
    default: return null
  }
}
const altOf = (c: Cell) => `${c.label}: ${c.value}${c.small ? ` ${c.small}` : ''}${c.so.map(r => r[0]).join('') ? `, ${c.so.map(r => r[0]).join('')}` : ''}`

const columnImage = (key: ColumnKey, c: Cell, w: number, first: boolean): El => {
  const x0 = first ? 0 : 12, max = w - x0 - 4
  const vx = x0 + (c.art ? c.art.w + 6 : 0)
  const body = (first ? '' : `<rect class="track" x="0" y="0" width="1" height="${COL_H}"/>`)
    + text(x0, 11, c.label, 11, 'muted', { max })
    + (c.art ? at(x0, 18, c.art.body) : '')
    + text(vx, 35, c.value, 16, c.valueTone, { w: 600 })
    + (c.small ? text(vx + widthOf(c.value, 16, 600) + 4, 35, c.small, 12, 'muted') : '')
    + runs(x0, 54, 11, c.so, max)
  return image(`col-${key}`, { source: doc(w, COL_H, body), alt: altOf(c), width: w, height: COL_H }, !!c.art?.client)
}

// ---------- the agents crab: who it dresses as, and what it says ----------
type Face = { a: CrewAgent; say: string; tone: string; w: Weight; alert: boolean }
// The top-level agents, then their helpers: a helper that waits on you or failed still dresses the crab.
const withHelpers = (as: CrewAgent[]) => [...as, ...as.flatMap(helpersOf)]
const nextUp = (agents: CrewAgent[]) => {
  const left = agents.filter(a => a.state === 'running' && a.eta.kind === 'left')
  return left.sort((x, y) => (x.eta.kind === 'left' && y.eta.kind === 'left' ? x.eta.minutes - y.eta.minutes : 0))[0]
    ?? agents.find(a => a.state === 'running') ?? agents[0]
}
const faceOf = (crew: Crew): Face => {
  const as = crew.agents, all = withHelpers(as), title = (a: CrewAgent) => clean(a.title, 60)
  const need = all.find(a => a.state === 'need'), failed = all.find(a => a.state === 'failed'), hard = as.find(a => a.struggling)
  if (need) return { a: need, say: `${title(need)} needs you`, tone: 'er', w: 600, alert: true }
  if (failed) return { a: failed, say: `${title(failed)} failed`, tone: 'er', w: 600, alert: true }
  if (hard) return { a: hard, say: `${title(hard)} · ${hard.tries} failed tries`, tone: 'warn', w: 400, alert: false }
  const n = nextUp(as)
  return { a: n, say: `next: ${title(n)}${n.eta.kind === 'left' ? ` · ${fmtLeft(n.eta.minutes)}` : ''}`, tone: 'fg', w: 400, alert: false }
}
// The crab with its count badge at the bottom corner (N1), from two agents up: one needs no number. Returns the drawing and its box.
const BADGE_TEXT = `.bt{fill:${SURFACE.light}}@media (prefers-color-scheme: dark){.bt{fill:${SURFACE.dark}}}`
const mascotArt = (crew: Crew, loops: LoopPlan, size: 'S' | 'M') => {
  const f = faceOf(crew), move = loops.mascot === 'hop' || loops.mascot === 'sway' ? loops.mascot : undefined, pad = move ? 3 : 0
  const [cw, ch] = SIZE.crab[size], n = String(crew.agents.length), bw = Math.max(15, widthOf(n, 10, 700) + 6)
  const bx = cw + 7 - bw, by = ch + 3 - 15
  const badge = crew.agents.length < 2 ? '' : `<rect x="${bx}" y="${by}" width="${bw}" height="15" rx="7.5" class="${f.alert ? 'red' : 'fg'}"/>`
    + `<text ${f.alert ? 'fill="#fff"' : 'class="bt"'} x="${bx + bw / 2}" y="${by + 11}" font-size="10" font-weight="700" text-anchor="middle">${n}</text>`
    + (f.alert ? '' : `<style>${BADGE_TEXT}</style>`)
  const body = at(-pad, -pad, crab({ role: f.a.role, prop: f.a.prop, walk: loops.mascot === 'walk', size, move })) + badge
  return { f, body, w: cw + 7, h: ch + 3, animated: loops.mascot !== 'still' }
}

const agentsColumn = (v: PanelView, w: number): El => {
  const m = mascotArt(v.crew, v.loops, 'M'), x0 = 12, max = w - x0 - 4, n = v.crew.agents.length, vx = x0 + m.w + 6
  const body = `<rect class="track" x="0" y="0" width="1" height="${COL_H}"/>` + text(x0, 11, 'agents', 11, 'muted', { max })
    + at(x0, 15, m.body) + text(vx, 35, String(n), 16, 'fg', { w: 600 }) + text(vx + widthOf(String(n), 16, 600) + 4, 35, 'agents', 12, 'muted')
    + text(x0, 54, m.f.say, 11, m.f.tone, { w: m.f.w, max })
  return image('mascot', { source: doc(w, COL_H, body, m.animated), alt: `Agents: show them all. ${n} agents, ${m.f.say}`, width: w, height: COL_H, press: 'open' }, true)
}

// ---------- the toggle and Compact now ----------
const SIZE_ALT = { full: 'Panel: everything. Fold the agents', gauges: 'Panel: agents folded. Show one line', line: 'Panel: one line. Show everything' } as const
const toggle = (v: PanelView): El => {
  const dot = hasDot(v.ui.size, v.crew)
  return image('toggle', { source: svg(24, 24, at(5, 5, toggleIcon(v.ui.size, dot))), alt: `${SIZE_ALT[v.ui.size]}${dot ? (alertsOf(v.crew).need ? '. An agent needs you' : '. An agent failed') : ''}`, width: 24, height: 24, press: 'size' }, true)
}
const spacer: El = { type: 'Box', props: { flexGrow: 1 } }

// ---------- the plan row ----------
const PHASES = ['plan', 'delegate', 'review', 'close'] as const
const planLine = (plan: Plan, crew: Crew, W: number): El => {
  const left = crew.leftMin === null ? '' : ` · ${fmtLeft(crew.leftMin)}`
  const right: Run[] = [[`${plan.done}/${plan.total}`, 'fg', 600], [` tasks${left}`, 'muted']], rw = runsWidth(right, 12)
  const now = Math.max(0, PHASES.indexOf(plan.phase))
  const stepper = (labels: boolean) => {
    let x = 0, out = ''
    PHASES.forEach((p, i) => {
      if (i) { out += `<rect class="track" x="${x + 6}" y="10.5" width="10" height="1"/>`; x += 22 }
      const tone = i < now ? 'ok' : i === now ? 'accent' : 'track'
      out += (i === now ? `<circle cx="${x + 3}" cy="11" r="4.5" class="accent" opacity=".25"/>` : '') + `<circle cx="${x + 3}" cy="11" r="3" class="${tone}"/>`
      x += 12
      if (labels || i === now) { out += text(x, 15, p, 12, i === now ? 'fg' : 'muted', { w: i === now ? 600 : 400 }); x += widthOf(p, 12, i === now ? 600 : 400) }
    })
    return { out, w: x }
  }
  const full = stepper(true), st = W - rw - full.w - 24 >= 60 ? full : stepper(false)
  const room = W - rw - st.w - 24, title = clean(plan.title, 60)
  const tw = room >= 20 ? Math.min(room, widthOf(title, 12, 600)) : 0
  const body = (tw ? text(0, 15, title, 12, 'fg', { w: 600, max: tw }) : '') + at(tw ? tw + 12 : 0, 0, st.out) + runs(W, 15, 12, right, rw + 1, true)
  return image('plan-line', { source: doc(W, 22, body), alt: `${title}, phase ${plan.phase}, ${plan.done} of ${plan.total} tasks${left}`, width: W, height: 22 }, false)
}

const NAME_MIN_PX = 56, NAME_MAX_TASKS = 8, PARTS_PAST = 40
const planBar = (plan: Plan, W: number): El => {
  const n = plan.tasks.length, count = (s: string) => plan.tasks.filter(t => t.state === s).length
  const alt = `tasks: ${count('done')} done, ${count('failed') ? `${count('failed')} failed, ` : ''}${count('live') + count('need')} in progress, ${count('todo')} not started`
  if (n > PARTS_PAST) {
    const live = n - count('done') - count('todo'), ws = [count('done'), live, count('todo')].map(k => (W * k) / n)
    const body = ['ok', 'accent', 'track'].map((c, i) => `<rect x="${+ws.slice(0, i).reduce((a, b) => a + b, 0).toFixed(2)}" y="0" width="${+ws[i].toFixed(2)}" height="8" rx="3" class="${c}"/>`).join('')
    return image('plan-bar', { source: doc(W, 8, body), alt, width: W, height: 8 }, true)
  }
  const gap = Math.min(2, W / (n || 1) / 2), sw = (W - gap * (n - 1)) / (n || 1), names = n <= NAME_MAX_TASKS && sw >= NAME_MIN_PX
  const label = plan.tasks.map((t, i) => {
    const x = +(i * (sw + gap)).toFixed(2), name = clean(t.name, 24), max = sw - 2
    if (t.state === 'done') return at(x, 12, icon('check', 10, 's-ok')) + text(x + 12, 22, name, 10, 'muted', { max: max - 12 })
    if (t.state === 'failed') return at(x, 12, icon('cross', 10, 's-er')) + text(x + 12, 22, `${name} failed`, 10, 'er', { w: 600, max: max - 12 })
    return text(x, 22, name, 10, t.state === 'need' ? 'er' : t.state === 'live' ? 'fg' : 'muted', { w: t.state === 'need' ? 600 : 400, max })
  }).join('')
  const h = names ? 26 : 8
  return image('plan-bar', { source: doc(W, h, segBar(planSegs(plan), W, 'full', true) + (names ? label : ''), true), alt, width: W, height: h }, true)
}

// ---------- the chips ----------
const CHIP_PAD = 3, CHIP_H = SIZE.chip, CHIP_GAP = 6, TITLE_MAX = 180, READ_MAX = 300, ALERT_MIN = 160
const PULSE = `<style>.pulse{animation:pulse ${MOTION.beat} infinite}@keyframes pulse{50%{opacity:1}}</style>`
const isAlert = (a: CrewAgent) => a.state === 'need' || a.state === 'failed'
// A cut chip's full text, as a tooltip; it shows only when its image is interactive.
const TIP_MAX = 300
const withTip = (tip: string | undefined, g: string) => (tip === undefined ? g : `<g><title>${xml(clean(tip, TIP_MAX))}</title>${g}</g>`)
type ChipArt = { w: number; body: string; alt: string; tip?: string }

const reading = (a: CrewAgent, max = 160): Run => {
  if (a.state === 'need') return [clean(a.question, max), '#fff']
  if (a.state === 'failed') return [a.reason ? `failed · ${clean(a.reason, max)}` : a.endedAt ? `failed after ${fmtClock(a.endedAt - a.startedAt)}` : 'failed', '#fff']
  // A chip may loop, so it shows no clock finer than a minute: an agent with no estimate shows its steps only.
  const parts = [a.stepTotal ? `${a.stepDone}/${a.stepTotal}` : '', a.eta.kind === 'left' ? fmtLeft(a.eta.minutes) : a.eta.kind === 'over' ? 'slower' : '']
  const note = a.struggling ? `${a.tries} failed tries` : a.eta.kind === 'left' && a.eta.slow ? 'slower' : ''
  return [[...parts, note].filter(Boolean).join(' · '), a.struggling || (a.eta.kind !== 'none' && (a.eta.kind === 'over' || a.eta.slow)) ? 'warn' : 'muted']
}
// One chip at the origin, 26 tall: crab S, the name, the reading. `room` caps the whole chip.
const chipArt = (a: CrewAgent, walk: boolean, pulse: boolean, room: number): ChipArt => {
  const alert = isAlert(a), title = clean(a.title, 60), [say, tone] = reading(a)
  const tw = Math.min(TITLE_MAX, widthOf(title, 12, 600), Math.max(24, room / 3)), fixed = 35.5 + tw + 6 + 10
  const rw = Math.max(0, Math.min(alert ? READ_MAX : Infinity, widthOf(say, 12), room - fixed)), w = +(fixed + rw).toFixed(2)
  const shownTitle = fitTo(title, tw, 12, 600), shownSay = rw ? fitTo(say, rw, 12) : ''
  const fullTitle = oneLine(a.title), fullSay = reading(a, Infinity)[0]
  const tip = shownTitle !== fullTitle || shownSay !== fullSay ? [fullTitle, fullSay].filter(Boolean).join(': ') : undefined
  const body = (pulse ? `<rect class="s-halo35 pulse" x="-1.5" y="-1.5" width="${w + 3}" height="${CHIP_H + 3}" rx="9.5" fill="none" stroke-width="3" opacity="0"/>` : '')
    + `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="${alert ? 'red' : 'wash'}"/>`
    + at(4, 2.5, crab({ role: a.role, prop: a.prop, walk: walk && !alert, size: 'S', onRed: alert }))
    + text(35.5, 17, shownTitle, 12, alert ? '#fff' : 'fg', { w: 600 })
    + (rw ? text(35.5 + tw + 6, 17, shownSay, 12, tone) : '')
  return { w, body, alt: `${title}: ${say}`, tip }
}
const chipImage = (key: string, arts: ChipArt[], animated: boolean, loop: boolean, style = ''): El => {
  let x = CHIP_PAD
  const body = arts.map(c => { const g = withTip(c.tip, at(x, CHIP_PAD, c.body)); x += c.w + CHIP_GAP; return g }).join('')
  const w = +(x - CHIP_GAP + CHIP_PAD).toFixed(2), h = CHIP_H + 2 * CHIP_PAD
  const interactive = arts.some(c => c.tip !== undefined) ? { interactive: true } : {}
  return image(key, { source: doc(w, h, body + style, animated), alt: arts.map(c => c.alt).join('; '), width: w, height: h, ...interactive }, loop)
}
// The alerts past one row: a red chip of their own, never the muted '+N more'.
const alertMoreArt = (over: CrewAgent[], pulse: boolean): ChipArt => {
  const need = over.filter(a => a.state === 'need').length, failed = over.length - need
  const say = `+${over.length} ${need ? 'need you' : 'failed'}`, w = +(widthOf(say, 12, 600) + 20).toFixed(2)
  const body = (pulse ? `<rect class="s-halo35 pulse" x="-1.5" y="-1.5" width="${w + 3}" height="${CHIP_H + 3}" rx="9.5" fill="none" stroke-width="3" opacity="0"/>` : '')
    + `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="red"/>` + text(10, 17, say, 12, '#fff', { w: 600 })
  return { w, body, alt: need ? `${need} more need you${failed ? `, ${failed} failed` : ''}` : `${failed} more failed`, tip: over.map(a => oneLine(a.title)).join(', ') }
}
const moreChip = (n: number): El => {
  const say = `+${n} more`, w = widthOf(say, 12) + 20
  return chipImage('chip-more', [{ w, body: `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="wash"/>` + text(10, 17, say, 12, 'muted'), alt: `${n} more agents` }], false, false)
}
const width = (e: El) => (e.type === 'Client' ? (e.props!.props as ImageProps) : (e.props as ImageProps)).width
// Greedy rows of `avail` px; how many of `ws` fit in `rows` rows.
const fitsIn = (ws: number[], avail: number, rows: number) => {
  let row = 1, x = 0
  for (const w of ws) { if (x && x + w > avail) { row++; x = 0 } x += w }
  return row <= rows
}
const CHIP_ROWS = 2
const chipRows = (v: PanelView, W: number): El | null => {
  const { crew, loops } = v
  if (!crew.agents.length) return null
  // The alert chips share one row: as many as keep ALERT_MIN px each; the rest go into a red overflow chip at the row's end.
  const fitAlerts = (w: number) => Math.max(1, Math.floor((w - 2 * CHIP_PAD + CHIP_GAP) / (ALERT_MIN + CHIP_GAP)))
  // Need first, a helper that waits on you included; a failed helper gets no chip, only the crab and the dot.
  const allAlerts = [...withHelpers(crew.agents).filter(a => a.state === 'need'), ...crew.agents.filter(a => a.state === 'failed')], rest = crew.agents.filter(a => !isAlert(a))
  const pulses = (a: CrewAgent) => loops.chipPulse && (a.state === 'need' || v.armed)
  const items: { el: El; agents: number }[] = []
  if (allAlerts.length) {
    // Room for the overflow chip at the widest count it could show, rounded up so the chips' rounded widths still fit.
    const overW = allAlerts.length > fitAlerts(W) ? Math.ceil(alertMoreArt(allAlerts.slice(1), false).w + CHIP_GAP) : 0
    const alerts = allAlerts.slice(0, overW ? fitAlerts(W - overW) : allAlerts.length), over = allAlerts.slice(alerts.length)
    const room = (W - overW - 2 * CHIP_PAD - CHIP_GAP * (alerts.length - 1)) / alerts.length
    const anim = allAlerts.some(pulses)
    const arts = alerts.map(a => chipArt(a, false, pulses(a), room))
    if (over.length) arts.push(alertMoreArt(over, over.some(pulses)))
    items.push({ el: chipImage('chips-alert', arts, anim, true, anim ? PULSE : ''), agents: allAlerts.length })
  }
  for (const a of rest) {
    const walk = loops.walkers.includes(a.id)
    items.push({ el: chipImage(`chip-${a.id}`, [chipArt(a, walk, false, W - 2 * CHIP_PAD)], walk, walk), agents: 1 })
  }
  let shown = items
  if (!fitsIn(items.map(i => width(i.el)), W, CHIP_ROWS)) {
    let k = items.length
    const total = allAlerts.length + rest.length, more = (k: number) => moreChip(total - items.slice(0, k).reduce((s, i) => s + i.agents, 0))
    while (k > 1 && !fitsIn([...items.slice(0, k).map(i => width(i.el)), width(more(k))], W, CHIP_ROWS)) k--
    shown = [...items.slice(0, k), { el: more(k), agents: 0 }]
  }
  const rows: El[][] = [[]]
  let x = 0
  for (const { el } of shown) { const w = width(el); if (x && x + w > W) { rows.push([]); x = 0 } rows[rows.length - 1].push(el); x += w }
  return { type: 'Box', props: { key: 'chips', flexDirection: 'column' }, children: rows.map((r, i) => ({ type: 'Box', props: { key: `chips-row-${i + 1}`, flexDirection: 'row' }, children: r })) }
}

// ---------- the one-line size ----------
const lineItem = (key: string, art: string, artW: number, parts: Run[], alt: string, client: boolean): El => {
  const w = +(artW + 6 + runsWidth(parts, 13)).toFixed(2)
  return image(key, { source: doc(w, LINE_H, at(0, 5, art) + runs(artW + 6, 18, 13, parts, w - artW - 6 + 1)), alt, width: w, height: LINE_H }, client)
}
const oneLineRow = (v: PanelView): El => {
  const { stats, crew } = v, W = v.bodyColumns * CELL_PX, items: El[] = []
  for (const part of lineParts(stats, crew)) {
    if (part === 'context') {
      const c = stats.context, value = c ? pctOf(c.pct) : '—'
      items.push(lineItem('col-context', contextDial(v, true), 25.5, [[value, c?.alarm ? 'er' : 'fg', 600], [' context', 'muted']], `context: ${value}`, true))
    } else if (part === '5h' || part === '7d') {
      const l = limitOf(stats, part)!
      items.push(lineItem(`col-${part}`, limitDial(v, part, l, true), 25.5, [[pctOf(l.pct), limitTone(l) === 'warn' ? 'warn' : 'fg', 600], [` ${part}`, 'muted']], `${part} limit: ${pctOf(l.pct)}`, true))
    } else if (part === 'plan') {
      const p = crew.plan!
      items.push(lineItem('col-plan', at(0, 3, segBar(planSegs(p), 48, 'compact')), 48, [[`${p.done}/${p.total}`, 'fg', 600], [` ${p.phase}`, 'muted']], `plan: ${p.done} of ${p.total} tasks, ${p.phase}`, false))
    } else if (part === 'session') {
      const value = usd(stats.session.costUsd)
      items.push(lineItem('col-session', '', -6, [[value, 'fg', 600], [' session', 'muted']], `session: ${value}`, false))
    }
  }
  const children: El[] = [...items, spacer]
  if (crew.agents.length) {
    const m = mascotArt(crew, v.loops, 'S'), used = items.reduce((s, e) => s + width(e) + CELL_PX, 0) + 24 + 2 * CELL_PX
    const room = W - used - m.w - 6, say = room >= 40 ? fitTo(m.f.say, room, 13, m.f.w) : '', w = +(m.w + (say ? 6 + widthOf(say, 13, m.f.w) : 0)).toFixed(2)
    const body = at(0, 1, m.body) + (say ? text(m.w + 6, 18, say, 13, m.f.tone, { w: m.f.w }) : '')
    children.push(image('mascot', { source: doc(w, LINE_H, body, m.animated), alt: `Agents: show them all. ${crew.agents.length} agents, ${m.f.say}`, width: w, height: LINE_H, press: 'open' }, true))
  }
  children.push(toggle(v))
  return { type: 'Box', props: { key: 'line', flexDirection: 'row', alignItems: 'center', gap: 1 }, children }
}

// ---------- the tree ----------
const TOGGLE_CELLS = 4
export const panelTree = (v: PanelView): El => {
  const root = (children: El[]): El => ({ type: 'Box', props: { key: 'clawpit-panel', flexDirection: 'column', gap: 1 }, children })
  if (v.ui.size === 'line') return root([oneLineRow(v)])
  const keys = fit(candidates(v.stats, v.crew, v.ui.size, v.busy), maxColumns(v.bodyColumns))
  const cells = Math.floor((v.bodyColumns - TOGGLE_CELLS) / keys.length), w = cells * CELL_PX
  const columns = keys.flatMap((k, i): El[] => {
    if (k === 'agents') return [{ type: 'Box', props: { key: 'col-agents', width: cells }, children: [agentsColumn(v, w)] }]
    const c = cellOf(k, v)
    return c ? [{ type: 'Box', props: { key: `col-${k}`, width: cells }, children: [columnImage(k, c, w, i === 0)] }] : []
  })
  const out: El[] = [{ type: 'Box', props: { key: 'cols', flexDirection: 'row' }, children: [...columns, spacer, toggle(v)] }]
  if (v.stats.context?.alarm) out.push({ type: 'Box', props: { key: 'compact', flexDirection: 'row' }, children: [{ type: 'Button', props: { key: COMPACT_KEY, label: 'Compact now' } }] })
  if (v.ui.size === 'full') {
    const W = v.bodyColumns * CELL_PX
    if (v.crew.plan) out.push(planLine(v.crew.plan, v.crew, W), planBar(v.crew.plan, W))
    const chips = chipRows(v, W)
    if (chips) out.push(chips)
  }
  return root(out)
}
