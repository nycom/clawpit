// The panel above the prompt as plain RenderElement data (design §7.3). Pure: no host imports.
import type { ColumnKey, Crew, CrewAgent, ImageProps, LimitStat, LoopPlan, Plan, Settle, Stats, Ui } from '../../types'
import { crab } from '../crab'
import { dial, icon, segBar, toggleIcon } from '../icons'
import { CELL_PX, FONT, LINE_CELL_PX, MOTION, SIZE, SURFACE, svg } from '../tokens'
import { clip, fit as fitText, fmtAge, fmtClock, fmtCost, fmtDuration, fmtLeft, fmtTokens, oneLine, textWidth, xml } from '../text'
import { alertsOf, helpersOf, sessionFirst } from '../model'
import { contextText } from '../track/context'
import { paceText } from '../track/pace'
import { candidates, fit, lineParts, maxColumns } from './columns'
import { hasDot } from './fold'
import { image, type El } from '../draw'

export { image, type El }

export type PanelView = { stats: Stats; crew: Crew; ui: Ui; loops: LoopPlan; busy: boolean; armed: boolean; bodyColumns: number; now: number; settles: Record<string, Settle>; still?: boolean
  planGrow?: boolean }  // the plan bar's fills grow: only while the plan is new

// ---------- text ----------
// shortcut: the kit's width table runs up to ~10% short of SF Pro, so drawn widths add 10%; drop SLACK once the table is measured.
const SLACK = 1.1
const FIRST_X = 4 // the first column sits a little in from the band's left edge
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
const runs = (x: number, y: number, size: number, parts: Run[], max: number, end = false, fitLast = fitTo) => {
  let left = max
  const spans = parts.map(([s, p, w], i) => {
    const t = i === parts.length - 1 ? fitLast(s, Math.max(0, left), size, w) : s
    left -= widthOf(t, size, w)
    return `<tspan ${paint(p)}${weight(w)}>${xml(t)}</tspan>`
  })
  return `<text x="${x}" y="${y}" font-size="${size}"${end ? ' text-anchor="end"' : ''}>${spans.join('')}</text>`
}
// Whole clauses go right to left; a clause is never cut, so neither is a number ('on pace for…' says nothing).
const fitWhole = (s: string, max: number, size: number, w?: Weight) => {
  const fits = (t: string) => widthOf(t, size, w) <= max, clauses = s.split(' · ')
  while (clauses.length && !fits(clauses.join(' · '))) clauses.pop()
  return clauses.join(' · ')
}
const runsWidth = (parts: Run[], size: number) => parts.reduce((w, [s, , wt]) => w + widthOf(s, size, wt), 0)
// A dial's needle settle is an inline animation, so any animated body gets the reduced-motion rule.
const doc = (w: number, h: number, body: string, animated = false) =>
  svg(w, h, `<g font-family="${xml(FONT)}" style="font-variant-numeric:tabular-nums">${body}</g>`, animated || body.includes('animation:'))
const at = (x: number, y: number, body: string) => `<g transform="translate(${x} ${y})">${body}</g>`

// ---------- the columns ----------
const COL_H = 58, LINE_H = 28
// whole: the so-what drops whole clauses, never cutting one. tip: a <title>; alt: replaces the alt built from the text.
type Cell = { label: string; value: string; valueTone: string; small?: string; so: Run[]; art?: { body: string; w: number; client: boolean }; press?: string; whole?: true; tip?: string; alt?: string }

const limitOf = (stats: Stats, key: '5h' | '7d') => stats.limits.find(l => l.kind === (key === '5h' ? 'five_hour' : 'seven_day'))
const limitTone = (l: LimitStat) => (l.ahead || l.pct >= 80 ? 'warn' : 'accent')
const contextTone = (stats: Stats) => { const c = stats.context; return !c ? 'accent' : c.alarm ? 'er' : c.pct >= 70 ? 'warn' : 'accent' }
const pctOf = (n: number) => `${Math.round(n)}%`
const contextDial = (v: PanelView, small = false) => {
  const c = v.stats.context
  return dial(c?.pct ?? 0, contextTone(v.stats), { small, settle: v.settles.context, now: v.now, base: c && c.msgsPct !== null ? Math.max(0, c.pct - c.msgsPct) : 0 })
}
const limitDial = (v: PanelView, key: '5h' | '7d', l: LimitStat, small = false) =>
  dial(l.pct, limitTone(l), { small, settle: v.settles[key], now: v.now, ghost: l.pacePct ?? undefined })
const planSegs = (plan: Plan) => plan.tasks.map(({ state, role, fill }) => ({ state, role, fill }))
// Finished figures are exact, as in the mockup ('$267', 'last turn $2.46'); only the running turn's cost is '≈'.
const usd = (n: number | null) => (n === null ? '—' : fmtCost(n).replace('≈', ''))

const cellOf = (key: ColumnKey, v: PanelView): Cell | null => {
  const { stats, crew, now } = v, s = stats.session
  switch (key) {
    case 'context': {
      const c = stats.context
      return { label: 'context', value: c ? pctOf(c.pct) : '—', valueTone: c?.alarm ? 'er' : 'fg', so: [[contextText(c, s.turns), c?.alarm ? 'er' : 'muted']], art: { body: contextDial(v), w: 34, client: true }, press: 'context', whole: true }
    }
    case 'turn': {
      const t = stats.turn
      if (!t) return { label: 'this turn', value: '—', valueTone: 'fg', so: [['no reading yet', 'muted']] }
      return { label: 'this turn', value: fmtClock(now - t.startedAt), valueTone: 'fg',
        so: [[`+${t.added}`, 'okText'], [` −${t.removed}${t.costUsd === null ? '' : ` · ${fmtCost(t.costUsd)}`}`, 'muted']], whole: true }
    }
    case '5h': case '7d': {
      const l = limitOf(stats, key)
      if (!l) return null
      const tone = limitTone(l)
      return { label: `${key} limit`, value: pctOf(l.pct), valueTone: tone === 'warn' ? 'warn' : 'fg', so: [[paceText(l), l.ahead ? 'warn' : 'muted']], art: { body: limitDial(v, key, l), w: 34, client: true }, press: 'usage', whole: true }
    }
    case 'plan': {
      const p = crew.plan
      if (!p) return null
      const cell: Cell = { label: `plan · ${p.phase}`, value: `${p.done}/${p.total}`, valueTone: 'fg',
        so: [[`${clean(p.title, 60)}${crew.leftMin === null ? '' : ` · ${fmtLeft(crew.leftMin)}`}`, 'muted']],
        // A flow with no tasks has no mini bar, tooltip or task list to draw.
        ...(p.tasks.length ? { art: { body: at(0, 8, segBar(planSegs(p), 58, 'compact')), w: 58, client: false }, tip: taskList(p) } : {}) }
      return { ...cell, alt: `${altOf(cell)}${p.tasks.length ? `. Tasks: ${taskList(p)}` : ''}` }
    }
    case 'session':
      return { label: 'session', value: usd(s.costUsd), valueTone: 'fg',
        so: [[s.costUsd === null ? 'no reading yet' : !s.turns ? 'no turns yet' : s.lastTurnUsd === null ? '' : `last turn ${usd(s.lastTurnUsd)}`, 'muted']], whole: true, press: 'costs' }
    case 'tests': {
      const t = stats.tests
      if (!t) return null
      const bad = t.failed > 0, age = `${now - t.at < 60_000 ? '<1m' : fmtAge(now - t.at)} ago`, names = bad ? t.failedNames ?? [] : []
      const cell: Cell = { label: 'tests', value: String(bad ? t.failed : t.passed), valueTone: bad ? 'er' : 'okText', small: bad ? 'failed' : 'passed', so: [[names[0] ?? age, 'muted']] }
      return names.length ? { ...cell, tip: names.join(', '), alt: `tests: ${t.failed} failed, ${age}. Failing: ${names.join(', ')}` } : cell
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
  const x0 = first ? FIRST_X : 12, max = w - x0 - 4
  const vx = x0 + (c.art ? c.art.w + 6 : 0)
  const body = (first ? '' : `<rect class="track" x="0" y="0" width="1" height="${COL_H}"/>`)
    + text(x0, 11, c.label, 11, 'muted', { max })
    + (c.art ? at(x0, 18, c.art.body) : '')
    + text(vx, 35, c.value, 16, c.valueTone, { w: 600 })
    + (c.small ? text(vx + widthOf(c.value, 16, 600) + 4, 35, c.small, 12, 'muted') : '')
    + runs(x0, 54, 11, c.so, max, false, c.whole ? fitWhole : fitTo)
  return image(`col-${key}`, { source: doc(w, COL_H, c.tip ? withTip(c.tip, body, Infinity) : body), alt: c.alt ?? altOf(c), width: w, height: COL_H, ...(c.press ? { press: c.press } : {}) }, !!c.art?.client)
}
// From 50% context, a drawn chip right of the value on the value's line: its own pressable Client, placed over the
// column's free part so the image and its baseline stay as they are (a zone in the image would take the so-what's clicks).
// The word never changes and the width is budgeted at the alarm's weight, so the chip never reflows the columns.
// `cells` / `iconCells`: how wide the column must be to hold it whole, or its icon alone.
const COMPACT_H = 18, COMPACT_W = 6 + 12 + 4 + widthOf('compact', 11, 600) + 6, COMPACT_ICON_W = 20
const compactOf = (v: PanelView, c: Cell): { el: (iconOnly: boolean) => El; cells: number; iconCells: number } | null => {
  const ctx = v.stats.context
  if (!ctx || ctx.pct < 50) return null
  const left = Math.ceil((FIRST_X + (c.art ? c.art.w + 6 : 0) + widthOf(c.value, 16, 600) + 4) / CELL_PX)
  const alt = ctx.alarm ? `Compact context now: ${contextText(ctx, v.stats.session.turns)}` : 'Compact context: runs /compact'
  const el = (iconOnly: boolean): El => {
    const w = +(iconOnly ? COMPACT_ICON_W : COMPACT_W).toFixed(2)
    const body = `<rect x="0" y="0" width="${w}" height="${COMPACT_H}" rx="6" class="${ctx.alarm ? 'needTint' : 'wash'}"/>`
      + at(iconOnly ? 4 : 6, 3, icon('squeeze', 12, `s-${contextTone(v.stats)}`))
      + (iconOnly ? '' : text(22, 12.5, 'compact', 11, ctx.alarm ? 'er' : 'muted', ctx.alarm ? { w: 600 } : {}))
    return { type: 'Box', props: { key: 'compact-at', position: 'absolute', left, top: 1 },
      children: [image('compact', { source: doc(w, COMPACT_H, body), alt, width: w, height: COMPACT_H, press: 'compact', hover: true }, false)] }
  }
  return { el, cells: left + Math.ceil(COMPACT_W / CELL_PX), iconCells: left + Math.ceil(COMPACT_ICON_W / CELL_PX) }
}

// ---------- the agents crab: who it dresses as, and what it says ----------
// An alert's say is its name and a tail (" needs you", " failed") that is never cut.
type Face = { a: CrewAgent; say: string; tone: string; w: Weight; alert: boolean; name?: string; tail?: string }
// The top-level agents, then their helpers: a helper that waits on you or failed still dresses the crab.
const withHelpers = (as: CrewAgent[]) => [...as, ...as.flatMap(helpersOf)]
// The main session as its chip and the folded crab draw it: the slate crab with a question. It is never in crew.agents.
const sessionAgent = (crew: Crew): CrewAgent | null => {
  const s = crew.sessionNeed
  return s ? { id: 'session', title: 'Claude', role: 'explore', model: '', state: 'need', struggling: false, tries: 0, prop: 'wait', activity: null,
    question: s.question, stepDone: 0, stepTotal: 0, eta: { kind: 'none' }, usuallyMin: null, startedAt: s.since, waitingSince: s.since,
    contextPct: 0, costUsd: 0, helpers: [], log: [] } : null
}
const nextUp = (agents: CrewAgent[]) => {
  const left = agents.filter(a => a.state === 'running' && a.eta.kind === 'left')
  return left.sort((x, y) => (x.eta.kind === 'left' && y.eta.kind === 'left' ? x.eta.minutes - y.eta.minutes : 0))[0]
    ?? agents.find(a => a.state === 'running') ?? agents[0]
}
const faceOf = (crew: Crew): Face => {
  const as = crew.agents, all = withHelpers(as), title = (a: CrewAgent) => clean(a.title, 60)
  // Needs you first; the main session's need when it has waited longest.
  const waits = all.flatMap(a => (a.state === 'need' ? [a.waitingSince!] : [])), session = sessionAgent(crew)
  const need = session && sessionFirst(crew, waits.length ? Math.min(...waits) : undefined) ? session : all.find(a => a.state === 'need')
  const failed = all.find(a => a.state === 'failed'), hard = as.find(a => a.struggling)
  if (need) return { a: need, say: `${title(need)} needs you`, tone: 'er', w: 600, alert: true, name: title(need), tail: ' needs you' }
  if (failed) return { a: failed, say: `${title(failed)} failed`, tone: 'er', w: 600, alert: true, name: title(failed), tail: ' failed' }
  if (hard) return { a: hard, say: `${title(hard)} · ${hard.tries} failed tries`, tone: 'warn', w: 400, alert: false }
  const n = nextUp(as)
  // One agent: its name and its state, the state kept whole like an alert's tail; "next:" picks among two or more.
  const state = n.eta.kind === 'left' ? fmtLeft(n.eta.minutes) : n.activity?.verb ?? ''
  if (as.length === 1) return { a: n, say: state ? `${title(n)} · ${state}` : title(n), tone: 'fg', w: 400, alert: false, name: title(n), tail: state ? ` · ${state}` : undefined }
  return { a: n, say: `next: ${title(n)}${n.eta.kind === 'left' ? ` · ${fmtLeft(n.eta.minutes)}` : ''}`, tone: 'fg', w: 400, alert: false }
}
// Cuts only the name of an alert; under 6 name characters left, the tail alone.
const NAME_MIN = 6
const sayFit = (f: Face, max: number, size: number) => {
  if (!f.tail || !f.name || widthOf(f.say, size, f.w) <= max) return fitTo(f.say, max, size, f.w)
  const name = fitTo(f.name, max - widthOf(f.tail, size, f.w), size, f.w)
  return name.replace(/…$/, '').length >= NAME_MIN ? name + f.tail : fitTo(f.tail.replace(/^ · /, '').trim(), max, size, f.w)
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

// ---------- background work: not agents; with no agent and no session need, it alone reaches the pane ----------
type Bg = NonNullable<Crew['background']>
const bgOnly = (crew: Crew): Bg | null => (!crew.agents.length && !crew.sessionNeed && crew.background) || null
const activeOf = (b: Bg) => b.running + b.waiting
// What fires next, in whole minutes rounded up: "in 7m", or "due".
const nextIn = (b: Bg, now: number) => (!b.next ? '' : b.next.nextAt - now <= 0 ? 'due' : `in ${Math.ceil((b.next.nextAt - now) / 60_000)}m`)
// Clauses joined by " · "; a separator takes the colour of the clause after it, so the failed one reads whole in er.
const clauses = (...parts: (Run | null)[]): Run[] => parts.filter((r): r is Run => !!r).flatMap((r, i) => (i ? [[' · ', r[1]] as Run, r] : [r]))
const failedRun = (b: Bg): Run | null => (b.failed ? [`${b.failed} failed`, 'er'] : null)
// Longest first, whole clauses only; the failed clause never drops while another stays.
const firstFit = (says: Run[][], max: number, size: number) => says.find(x => runsWidth(x, size) <= max) ?? []
// The chip: "[R running] · [next] · [F failed]", each part left out at zero; [next] names the soonest timed row, else counts the
// waiting ones. Narrow, [next] goes first, then R shortens to its number.
const chipSays = (b: Bg, now: number): Run[][] => {
  const r: Run | null = b.running ? [`${b.running} running`, 'muted'] : null, rn: Run | null = b.running ? [`${b.running}`, 'muted'] : null
  const nx: Run | null = b.next ? [`${b.next.kind} ${nextIn(b, now)}`, 'muted'] : b.waiting ? [`${b.waiting} waiting`, 'muted'] : null
  return [clauses(r, nx, failedRun(b)), clauses(r, failedRun(b)), clauses(rn, failedRun(b))].filter(x => x.length)
}
// The one-line row: "4 · next 7m · 1 failed", the failed clause last; next drops first, then the count, then the icon stands bare.
const lineSays = (b: Bg, now: number): Run[][] => {
  const a: Run | null = activeOf(b) ? [`${activeOf(b)}`, 'muted'] : null, nx: Run | null = b.next ? [`next ${nextIn(b, now).replace(/^in /, '')}`, 'muted'] : null
  return [clauses(a, nx, failedRun(b)), clauses(a, failedRun(b)), clauses(failedRun(b))].filter(x => x.length)
}
// The folded column's line under the count: "1 failed · next 7m", dropping whole from the right.
const underSays = (b: Bg, now: number): Run[][] => {
  const nx: Run | null = b.next ? [`next ${nextIn(b, now).replace(/^in /, '')}`, 'muted'] : null
  return b.failed || nx ? [clauses(failedRun(b), nx), clauses(failedRun(b))].filter(x => x.length) : [[['running or waiting', 'muted']]]
}
const tasks = (k: number) => (k === 1 ? 'task' : 'tasks')
const bgAlt = (b: Bg, now: number) => (activeOf(b)
  ? `${activeOf(b)} background ${tasks(activeOf(b))} running or waiting${b.failed ? `, ${b.failed} failed` : ''}${b.next ? `, next: ${b.next.kind} ${nextIn(b, now)}` : ''}`
  : `${b.failed} failed background ${tasks(b.failed)}`)
// The lead icon where the crab stands for agents: the kind of what fires next, or runs newest; the cross in er when only failed rows show.
const leadIcon = (b: Bg) => (b.lead === 'failed' ? icon('cross', 12, 's-er') : icon(b.lead, 12, 's-muted'))
// The folded agents column: the lead icon in the crab's slot, the active count in the value slot, failed and next under it.
const bgColumn = (b: Bg, w: number, now: number): El => {
  const x0 = 12, max = w - x0 - 4, vx = x0 + SIZE.crab.M[0] + 7 + 6, say = firstFit(underSays(b, now), max, 11)
  const body = `<rect class="track" x="0" y="0" width="1" height="${COL_H}"/>` + text(x0, 11, 'background', 11, 'muted', { max }) + at(x0 + 11, 23, leadIcon(b))
    + text(vx, 35, String(activeOf(b) || b.failed), 16, activeOf(b) ? 'fg' : 'er', { w: 600 }) + runs(x0, 54, 11, say, max + 1)
  return image('mascot', { source: doc(w, COL_H, body), alt: `Agents: show them all. ${bgAlt(b, now)}`, width: w, height: COL_H, press: 'open' }, false)
}

// Who the value slot names, up to one agent: the lone agent, or with no agents the main session's need, so a count of 0
// is never drawn.
const soloOf = (crew: Crew, f: Face): CrewAgent | null => crew.agents.length > 1 ? null : crew.agents[0] ?? (f.a.id === 'session' ? f.a : null)
const agentsColumn = (v: PanelView, w: number): El => {
  const bg = bgOnly(v.crew)
  if (bg) return bgColumn(bg, w, v.now)
  const m = mascotArt(v.crew, v.loops, 'M'), x0 = 12, max = w - x0 - 4, n = v.crew.agents.length, vx = x0 + m.w + 6, ux = vx + widthOf(String(n), 16, 600) + 4
  // One agent: its name in the value slot and only its state under it; a count of 1 says nothing (maintainer, 2026-11-21).
  const solo = soloOf(v.crew, m.f), own = solo && m.f.a === solo
  const state = own ? (m.f.tail?.replace(/^ · /, '').trim() ?? m.f.say.replace(/^next: /, '').slice(clean(solo.title, 60).length).replace(/^ · /, '').trim()) : ''
  const value = solo ? text(vx, 35, fitTo(clean(solo.title, 60), w - 4 - vx, 14, 600), 14, 'fg', { w: 600 })
    : text(vx, 35, String(n), 16, 'fg', { w: 600 }) + text(ux, 35, fitWhole('agents', w - 4 - ux, 12), 12, 'muted')
  const body = `<rect class="track" x="0" y="0" width="1" height="${COL_H}"/>` + text(x0, 11, 'agents', 11, 'muted', { max })
    + at(x0, 15, m.body) + value
    + text(x0, 54, own ? fitTo(state, max, 11, m.f.w) : sayFit(m.f, max, 11), 11, m.f.tone, { w: m.f.w })
  return image('mascot', { source: doc(w, COL_H, body, m.animated), alt: `Agents: show them all. ${n ? `${n} ${n === 1 ? 'agent' : 'agents'}, ` : ''}${m.f.say}`, width: w, height: COL_H, press: 'open' }, true)
}

// ---------- the toggle ----------
const SIZE_ALT = { full: 'Panel: everything. Fold the agents', gauges: 'Panel: agents folded. Show one line', line: 'Panel: one line. Show everything' } as const
const toggle = (v: PanelView): El => {
  const dot = hasDot(v.ui.size, v.crew), { need } = alertsOf(v.crew)
  const why = !need ? '. An agent failed' : need === 1 && v.crew.sessionNeed ? '. Claude needs you' : '. An agent needs you'
  return image('toggle', { source: svg(24, 24, at(5, 5, toggleIcon(v.ui.size, dot))), alt: `${SIZE_ALT[v.ui.size]}${dot ? why : ''}`, width: 24, height: 24, press: 'size' }, true)
}
const spacer: El = { type: 'Box', props: { flexGrow: 1 } }

// ---------- the plan row ----------
const PHASES = ['plan', 'delegate', 'review', 'close'] as const
const NAME_MIN_PX = 56, NAME_MAX_TASKS = 8, PARTS_PAST = 40, NEXT_MIN = 8
// The plan bar's segment width and gap, and whether its segments have room to name their tasks.
const segsOf = (n: number, W: number) => {
  const gap = Math.min(2, W / (n || 1) / 2), sw = (W - gap * (n - 1)) / (n || 1)
  return { gap, sw, names: n <= NAME_MAX_TASKS && sw >= NAME_MIN_PX }
}
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
  // With nothing under way and no names on the bar, the first not-started task, in what the title and stepper leave;
  // the name may be cut, but never under NEXT_MIN characters, else the clause goes whole.
  const quiet = plan.tasks.every(t => t.state === 'done' || t.state === 'todo') && !segsOf(plan.tasks.length, W).names
  const next = quiet ? clean(plan.tasks.find(t => t.state === 'todo')?.name, 60) : ''
  const spare = W - rw - (tw ? tw + 12 : 0) - st.w - 12 - widthOf(' · next: ', 12)
  const cut = next && spare > 0 ? fitTo(next, spare, 12) : ''
  const clause: Run[] = cut && !(cut.endsWith('…') && [...cut.slice(0, -1).trim()].length < NEXT_MIN) ? [[` · next: ${cut}`, 'muted']] : []
  const body = (tw ? text(0, 15, title, 12, 'fg', { w: 600, max: tw }) : '') + at(tw ? tw + 12 : 0, 0, st.out)
    + runs(W, 15, 12, [...right, ...clause], rw + runsWidth(clause, 12) + 1, true)
  const alt = `${title}, phase ${plan.phase}, ${plan.done} of ${plan.total} tasks${left}${next ? `, next: ${next}` : ''}`
  return image('plan-line', { source: doc(W, 22, body), alt, width: W, height: 22 }, false)
}

const STATE_WORD = { done: 'done', live: 'in progress', need: 'needs you', failed: 'failed', todo: 'not started' } as const
// shortcut: capped at 4,000 characters so a huge plan stays under the props cap; list fewer if plans grow past ~60 tasks.
const taskList = (plan: Plan) => clip(plan.tasks.map(t => `${clean(t.name, 60)} ${STATE_WORD[t.state]}`).join(', '), 4000)
const planBar = (plan: Plan, W: number, grow: boolean): El => {
  const n = plan.tasks.length, count = (s: string) => plan.tasks.filter(t => t.state === s).length
  const list = taskList(plan), alt = `tasks: ${list}`
  if (n > PARTS_PAST) {
    const live = n - count('done') - count('todo'), ws = [count('done'), live, count('todo')].map(k => (W * k) / n)
    const body = ['ok', 'accent', 'track'].map((c, i) => `<rect x="${+ws.slice(0, i).reduce((a, b) => a + b, 0).toFixed(2)}" y="0" width="${+ws[i].toFixed(2)}" height="8" rx="3" class="${c}"/>`).join('')
    return image('plan-bar', { source: doc(W, 8, withTip(list, body, Infinity)), alt, width: W, height: 8 }, true)
  }
  const { gap, sw, names } = segsOf(n, W)
  const label = plan.tasks.map((t, i) => {
    const x = +(i * (sw + gap)).toFixed(2), name = clean(t.name, 24), max = sw - 2
    if (t.state === 'done') return at(x, 12, icon('check', 10, 's-ok')) + text(x + 12, 22, name, 10, 'muted', { max: max - 12 })
    if (t.state === 'failed') return at(x, 12, icon('cross', 10, 's-er')) + text(x + 12, 22, `${name} failed`, 10, 'er', { w: 600, max: max - 12 })
    if (t.state === 'need') return at(x, 12, icon('ask', 10, 's-er')) + text(x + 12, 22, name, 10, 'er', { w: 600, max: max - 12 })
    return text(x, 22, name, 10, t.state === 'live' ? 'fg' : 'muted', { max })
  }).join('')
  const h = names ? 26 : 8
  return image('plan-bar', { source: doc(W, h, withTip(list, segBar(planSegs(plan), W, 'full', grow) + (names ? label : ''), Infinity), grow), alt, width: W, height: h }, grow)
}

// ---------- the chips ----------
const CHIP_PAD = 3, CHIP_H = SIZE.chip, CHIP_GAP = 6, TITLE_MAX = 180, READ_MAX = 300, ALERT_MIN = 160
const PULSE = `<style>.pulse{animation:pulse ${MOTION.beat} infinite}@keyframes pulse{50%{opacity:1}}</style>`
const isAlert = (a: CrewAgent) => a.state === 'need' || a.state === 'failed'
// A cut chip's full text, as a tooltip. The desktop draws a pressable chip as an image, where it does not show yet.
const TIP_MAX = 300
const withTip = (tip: string | undefined, g: string, max = TIP_MAX) => (tip === undefined ? g : `<g><title>${xml(clean(tip, max))}</title>${g}</g>`)
type ChipArt = { w: number; body: string; alt: string; tip?: string; press: string }

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
  return { w, body, alt: `${title}: ${say}`, tip, press: `open:${a.id}` }
}
// Every chip opens the Agents pane, so every chip is a Client; that alone makes none loop.
// Several chips in one image press by where the pointer lands (zones); a key press opens the first.
const chipImage = (key: string, arts: ChipArt[], animated: boolean, style = ''): El => {
  let x = CHIP_PAD
  const zones: { to: number; press: string }[] = []
  const body = arts.map(c => { const g = withTip(c.tip, at(x, CHIP_PAD, c.body)); x += c.w + CHIP_GAP; zones.push({ to: +(x - CHIP_GAP / 2).toFixed(2), press: c.press }); return g }).join('')
  const w = +(x - CHIP_GAP + CHIP_PAD).toFixed(2), h = CHIP_H + 2 * CHIP_PAD
  zones[zones.length - 1].to = w
  return image(key, { source: doc(w, h, body + style, animated), alt: arts.map(c => c.alt).join('; '), width: w, height: h, press: arts[0].press, ...(arts.length > 1 ? { zones } : {}) }, false)
}
// The alerts past one row: a red chip of their own, never the muted '+N more'.
const alertMoreArt = (over: CrewAgent[], pulse: boolean): ChipArt => {
  const need = over.filter(a => a.state === 'need').length, failed = over.length - need
  const say = `+${over.length} ${need ? 'need you' : 'failed'}`, w = +(widthOf(say, 12, 600) + 20).toFixed(2)
  const body = (pulse ? `<rect class="s-halo35 pulse" x="-1.5" y="-1.5" width="${w + 3}" height="${CHIP_H + 3}" rx="9.5" fill="none" stroke-width="3" opacity="0"/>` : '')
    + `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="red"/>` + text(10, 17, say, 12, '#fff', { w: 600 })
  return { w, body, alt: need ? `${need} more need you${failed ? `, ${failed} failed` : ''}` : `${failed} more failed`, tip: over.map(a => oneLine(a.title)).join(', '), press: 'open' }
}
const moreChip = (n: number): El => {
  const say = `+${n} more`, w = widthOf(say, 12) + 20
  return chipImage('chip-more', [{ w, body: `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="wash"/>` + text(10, 17, say, 12, 'muted'), alt: `${n} more agents`, press: 'open' }], false)
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
  const { crew, loops } = v, session = sessionAgent(crew), lead = session ? 1 : 0
  const bg = bgOnly(crew)
  if (bg) {
    // One muted chip, plain art: no crab, no pulse, no red; it opens the pane as "+N more" does.
    const says = chipSays(bg, v.now), rs = firstFit(says, W - 2 * CHIP_PAD - 20, 12), shown = rs.length ? rs : says[says.length - 1], w = +(runsWidth(shown, 12) + 20).toFixed(2)
    const chip = chipImage('chip-background', [{ w, body: `<rect x="0" y="0" width="${w}" height="${CHIP_H}" rx="8" class="wash"/>` + runs(10, 17, 12, shown, w - 20 + 1),
      alt: says[0].filter(r => r[0] !== ' · ').map(r => r[0]).join(', '), press: 'open' }], false)
    return { type: 'Box', props: { key: 'chips', flexDirection: 'column' }, children: [{ type: 'Box', props: { key: 'chips-row-1', flexDirection: 'row' }, children: [chip] }] }
  }
  if (!crew.agents.length && !session) return null
  // The alert chips share one row: as many as keep ALERT_MIN px each; the rest go into a red overflow chip at the row's end.
  const fitAlerts = (w: number) => Math.max(1, Math.floor((w - 2 * CHIP_PAD + CHIP_GAP) / (ALERT_MIN + CHIP_GAP)))
  // The main session's need, then the agents' needs, a helper that waits on you included; a failed helper gets no chip, only the crab and the dot.
  const allAlerts = [...(session ? [session] : []), ...withHelpers(crew.agents).filter(a => a.state === 'need'), ...crew.agents.filter(a => a.state === 'failed')]
  const rest = crew.agents.filter(a => !isAlert(a))
  const pulses = (a: CrewAgent) => loops.chipPulse && (a.state === 'need' || v.armed)
  const items: { el: El; agents: number }[] = []
  if (allAlerts.length) {
    // Room for the overflow chip at the widest count it could show, rounded up so the chips' rounded widths still fit.
    const overW = allAlerts.length > fitAlerts(W) ? Math.ceil(alertMoreArt(allAlerts.slice(1), false).w + CHIP_GAP) : 0
    const alerts = allAlerts.slice(0, overW ? fitAlerts(W - overW) : allAlerts.length), over = allAlerts.slice(alerts.length)
    const room = (W - overW - 2 * CHIP_PAD - CHIP_GAP * (alerts.length - 1)) / alerts.length
    const anim = allAlerts.some(pulses)
    // The session's chip has no drawer to open, so it opens the pane.
    const arts = alerts.map(a => (a === session ? { ...chipArt(a, false, pulses(a), room), alt: `Claude needs you: ${reading(a)[0]}`, press: 'open' } : chipArt(a, false, pulses(a), room)))
    if (over.length) arts.push(alertMoreArt(over, over.some(pulses)))
    items.push({ el: chipImage('chips-alert', arts, anim, anim ? PULSE : ''), agents: allAlerts.length - lead })
  }
  for (const a of rest) {
    const walk = loops.walkers.includes(a.id)
    items.push({ el: chipImage(`chip-${a.id}`, [chipArt(a, walk, false, W - 2 * CHIP_PAD)], walk), agents: 1 })
  }
  let shown = items
  if (!fitsIn(items.map(i => width(i.el)), W, CHIP_ROWS)) {
    let k = items.length
    const total = allAlerts.length - lead + rest.length, more = (k: number) => moreChip(total - items.slice(0, k).reduce((s, i) => s + i.agents, 0))
    while (k > 1 && !fitsIn([...items.slice(0, k).map(i => width(i.el)), width(more(k))], W, CHIP_ROWS)) k--
    shown = [...items.slice(0, k), { el: more(k), agents: 0 }]
  }
  const rows: El[][] = [[]]
  let x = 0
  for (const { el } of shown) { const w = width(el); if (x && x + w > W) { rows.push([]); x = 0 } rows[rows.length - 1].push(el); x += w }
  return { type: 'Box', props: { key: 'chips', flexDirection: 'column' }, children: rows.map((r, i) => ({ type: 'Box', props: { key: `chips-row-${i + 1}`, flexDirection: 'row' }, children: r })) }
}

// ---------- the one-line size ----------
const lineItem = (key: string, art: string, artW: number, parts: Run[], alt: string, client: boolean, o: { press?: string; tip?: string } = {}): El => {
  const w = +(artW + 6 + runsWidth(parts, 13)).toFixed(2), body = at(0, 5, art) + runs(artW + 6, 18, 13, parts, w - artW - 6 + 1)
  return image(key, { source: doc(w, LINE_H, o.tip ? withTip(o.tip, body, Infinity) : body), alt, width: w, height: LINE_H, ...(o.press ? { press: o.press } : {}) }, client)
}
const oneLineRow = (v: PanelView): El => {
  const { stats, crew } = v, W = v.bodyColumns * LINE_CELL_PX, items: El[] = []
  for (const part of lineParts(stats, crew)) {
    if (part === 'context') {
      const c = stats.context, value = c ? pctOf(c.pct) : '—'
      items.push(lineItem('col-context', contextDial(v, true), 25.5, [[value, c?.alarm ? 'er' : 'fg', 600], [' context', 'muted']], `context: ${value}`, true, { press: 'context' }))
    } else if (part === '5h' || part === '7d') {
      const l = limitOf(stats, part)!
      items.push(lineItem(`col-${part}`, limitDial(v, part, l, true), 25.5, [[pctOf(l.pct), limitTone(l) === 'warn' ? 'warn' : 'fg', 600], [` ${part}`, 'muted']], `${part} limit: ${pctOf(l.pct)}`, true, { press: 'usage' }))
    } else if (part === 'plan') {
      const p = crew.plan!
      const n = p.tasks.length
      items.push(lineItem('col-plan', n ? at(0, 3, segBar(planSegs(p), 48, 'compact')) : '', n ? 48 : -6, [[`${p.done}/${p.total}`, 'fg', 600], [` ${p.phase}`, 'muted']],
        `plan: ${p.done} of ${p.total} tasks, ${p.phase}${n ? `. Tasks: ${taskList(p)}` : ''}`, false, n ? { tip: taskList(p) } : {}))
    } else if (part === 'session') {
      const value = usd(stats.session.costUsd)
      items.push(lineItem('col-session', '', -6, [[value, 'fg', 600], [' session', 'muted']], `session: ${value}`, false, { press: 'costs' }))
    }
  }
  const children: El[] = [...items, spacer], used = items.reduce((s, e) => s + width(e) + LINE_CELL_PX, 0) + 24 + 2 * LINE_CELL_PX, bg = bgOnly(crew)
  if (bg) {
    const iw = 14, rs = firstFit(lineSays(bg, v.now), W - used - iw - 6, 13), sayW = runsWidth(rs, 13), w = +(iw + (rs.length ? 6 + sayW : 0)).toFixed(2)
    const body = at(1, 8, leadIcon(bg)) + (rs.length ? runs(iw + 6, 18, 13, rs, sayW + 1) : '')
    children.push(image('mascot', { source: doc(w, LINE_H, body), alt: `Agents: show them all. ${bgAlt(bg, v.now)}`, width: w, height: LINE_H, press: 'open' }, false))
  } else if (crew.agents.length || crew.sessionNeed) {
    const m = mascotArt(crew, v.loops, 'S')
    const room = W - used - m.w - 6, say = room >= 40 ? sayFit(m.f, room, 13) : '', w = +(m.w + (say ? 6 + widthOf(say, 13, m.f.w) : 0)).toFixed(2)
    const body = at(0, 1, m.body) + (say ? text(m.w + 6, 18, say, 13, m.f.tone, { w: m.f.w }) : '')
    children.push(image('mascot', { source: doc(w, LINE_H, body, m.animated), alt: `Agents: show them all. ${crew.agents.length ? `${crew.agents.length} ${crew.agents.length === 1 ? 'agent' : 'agents'}, ` : ''}${m.f.say}`, width: w, height: LINE_H, press: 'open' }, true))
  }
  children.push(toggle(v))
  return { type: 'Box', props: { key: 'line', flexDirection: 'row', alignItems: 'center', gap: 1 }, children }
}

// ---------- the column widths ----------
// What a column needs to show its label, value and whole so-what, in cells. `claims`: its so-what drops whole clauses, so it
// may claim spare cells (a cut so-what and the agents column only give theirs away); `warn`: that so-what is a warning.
// `floor`: the cells for its label, value and first clause, all a column keeps once its whole so-what cannot fit.
// `head`: the cells for its label and value alone.
type Need = { cells: number; floor: number; head: number; claims: boolean; warn: boolean; priority: number }
const needOf = (c: Cell | null, first: boolean, priority: number): Need => {
  if (!c) return { cells: Infinity, floor: Infinity, head: 0, claims: false, warn: false, priority }
  const x0 = first ? FIRST_X : 12, head = (c.art ? c.art.w + 6 : 0) + widthOf(c.value, 16, 600) + (c.small ? 4 + widthOf(c.small, 12) : 0)
  const cellsFor = (so: Run[]) => Math.ceil((x0 + 4 + Math.max(widthOf(c.label, 11), head, runsWidth(so, 11))) / CELL_PX)
  const [s, p, wt] = c.so.at(-1)!, cells = cellsFor(c.so)
  const floor = c.whole ? cellsFor([...c.so.slice(0, -1), [s.split(' · ')[0], p, wt]]) : cells
  return { cells, floor, head: cellsFor([]), claims: !!c.whole, warn: c.so.some(([, p]) => p === 'warn' || p === 'er'), priority }
}
// A lone agent's column claims the cells for its whole name and, short of them, keeps its even share; more agents
// take an even share and claim nothing.
const agentsNeed = (v: PanelView, priority: number): Need => {
  // Background work alone claims the cells for its whole words, as a lone agent does for its name.
  const bg = bgOnly(v.crew)
  if (bg) return { cells: Math.ceil((12 + 4 + runsWidth(underSays(bg, v.now)[0], 11)) / CELL_PX), floor: Infinity, head: 0, claims: true, warn: false, priority }
  const f = faceOf(v.crew), solo = soloOf(v.crew, f)
  // The state line under the name counts too, so a short title never leaves its note to be cut.
  const cells = solo ? Math.ceil(Math.max(12 + SIZE.crab.M[0] + 7 + 6 + widthOf(clean(solo.title, 60), 14, 600), 12 + widthOf(f.say, 11, f.w)) / CELL_PX + 4 / CELL_PX) : Infinity
  return { cells, floor: Infinity, head: 0, claims: !!solo, warn: false, priority }
}
// An even share each; then the compact chip's cells, taken even when no column has slack; then the warnings, then the
// other clause columns left to right, each met whole from spare cells and the most slack, or not at all. With no slack
// anywhere, the compact chip's cells come from the widest column, one without a warning first, the lowest priority first.
const shareCells = (needs: Need[], avail: number, ctxMin: number) => {
  const w = needs.map(() => Math.floor(avail / needs.length))
  let spare = avail - w.reduce((a, b) => a + b, 0)
  // A column short of its whole need drops a clause anyway, so all above its floor is slack.
  const slack = (j: number) => Math.max(0, w[j] - (w[j] >= needs[j].cells ? needs[j].cells : needs[j].floor))
  const take = (i: number, n: number) => {
    for (; n > 0; n--) {
      const j = spare ? -1 : needs.map((_, j) => j).filter(j => j !== i)
        .sort((a, b) => slack(b) - slack(a) || w[b] - w[a] || +needs[a].warn - +needs[b].warn || needs[a].priority - needs[b].priority)[0]
      if (j === undefined) return
      if (j < 0) spare--; else w[j]--
      w[i]++
    }
  }
  take(0, ctxMin - w[0])
  const order = needs.map((_, i) => i).filter(i => needs[i].claims).sort((a, b) => +needs[b].warn - +needs[a].warn || a - b)
  for (const i of order) {
    const short = needs[i].cells - w[i], room = spare + needs.reduce((s, _, j) => s + (j === i ? 0 : slack(j)), 0)
    if (short > 0 && short <= room) take(i, short)
  }
  return w
}

// ---------- the tree ----------
const TOGGLE_CELLS = 4
export const panelTree = (v: PanelView): El => {
  const root = (children: El[]): El => ({ type: 'Box', props: { key: 'clawpit-panel', flexDirection: 'column', gap: 1 }, children })
  if (v.ui.size === 'line') return root([oneLineRow(v)])
  const cands = candidates(v.stats, v.crew, v.ui.size, v.busy), keys = fit(cands, maxColumns(v.bodyColumns))
  // Columns share the row by need; the context column (always first) holds the compact chip when there is one,
  // its icon alone where the whole chip would cost another column its label and value, or a warning its first clause.
  const cells = keys.map(k => (k === 'agents' ? null : cellOf(k, v))), compact = compactOf(v, cells[0]!)
  const needs = keys.map((k, i) => { const p = cands.find(c => c.key === k)!.priority; return k === 'agents' ? agentsNeed(v, p) : needOf(cells[i], i === 0, p) })
  const share = (chip: number) => shareCells(needs.map((n, i) => (i ? n : { ...n, cells: Math.max(n.cells, chip) })), v.bodyColumns - TOGGLE_CELLS, keys.length > 1 ? chip : 0)
  const keeps = (ws: number[]) => ws.map((n, i) => i === 0 || n >= (needs[i].warn ? needs[i].floor : needs[i].head))
  const whole = share(compact?.cells ?? 0), small = compact ? share(compact.iconCells) : whole
  const iconOnly = !!compact && keeps(whole).some((kept, i) => !kept && keeps(small)[i])
  const widths = iconOnly ? small : whole
  const columns = keys.flatMap((k, i): El[] => {
    const n = widths[i], w = n * CELL_PX
    if (k === 'agents') return [{ type: 'Box', props: { key: 'col-agents', width: n }, children: [agentsColumn(v, w)] }]
    const c = cells[i]
    return c ? [{ type: 'Box', props: { key: `col-${k}`, width: n }, children: [columnImage(k, c, w, i === 0), ...(k === 'context' && compact ? [compact.el(iconOnly)] : [])] }] : []
  })
  const out: El[] = [{ type: 'Box', props: { key: 'cols', flexDirection: 'row' }, children: [...columns, spacer, toggle(v)] }]
  if (v.ui.size === 'full') {
    const W = v.bodyColumns * CELL_PX
    // A flow that reported no tasks has no bar to draw: its line alone, no blank row under it.
    if (v.crew.plan) out.push(planLine(v.crew.plan, v.crew, W), ...(v.crew.plan.tasks.length ? [planBar(v.crew.plan, W, !!v.planGrow)] : []))
    const chips = chipRows(v, W)
    if (chips) out.push(chips)
  }
  return root(out)
}
