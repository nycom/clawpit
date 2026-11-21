// The Agents pane as a plain RenderElement tree (design §8.2). Pure: no host imports.
import type { Crew, CrewAgent, LoopPlan, Role, SessionStat, Ui } from '../../types'
import { image, type El } from '../draw'
import { CELL_PX, FONT, MONO, MOTION, SIZE, cssOf, svg } from '../tokens'
import { clip, fit, fmtAge, fmtClock, fmtCost, fmtLeft, oneLine, textWidth, wrap, xml } from '../text'
import { icon, segBar, stepBlocks, type Seg } from '../icons'
import { crab } from '../crab'
import { alertsOf, helpersOf } from '../model'
import { paneLayout, type PaneItem } from './layout'

export type { El }
export type PaneView = { crew: Crew; ui: Ui; loops: LoopPlan; columns: number; now: number; session: SessionStat }

// The row's four columns: crab 38, title and activity, the 88px reading column, the chevron.
const CRAB = 38, READ = 88, CHEV = 16, GAP = 10, PAD = 8, HELPER_CRAB = 50, HELPER_READ = 72, INDENT = 14
const n = (v: number) => +v.toFixed(2)
const clean = (v: unknown, max: number) => clip(oneLine(v), max)
type Weight = 400 | 600 | 700
type Run = [text: string, cls: string, weight?: Weight]

const text = (x: number, y: number, cls: string, size: number, s: string, o: { weight?: Weight; anchor?: 'end' | 'middle'; family?: string } = {}) =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" font-size="${size}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.anchor ? ` text-anchor="${o.anchor}"` : ''}${o.family ? ` font-family="${o.family}"` : ''}>${xml(s)}</text>`
const runsWidth = (rs: Run[], size: number) => rs.reduce((w, [s, , wt]) => w + textWidth(s, size, wt ?? 400), 0)
const MIN_CUT = 8   // a cut fragment shorter than this reads as noise, so it is dropped
// Coloured runs on one line, cut with an ellipsis where they pass `maxW`. A short cut fragment goes, with the ' · ' before it.
// A run ending in ' · ' (a note such as "3 failed tries · ") is never cut: it drops its separator first, then goes whole.
const runs = (x: number, y: number, size: number, rs: Run[], maxW: number, anchor?: 'end') => {
  let left = maxW
  const out: Run[] = []
  for (const [s, cls, wt] of rs) {
    const w = textWidth(s, size, wt ?? 400)
    if (w <= left) { out.push([s, cls, wt]); left -= w; continue }
    if (s.endsWith(' · ')) { const bare = s.slice(0, -3); if (textWidth(bare, size, wt ?? 400) <= left) out.push([bare, cls, wt]); break }
    const cut = fit(s, left, size, wt ?? 400)
    if ([...cut.slice(0, -1).trim()].length >= MIN_CUT) out.push([cut, cls, wt])
    else if (out.length) { const [ps, pc, pw] = out[out.length - 1]; out[out.length - 1] = [ps.replace(/ · $/, ''), pc, pw] }
    break
  }
  const spans = out.filter(([s]) => s).map(([s, cls, wt]) => `<tspan class="${cls}"${wt && wt !== 400 ? ` font-weight="${wt}"` : ''}>${xml(s)}</tspan>`).join('')
  return `<text x="${n(x)}" y="${n(y)}" font-size="${size}"${anchor ? ` text-anchor="${anchor}"` : ''}>${spans}</text>`
}
// A cut text's full words, as a tooltip: a <title>, which screen readers read too; the image stays unframed so it keeps its press.
const TIP_MAX = 300
const withTip = (tip: string, cut: boolean, g: string) => (cut ? `<g><title>${xml(clean(tip, TIP_MAX))}</title>${g}</g>` : g)
const textOf = (rs: Run[]) => rs.map(r => r[0]).join('')
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
    : a.eta.kind === 'over' ? [['slower', 'warn', 600]] : [[elapsed(a, now), 'fg', 600], [' so far', 'muted']]
// The activity's full words, and whether drawing `rs` in `maxW` cuts them.
const activityLine = (a: CrewAgent, now: number, rs: Run[], maxW: number, size: number) => {
  const tip = textOf(activityRuns(a, now, true))
  return { tip, cut: runsWidth(rs, size) > maxW || textOf(activityRuns(a, now)) !== tip }
}
const tagOf = (role: Role) => role.toUpperCase()
const tagWidth = (role: Role) => textWidth(tagOf(role), 10, 700) + tagOf(role).length * 0.6
const tag = (x: number, y: number, role: Role, cls: string) =>
  `<text x="${n(x)}" y="${n(y)}" class="${cls}" font-size="10" font-weight="700" letter-spacing=".6">${tagOf(role)}</text>`
// `full`: the words before any clip, for the tooltip.
const activityRuns = (a: CrewAgent, now: number, full = false): Run[] => {
  const note: Run[] = a.struggling ? [[`${a.tries} failed tries · `, 'warn']] : a.eta.kind === 'over' || (a.eta.kind === 'left' && a.eta.slow) ? [['slower · ', 'warn']] : []
  const verb = clean(a.activity?.verb, full ? TIP_MAX : 24), target = clean(a.activity?.target, full ? TIP_MAX : 48) || (a.activity ? `${elapsed(a, now)} so far` : '')
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
  const msg = clean(need ? a.question : a.reason, TIP_MAX) || (need ? 'needs you' : `failed after ${elapsed(a, now)}`)
  const tw = tagWidth(a.role), x = CRAB + GAP + tw + 4
  const lines = wrap(msg, textW - tw - 4, 12, 2, 600)
  const read = need
    ? text(rx, 24, 'er', 13, `waiting ${waiting(a, now)}`, { weight: 600, anchor: 'end' }) + blocks(rx, 32, a.stepDone, a.stepTotal, 'er')
    : text(rx, 20, 'er', 13, 'failed', { weight: 600, anchor: 'end' }) + text(rx, 36, 'fg', 12, `after ${elapsed(a, now)}`, { anchor: 'end' }) + blocks(rx, 42, a.stepDone, a.stepTotal, 'er')
  const ringArt = ring ? `<style>.ring{opacity:0;animation:ring ${MOTION.beat} infinite}@keyframes ring{50%{opacity:1}}</style><rect x="1" y="1" width="${n(W - 2)}" height="${h - 2}" rx="7" fill="none" class="s-ring60 ring" stroke-width="2"/>` : ''
  const body = `<rect x="0" y="0" width="${n(W)}" height="${h}" rx="8" class="needTint"/>${ringArt}`
    + text(CRAB + GAP, 19, 'fg', 13, fit(clean(a.title, 60), textW, 13, 600), { weight: 600 }) + tag(CRAB + GAP, 37, a.role, 'er')
    + withTip(msg, lines.join(' ') !== msg, lines.map((l, i) => text(x, 37 + i * 16, 'er', 12, l, { weight: 600 })).join('')) + read + chevron(W - PAD - 14, 25, 12, open)
  const source = withCrab(doc(W, h, body, ring), crab({ role: a.role, prop: need ? 'wait' : 'fail', walk: false, size: 'M' }), 2, 17)
  const alt = `${clean(a.title, 60)} ${need ? `needs you: ${msg}` : `failed after ${elapsed(a, now)}: ${msg}`}`
  return image(`row-${a.id}`, { source, alt, width: n(W), height: h, press: `row:${a.id}`, hover: true }, ring)
}

const runningRow = (a: CrewAgent, walk: boolean, open: boolean, W: number, now: number): El => {
  const h = SIZE.row, BW = W - CRAB, textW = BW - GAP - GAP - READ - GAP - CHEV - PAD, rx = BW - PAD - CHEV - GAP, tw = tagWidth(a.role)
  const crabSvg = withCrab(svg(CRAB, h, ''), crab({ role: a.role, prop: a.prop, walk, size: 'M' }), 2, 10)
  const act = activityRuns(a, now), aw = textW - tw - 4, { tip, cut } = activityLine(a, now, act, aw, 12)
  const body = text(GAP, 20, 'fg', 13, fit(clean(a.title, 60), textW, 13, 600), { weight: 600 }) + tag(GAP, 38, a.role, `roleText-${a.role}`)
    + withTip(tip, cut, runs(GAP + tw + 4, 38, 12, act, aw)) + runs(rx, 20, 13, reading(a, now), READ, 'end')
    + blocks(rx, 28, a.stepDone, a.stepTotal, a.role) + chevron(BW - PAD - 14, 18, 12, open)
  const press = `row:${a.id}`
  return { type: 'Box', props: { flexDirection: 'row' }, children: [
    image(`crab-${a.id}`, { source: crabSvg, alt: `${a.role} crab`, width: CRAB, height: h, press }, walk),
    image(`row-${a.id}`, { source: doc(BW, h, body), alt: `${clean(a.title, 60)}, ${textOf(reading(a, now))}${cut ? `: ${clean(tip, TIP_MAX)}` : ''}`, width: n(BW), height: h, press, hover: true }, false),
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
  // Whole items per line; "usually" goes first, when it alone would take another line.
  const place = (items: [string, string][]) => {
    let fx = x, line = 0
    const at = items.map(([label, value]) => {
      const rs: Run[] = [[`${label} `, 'muted'], [value, 'fg', 600]], w = runsWidth(rs, 11)
      if (fx > x && fx + w > W - PAD) { fx = x; line += 1 }
      const p = { rs, fx, line }
      fx += w + 12
      return p
    })
    return { at, lines: line + 1 }
  }
  const full = place(foot), short = place(foot.filter(([label]) => label !== 'usually')), placed = full.lines > short.lines ? short : full
  y += 16
  for (const p of placed.at) body += runs(p.fx, y + p.line * 15, 11, p.rs, W - PAD - p.fx)
  y += (placed.lines - 1) * 15
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
  const msg = alert ? clean(need ? a.question : a.reason, TIP_MAX) || (need ? 'needs you' : 'failed') : ''
  const read: Run[] = need ? [[`waiting ${waiting(a, now)}`, 'er', 600]] : failed ? [['failed', 'er', 600]] : reading(a, now)
  // A question keeps at least half the text width, so a long title cannot push it out; any other helper keeps its title whole.
  const title = clean(a.title, 60), titleW = need ? Math.max(textW / 2, textW - runsWidth([[` ${msg}`, '', 600]], 12)) : textW
  let what: string, tip = msg, cut: boolean
  if (need) {
    // The question follows the title and wraps to a second line, cut there with an ellipsis.
    const t = `${fit(title, titleW, 12, 600)} `, lines = wrap(t + msg, textW, 12, 2, 600), [first, second] = lines, y0 = second ? 13 : 20
    cut = lines.join(' ') !== t + msg
    what = `<text x="${GAP}" y="${y0}" font-size="12" font-weight="600"><tspan class="fg">${xml(t)}</tspan><tspan class="er">${xml(first.slice(t.length))}</tspan></text>`
      + (second ? text(GAP, y0 + 14, 'er', 12, second, { weight: 600 }) : '')
  } else {
    const t: Run = [fit(title, titleW, 12, 600), 'fg', 600]
    const rs: Run[] = [[' ', 'muted'], ...(failed ? [[msg, 'er', 600] as Run] : activityRuns(a, now).map(([s, k]): Run => [s, k === 'fg' ? 'muted' : k]))]
    if (failed && runsWidth([t, ...rs], 12) > textW) {
      // A failed helper's reason shows only whole beside its title; when tight it wraps to a second line, cut there with an ellipsis.
      const reason = fit(msg, textW, 12, 600)
      cut = reason !== msg
      what = text(GAP, 13, 'fg', 12, t[0], { weight: 600 }) + text(GAP, 27, 'er', 12, reason, { weight: 600 })
    } else {
      if (failed) cut = false
      else ({ tip, cut } = activityLine(a, now, [t, ...rs], textW, 12))
      what = runs(GAP, 20, 12, [t, ...rs], textW)
    }
  }
  what = withTip(tip, cut, what)
  const body = tint(-8, BW + 8) + what + runs(rx, 20, 12, read, need ? READ : HELPER_READ, 'end')  // "waiting 120m" may run into the gap before the column, never into the text
  const alt = `${title}, ${textOf(read)}${alert ? `: ${msg}` : cut ? `: ${clean(tip, TIP_MAX)}` : ''}`
  return { type: 'Box', props: { flexDirection: 'row' }, children: [
    image(`crab-${a.id}`, { source: crabSvg, alt: `${a.role} crab`, width: cw, height: h }, walk),
    // A helper that waits on you is pressed to answer it: `ask:` puts it in the prompt. Helpers have no drawer.
    image(`helper-${a.id}`, { source: doc(BW, h, body), alt, width: n(BW), height: h, ...(need ? { press: `ask:${a.id}`, hover: true } : {}) }, false),
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
      const say = text(W / 2, 76, 'fg', 13, 'No agents yet', { anchor: 'middle' }) + text(W / 2, 94, 'muted', 12, 'Agents you start show up here', { anchor: 'middle' })
      return image('empty', { source: withCrab(doc(W, 104, say), crab({ role: 'explore', prop: 'none', walk: false, size: 'L' }), x, 52 - ch), alt: 'No agents yet. Agents you start show up here', width: n(W), height: 104 }, false)
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

// The costs view: a back row, then the session total and the last turns' costs, newest first. Finished figures are exact.
const usd = (v: number) => fmtCost(v).replace('≈', '')
const costsView = (s: SessionStat, W: number): El[] => {
  const back = `<g transform="translate(0 9) rotate(180 5 5)">${icon('chev', 10, 's-muted')}</g>` + runs(16, 18, 12, [['Agents', 'muted']], W - 16)
  const list = (s.turnCosts ?? []).map((c, i, all) => ({ turn: s.turns - (all.length - 1 - i), c })).reverse()
  const sum: Run[] = s.costUsd === null ? [['no reading yet', 'muted']] : [[usd(s.costUsd), 'fg', 600], [` · ${s.turns} turn${s.turns === 1 ? '' : 's'}`, 'muted']]
  // Under a section header, each amount right-aligns where the rows' reading column ends; only the total is bold.
  const rx = W - PAD - CHEV - GAP, header = text(0, 62, 'muted', 12, `Last ${list.length} turn${list.length === 1 ? '' : 's'}`, { weight: 600 })
  const rows = list.length ? header + list.map((r, i) => text(0, 84 + i * 20, 'muted', 12, `turn ${r.turn}`) + text(rx, 84 + i * 20, 'fg', 12, usd(r.c), { anchor: 'end' })).join('') : text(0, 62, 'muted', 12, 'No turns yet')
  const h = list.length ? 72 + list.length * 20 : 70
  const alt = `Session cost ${textOf(sum).replace(' · ', ', ')}${list.length ? `: ${list.map(r => `turn ${r.turn} ${usd(r.c)}`).join(', ')}` : ', no turns yet'}`
  return [
    image('back', { source: doc(W, 28, back), alt: 'Back to the agents', width: n(W), height: 28, press: 'crew', hover: true }, false),
    image('costs', { source: doc(W, h, text(0, 14, 'fg', 13, 'Session cost', { weight: 600 }) + runs(0, 34, 12, sum, W) + rows), alt, width: n(W), height: h }, false),
  ]
}

export const paneTree = (v: PaneView): El => {
  const W = v.columns * CELL_PX
  if (v.ui.view === 'costs') return { type: 'Box', props: { key: 'clawpit-pane', flexDirection: 'column' }, children: costsView(v.session, W) }
  return { type: 'Box', props: { key: 'clawpit-pane', flexDirection: 'column' }, children: paneLayout(v.crew, v.ui, v.loops, itemCost).map(i => drawItem(i, W, v.now)) }
}
