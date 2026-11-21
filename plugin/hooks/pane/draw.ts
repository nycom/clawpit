// The Agents pane as a plain RenderElement tree (design §8.2). Pure: no host imports.
import type { Crew, CrewAgent, ImageProps, LoopPlan, Role, Ui } from '../../types'
import { CELL_PX, FONT, MONO, MOTION, SIZE, cssOf, svg } from '../tokens'
import { clip, fit, fmtAge, fmtClock, fmtCost, fmtLeft, oneLine, textWidth, wrap, xml } from '../text'
import { icon, segBar, stepBlocks, type Seg } from '../icons'
import { crab } from '../crab'
import { alertsOf, helpersOf } from '../model'
import { paneLayout, type PaneItem } from './layout'

export type El = { type: string; props?: Record<string, unknown>; children?: (El | string)[] }
export type PaneView = { crew: Crew; ui: Ui; loops: LoopPlan; columns: number; now: number }

const PROPS_MAX = 60_000
// A looping or pressable image is a Client, so it keeps its instance across redraws; anything else is a plain Svg.
export const image = (key: string, p: ImageProps, loop: boolean): El => {
  const size = JSON.stringify(p).length
  if (size > PROPS_MAX) throw new Error(`clawpit: image ${key} has ${size} characters of props, over ${PROPS_MAX}`)
  return loop || p.press ? { type: 'Client', props: { key, module: './client/image.tsx', props: p } } : { type: 'Svg', props: { key, ...p } }
}

// The row's four columns: crab 38, title and activity, the 88px reading column, the chevron.
const CRAB = 38, READ = 88, CHEV = 16, GAP = 10, PAD = 8, HELPER_CRAB = 50, HELPER_READ = 72, INDENT = 14
const n = (v: number) => +v.toFixed(2)
const clean = (v: unknown, max: number) => clip(oneLine(v), max)
type Weight = 400 | 600 | 700
type Run = [text: string, cls: string, weight?: Weight]

const text = (x: number, y: number, cls: string, size: number, s: string, o: { weight?: Weight; anchor?: 'end' | 'middle'; family?: string } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" font-size="${size}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.family ? ` font-family="${o.family}"` : ''}>${xml(s)}</text>`
const runsWidth = (rs: Run[], size: number) => rs.reduce((w, [s, , wt]) => w + textWidth(s, size, wt ?? 400), 0)
// Coloured runs on one line, cut with an ellipsis where they pass `maxW`.
const runs = (x: number, y: number, size: number, rs: Run[], maxW: number, anchor?: 'end') => {
  let left = maxW, out = ''
  for (const [s, cls, wt] of rs) {
    const w = textWidth(s, size, wt ?? 400), cut = w > left ? fit(s, left, size, wt ?? 400) : s
    out += `<tspan class="${cls}"${wt && wt !== 400 ? ` font-weight="${wt}"` : ''}>${xml(cut)}</tspan>`
    if (cut !== s) break
    left -= w
  }
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}"${anchor ? ` text-anchor="${anchor}"` : ''}>${out}</text>`
}
const doc = (w: number, h: number, body: string, animated = false) =>
  svg(n(w), h, `<g style="font-family:${FONT};font-variant-numeric:tabular-nums">${body}</g>`, animated)
// A crab is a whole <svg> with its own style, nested after the outer style so its classes are not emitted twice.
const withCrab = (outer: string, crabSvg: string, x: number, y: number) => `${outer.slice(0, -6)}<g transform="translate(${n(x)} ${n(y)})">${crabSvg}</g></svg>`
const chevron = (x: number, y: number, size: 10 | 12, open: boolean) =>
  `<g transform="translate(${n(x)} ${n(y)})${open ? ` rotate(90 ${size / 2} ${size / 2})` : ''}">${icon('chev', size, 's-muted')}</g>`
const blocks = (x: number, y: number, done: number, total: number, tone: Role | 'er') => {
  const k = Math.min(Math.max(0, total), 11), d = total > 0 ? Math.round((Math.min(done, total) * k) / total) : 0 // 11 blocks fill the 88px column
  return k ? `<g transform="translate(${n(x - (k * 8 - 2))} ${y})">${stepBlocks(d, k, tone)}</g>` : ''
}
const elapsed = (a: CrewAgent, now: number) => fmtClock((a.endedAt ?? now) - a.startedAt)
// Waiting and log ages read in whole minutes, so the image changes only when one crosses a minute.
const minutes = (ms: number) => (ms < 60_000 ? '<1m' : fmtAge(ms))
const waiting = (a: CrewAgent, now: number) => minutes(now - (a.waitingSince ?? a.startedAt))
const reading = (a: CrewAgent, now: number): Run[] =>
  a.eta.kind === 'left' ? [[fmtLeft(a.eta.minutes).replace(/ left$/, ''), a.eta.slow ? 'warn' : 'fg', 600], [' left', 'muted']]
    : a.eta.kind === 'over' ? [['slower', 'warn', 600]] : [[elapsed(a, now), 'fg', 600]]
const tagOf = (role: Role) => role.toUpperCase()
const tagWidth = (role: Role) => textWidth(tagOf(role), 10, 700) + tagOf(role).length * 0.6
const tag = (x: number, y: number, role: Role, cls: string) =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" font-size="10" font-weight="700" letter-spacing=".6">${tagOf(role)}</text>`
const activityRuns = (a: CrewAgent, now: number): Run[] => {
  const note: Run[] = a.struggling ? [[`${a.tries} failed tries · `, 'warn']] : a.eta.kind === 'over' || (a.eta.kind === 'left' && a.eta.slow) ? [['slower · ', 'warn']] : []
  const verb = clean(a.activity?.verb, 24), target = clean(a.activity?.target, 48) || (a.activity ? `${elapsed(a, now)} so far` : '')
  return [...note, ...(verb ? [[`${verb} `, 'fg'] as Run] : []), [target, 'muted']]
}

const head = (crew: Crew, W: number): El => {
  const title = clean(crew.title, 60), c = { ...crew.counts, need: alertsOf(crew).need }
  const part = (count: number, label: string, cls: string): Run[] => [[String(count), cls, 600], [` ${label}`, cls]]
  const counts: Run[] = [
    ...(c.need ? [...part(c.need, 'needs you', 'er'), [' · ', 'muted'] as Run] : []),
    ...(c.failed ? [...part(c.failed, 'failed', 'er'), [' · ', 'muted'] as Run] : []),
    ...part(c.running, 'running', 'fg'), [' · ', 'muted'], ...part(c.done, 'done', 'fg'),
  ]
  const tail: Run[] = [[` · ${fmtCost(crew.costUsd)}`, 'muted'], ...(crew.leftMin == null ? [] : [[` · ${fmtLeft(crew.leftMin)}`, 'muted'] as Run])]
  const segs: Seg[] = [
    ...crew.ended.map((a): Seg => ({ state: a.prop === 'fail' ? 'failed' : 'done', fill: 1 })),
    // A waiting helper needs you, so it gets a segment next to the top-level ones that do.
    ...[...crew.agents.filter(a => a.state === 'need'), ...crew.agents.flatMap(helpersOf).filter(h => h.state === 'need'), ...crew.agents.filter(a => a.state !== 'need')]
      .map((a): Seg => ({ state: a.state === 'need' ? 'need' : a.state === 'failed' ? 'failed' : 'live', role: a.role, fill: Math.max(0.08, a.stepTotal ? a.stepDone / a.stepTotal : 0) })),
  ]
  // A narrow pane puts the cost and the time left on a second line.
  const oneRow = runsWidth([...counts, ...tail], 12) <= W
  const sum = oneRow ? runs(0, 52, 12, [...counts, ...tail], W) : runs(0, 52, 12, counts, W) + runs(0, 68, 12, tail.map(([s, k]): Run => [s.replace(/^ · /, ''), k]).flatMap((r, i) => (i ? [[' · ', 'muted'] as Run, r] : [r])), W)
  const h = oneRow ? 60 : 76
  const body = text(0, 14, 'fg', 13, fit(title, W, 13, 600), { weight: 600 }) + (segs.length ? `<g transform="translate(0 26)">${segBar(segs, W, 'full')}</g>` : '') + sum
  return image('head', { source: doc(W, h, body), alt: `${title}: ${[...counts, ...tail].map(r => r[0]).join('')}`, width: n(W), height: h }, false)
}

const SECTION: Record<'need' | 'failed' | 'running' | 'ended', [label: string, cls: string]> =
  { need: ['Needs you', 'er'], failed: ['Failed', 'er'], running: ['Running', 'muted'], ended: ['Ended', 'muted'] }
const section = (item: Extract<PaneItem, { kind: 'section' }>, W: number): El => {
  const [label, cls] = SECTION[item.name], ended = item.name === 'ended'
  const rs: Run[] = [[label, cls, 600], ...(item.name === 'need' ? [] : [[` ${item.count}`, cls] as Run])]
  const body = (ended ? chevron(0, 13, 10, !item.shut) : '') + runs(ended ? 16 : 0, 22, 12, rs, W)
  const alt = rs.map(r => r[0]).join('') + (ended ? (item.shut ? ', folded' : ', open') : '')
  return image(ended ? 'ended' : `sec-${item.name}`, { source: doc(W, 28, body), alt, width: n(W), height: 28, ...(ended ? { press: 'ended' } : {}) }, false)
}

// A needs-you or failed row: one image, so the ring is one drawing with one clock.
const alertRow = (a: CrewAgent, ring: boolean, open: boolean, W: number, now: number): El => {
  const need = a.state === 'need', h = SIZE.needRow, textW = W - CRAB - GAP - GAP - READ - CHEV - PAD, rx = W - PAD - CHEV - GAP
  const msg = clean(need ? a.question : a.reason, 160) || (need ? 'needs you' : `failed after ${elapsed(a, now)}`)
  const tw = tagWidth(a.role), x = CRAB + GAP + tw + 4
  const lines = wrap(msg, textW - tw - 4, 12, 2, 600)
  const read = need
    ? text(rx, 24, 'er', 13, `waiting ${waiting(a, now)}`, { weight: 600, anchor: 'end' }) + blocks(rx, 32, a.stepDone, a.stepTotal, 'er')
    : text(rx, 20, 'er', 13, 'failed', { weight: 600, anchor: 'end' }) + text(rx, 36, 'fg', 12, `after ${elapsed(a, now)}`, { anchor: 'end' }) + blocks(rx, 42, a.stepDone, a.stepTotal, 'er')
  const ringArt = ring ? `<style>.ring{opacity:0;animation:ring ${MOTION.beat} infinite}@keyframes ring{50%{opacity:1}}</style><rect x="1" y="1" width="${n(W - 2)}" height="${h - 2}" rx="7" fill="none" class="s-ring60 ring" stroke-width="2"/>` : ''
  const body = `<rect x="0" y="0" width="${n(W)}" height="${h}" rx="8" class="needTint"/>${ringArt}`
    + text(CRAB + GAP, 19, 'fg', 13, fit(clean(a.title, 60), textW, 13, 600), { weight: 600 }) + tag(CRAB + GAP, 37, a.role, 'er')
    + lines.map((l, i) => text(x, 37 + i * 16, 'er', 12, l, { weight: 600 })).join('') + read + chevron(W - PAD - 14, 25, 12, open)
  const source = withCrab(doc(W, h, body, ring), crab({ role: a.role, prop: need ? 'wait' : 'fail', walk: false, size: 'M' }), 2, 17)
  const alt = `${clean(a.title, 60)} ${need ? `needs you: ${msg}` : `failed after ${elapsed(a, now)}: ${msg}`}`
  return image(`row-${a.id}`, { source, alt, width: n(W), height: h, press: `row:${a.id}`, hover: true }, ring)
}

const runningRow = (a: CrewAgent, walk: boolean, open: boolean, W: number, now: number): El => {
  const h = SIZE.row, BW = W - CRAB, textW = BW - GAP - GAP - READ - GAP - CHEV - PAD, rx = BW - PAD - CHEV - GAP, tw = tagWidth(a.role)
  const crabSvg = withCrab(svg(CRAB, h, ''), crab({ role: a.role, prop: a.prop, walk, size: 'M' }), 2, 10)
  const body = text(GAP, 20, 'fg', 13, fit(clean(a.title, 60), textW, 13, 600), { weight: 600 }) + tag(GAP, 38, a.role, `roleText-${a.role}`)
    + runs(GAP + tw + 4, 38, 12, activityRuns(a, now), textW - tw - 4) + runs(rx, 20, 13, reading(a, now), READ, 'end')
    + blocks(rx, 28, a.stepDone, a.stepTotal, a.role) + chevron(BW - PAD - 14, 18, 12, open)
  const press = `row:${a.id}`
  return { type: 'Box', props: { flexDirection: 'row' }, children: [
    image(`crab-${a.id}`, { source: crabSvg, alt: `${a.role} crab`, width: CRAB, height: h, press }, walk),
    image(`row-${a.id}`, { source: doc(BW, h, body), alt: `${clean(a.title, 60)}, ${reading(a, now).map(r => r[0]).join('')}`, width: n(BW), height: h, press, hover: true }, false),
  ] }
}

const drawer = (a: CrewAgent, W: number, now: number): El => {
  const x = CRAB + GAP + 12, textW = W - x - GAP - 38 - PAD, failed = a.prop === 'fail'
  // A line under a second old plays the one-shot: it fades in from the right while the older lines slide down by its height.
  const fresh = a.log.length > 0 && now - a.log[0].at < 1000
  let y = 6, body = '', row = 0
  a.log.slice(0, 30).forEach((l, i) => {
    const top = y, cls = failed && i === 0 ? 'er' : i === 0 ? 'fg' : 'muted', lines = wrap(clean(l.text, 120), textW, 12, 2, cls === 'er' ? 600 : 400)
    let entry = lines.map((s, k) => text(x, y + 13 + k * 17, cls, 12, s, cls === 'er' ? { weight: 600 } : {})).join('') + text(W - PAD, y + 13, 'muted', 11, minutes(now - l.at), { anchor: 'end' })
    y += lines.length * 17 + 6
    const err = failed && i === 0 ? clean(a.errorLine, 200) : ''
    if (err) {
      const per = Math.max(8, Math.floor((W - x - PAD - 16) / 6.6)), chunks = err.match(new RegExp(`.{1,${per}}`, 'g'))!  // monospace wraps anywhere
      entry += `<rect x="${n(x)}" y="${y}" width="${n(W - x - PAD)}" height="${chunks.length * 15 + 8}" rx="6" class="wash"/>`
        + chunks.map((c, k) => text(x + 8, y + 15 + k * 15, 'fg', 11, c, { family: MONO })).join('')
      y += chunks.length * 15 + 14
    }
    if (i === 0) row = y - top
    body += fresh ? `<g class="${i ? 'old' : 'nw'}">${entry}</g>` : entry
  })
  const foot: [string, string][] = [['steps', `${a.stepDone}/${a.stepTotal}`], ...(a.tries ? [['tries', String(a.tries)] as [string, string]] : []),
    ['context', `${a.contextPct}%`], ['cost', fmtCost(a.costUsd)], ...(failed ? [['ran', elapsed(a, now)] as [string, string]] : []),
    ...(a.usuallyMin == null ? [] : [['usually', `${a.usuallyMin}m`] as [string, string]])]
  body += `<rect x="${n(x)}" y="${y}" width="${n(W - x - PAD)}" height="1" class="track"/>`
  let fx = x; y += 16
  for (const [label, value] of foot) {
    const rs: Run[] = [[`${label} `, 'muted'], [value, 'fg', 600]], w = runsWidth(rs, 11)
    if (fx > x && fx + w > W - PAD) { fx = x; y += 15 }
    body += runs(fx, y, 11, rs, W - PAD - fx); fx += w + 12
  }
  const h = y + 8, line = `<rect x="${CRAB + GAP}" y="2" width="1.5" height="${h - 4}" class="track"/>`
  const ease = `${MOTION.revealMs}ms ${MOTION.curve}`
  // The reduced-motion rule comes last, after the one-shot it turns off.
  const oneShot = fresh ? `<style>.nw{animation:in ${ease} 100ms both}.old{animation:dn ${ease} both}@keyframes in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}@keyframes dn{from{transform:translateY(-${n(row)}px)}to{transform:none}}</style>${cssOf([], true)}` : ''
  return image(`drawer-${a.id}`, { source: doc(W, h, `${oneShot}${line}${body}`), alt: `${clean(a.title, 60)} log`, width: n(W), height: h }, false)
}

const helper = (a: CrewAgent, walk: boolean, depth: 1 | 2, W: number, now: number): El => {
  const h = SIZE.helperRow, failed = a.prop === 'fail', need = a.state === 'need', alert = failed || need, indent = (depth - 1) * INDENT, cw = HELPER_CRAB + indent
  const BW = W - cw, rx = BW - PAD - CHEV - GAP, textW = rx - HELPER_READ - GAP - GAP
  // The tint spans both images; each runs 8px past the seam, clipped there, so the band reads as one.
  const tint = (x: number, w: number) => (alert ? `<rect x="${x}" y="0" width="${n(w)}" height="${h}" rx="8" class="needTint"/>` : '')
  // A nested helper keeps its parent's tree line and reaches its indented crab with a longer branch.
  const tree = `${tint(20 + indent, HELPER_CRAB - 12)}<rect x="12" y="0" width="1.5" height="${h}" class="track"/><rect x="12" y="15.25" width="${9 + indent}" height="1.5" class="track"/>`
  const crabSvg = withCrab(svg(cw, h, tree), crab({ role: a.role, prop: a.prop, walk, size: 'S' }), 23.25 + indent, 5.5)
  const msg = alert ? clean(need ? a.question : a.reason, 160) || (need ? 'needs you' : 'failed') : ''
  const read: Run[] = need ? [[`waiting ${waiting(a, now)}`, 'er', 600]] : failed ? [['failed', 'er', 600]] : reading(a, now)
  // An alert keeps at least half the text width for its message, so a long title cannot push it out.
  const title = clean(a.title, 60), titleW = alert ? Math.max(textW / 2, textW - runsWidth([[` ${msg}`, '', 600]], 12)) : textW
  let what: string
  if (need) {
    // The question follows the title and wraps to a second line, cut there with an ellipsis.
    const t = `${fit(title, titleW, 12, 600)} `, [first, second] = wrap(t + msg, textW, 12, 2, 600), y0 = second ? 13 : 20
    what = `<text x="${GAP}" y="${y0}" font-size="12" font-weight="600"><tspan class="fg">${xml(t)}</tspan><tspan class="er">${xml(first.slice(t.length))}</tspan></text>`
      + (second ? text(GAP, y0 + 14, 'er', 12, second, { weight: 600 }) : '')
  } else {
    const rs: Run[] = failed ? [[msg, 'er', 600]] : activityRuns(a, now).map(([s, k]): Run => [s, k === 'fg' ? 'muted' : k])
    what = runs(GAP, 20, 12, [[fit(title, titleW, 12, 600), 'fg', 600], [' ', 'muted'], ...rs], textW)
  }
  const body = tint(-8, BW + 8) + what + runs(rx, 20, 12, read, need ? READ : HELPER_READ, 'end')  // "waiting 120m" may run into the gap before the column, never into the text
  const alt = `${title}, ${read.map(r => r[0]).join('')}${alert ? `: ${msg}` : ''}`
  return { type: 'Box', props: { flexDirection: 'row' }, children: [
    image(`crab-${a.id}`, { source: crabSvg, alt: `${a.role} crab`, width: cw, height: h }, walk),
    image(`helper-${a.id}`, { source: doc(BW, h, body), alt, width: n(BW), height: h }, false),
  ] }
}

const kids = (item: Extract<PaneItem, { kind: 'kids' }>, W: number): El => {
  const rs: Run[] = [[`${item.count} helpers`, 'muted'], ...(item.need ? [[` · ${item.need} needs you`, 'er'] as Run] : []), ...(item.failed ? [[` · ${item.failed} failed`, 'er'] as Run] : [])]
  const body = chevron(CRAB + GAP, 6, 10, !item.shut) + runs(CRAB + GAP + 16, 15, 11, rs, W - CRAB - GAP - 16)
  return image(`kids-${item.parentId}`, { source: doc(W, 22, body), alt: rs.map(r => r[0]).join('') + (item.shut ? ', folded' : ', open'), width: n(W), height: 22, press: `kids:${item.parentId}` }, false)
}

const endedRow = (a: CrewAgent, W: number, now: number): El => {
  const h = SIZE.endedRow, failed = a.prop === 'fail', status = failed ? `failed after ${elapsed(a, now)}` : elapsed(a, now), cls = failed ? 'er' : 'okText'
  const sw = textWidth(status, 12), ix = W - PAD - sw - 14, title = fit(clean(a.title, 60), ix - CRAB - GAP, 12)
  const body = text(CRAB, 19, 'muted', 12, title) + `<g transform="translate(${n(ix)} 10)">${icon(failed ? 'cross' : 'check', 10, `s-${cls}`)}</g>` + text(W - PAD, 19, cls, 12, status, { anchor: 'end' })
  const source = withCrab(doc(W, h, body), crab({ role: a.role, prop: failed ? 'fail' : 'done', walk: false, size: 'S' }), 1.25, 4.5)
  return image(`ended-${a.id}`, { source, alt: `${title} ${status}`, width: n(W), height: h }, false)
}

const drawItem = (item: PaneItem, W: number, now: number): El => {
  switch (item.kind) {
    case 'head': return head(item.crew, W)
    case 'section': return section(item, W)
    case 'row': return item.agent.state === 'need' || item.agent.state === 'failed' ? alertRow(item.agent, item.ring, item.open, W, now) : runningRow(item.agent, item.walk, item.open, W, now)
    case 'drawer': return drawer(item.agent, W, now)
    case 'helper': return helper(item.agent, item.walk, item.depth, W, now)
    case 'kids': return kids(item, W)
    case 'ended': return endedRow(item.agent, W, now)
    case 'more': return image(`more-${item.section}`, { source: doc(W, 22, text(CRAB + GAP, 15, 'muted', 12, `+${item.count} more`)), alt: `${item.count} more agents`, width: n(W), height: 22 }, false)
    case 'empty': {
      const [cw, ch] = SIZE.crab.L, x = (W - cw) / 2
      return image('empty', { source: withCrab(doc(W, 90, text(W / 2, 76, 'muted', 13, 'No agents yet', { anchor: 'middle' })), crab({ role: 'explore', prop: 'none', walk: false, size: 'L' }), x, 52 - ch), alt: 'No agents yet', width: n(W), height: 90 }, false)
    }
  }
}

// What the engine's text budget counts (savvy-progress's engineChars): a Client's props, an Svg's alt, keys, labels, strings.
const engineChars = (e: El | string): number => typeof e === 'string' ? e.length
  : e.type === 'Client' ? JSON.stringify(e.props ?? null).length : e.type === 'Svg' ? String(e.props?.alt ?? '').length
  : String(e.props?.key ?? '').length + String(e.props?.label ?? '').length + (e.children ?? []).reduce((s: number, c) => s + engineChars(c), 0)

// shortcut: measured at a reference width and clock, so wraps and ages may differ by a few characters from the drawn pane; the bounds keep a wide margin.
const COST_COLUMNS = 64
export const itemCost = (item: PaneItem): { host: number; engine: number } => {
  const el = drawItem(item, COST_COLUMNS * CELL_PX, 0)
  return { host: JSON.stringify(el).length, engine: engineChars(el) }
}

export const paneTree = (v: PaneView): El => {
  const W = v.columns * CELL_PX
  return { type: 'Box', props: { key: 'clawpit-pane', flexDirection: 'column' }, children: paneLayout(v.crew, v.ui, v.loops, itemCost).map(i => drawItem(i, W, v.now)) }
}
