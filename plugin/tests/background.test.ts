import { test, expect } from 'claude-code/testing'
import type { BgRow, LoopPlan, SavvyRun } from '../types'
import { backgroundOf, bgHash, bgVisible, crewOf, alertsOf } from '../hooks/model'
import { paneLayout, ENGINE_MAX, HOST_MAX, type PaneItem } from '../hooks/pane/layout'
import { paneTree, shortSchedule, trackShare, type El } from '../hooks/pane/draw'
import { clockOf, minutes, textWidth } from '../hooks/text'
import { icon, stopSquare } from '../hooks/icons'
import { pickLoops } from '../hooks/loops'
import { BG_TASKS, ETA, NOW, STATES, USUALLY } from './fixtures/states'
import { paneViewOf } from './build-pane'

const all = (e: El | string): El[] => (typeof e === 'string' ? [] : [e, ...(e.children ?? []).flatMap(all)])
const find = (tree: El, key: string) => all(tree).find(e => (e.props?.key ?? '') === key)
const keys = (tree: El) => all(tree).map(e => String(e.props?.key ?? '')).filter(Boolean)
const inner = (e: El) => (e.type === 'Client' ? (e.props!.props as Record<string, unknown>) : e.props!)
const src = (e: El | undefined) => String(e ? inner(e).source : '')
const alt = (e: El | undefined) => String(e ? inner(e).alt : '')
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const words = (e: El | undefined) =>
  unescape(src(e).replace(/<style>.*?<\/style>/g, '').replace(/<title>.*?<\/title>/g, '').replace(/<\/text>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const noLoops: LoopPlan = { walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }
const unit = () => ({ host: 1, engine: 1 })
const rowsOf = () => backgroundOf(BG_TASKS)
const shown = () => bgVisible(rowsOf(), new Map(), 0)
const crewWith = (s: keyof typeof STATES, background: BgRow[]) =>
  crewOf({ ...STATES[s], etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' as const }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW, background })
const h = (id: string) => bgHash(id)

// ---------- the model ----------
test('background: a missing or malformed atom reads as no rows', () => {
  for (const v of [undefined, null, 3, 'x', {}, [null, 1, 'x', {}, { id: 3, kind: 'shell', startedAt: 1 }, { id: 'a', kind: 'agent', startedAt: 1 }, { id: 'a', kind: 'shell', startedAt: NaN }]])
    expect(backgroundOf(v)).toEqual([])
})

test('background: failed rows first, then running newest first, then waiting soonest due, a cron with no time last; titles fall back to the kind word', () => {
  const rows = rowsOf()
  expect(rows.map(r => `${r.id}:${r.state}`)).toEqual(['b2:failed', 'b1:running', 'm1:running', 'wake:resume the release check:scheduled', 'c1:scheduled', 'b0:ended'])
  const waits = backgroundOf([{ id: 'z', kind: 'cron', text: 'zeta', status: 'scheduled', startedAt: 1 }, { id: 'a', kind: 'cron', text: 'alpha', status: 'scheduled', startedAt: 2 },
    { id: 'w2', kind: 'wakeup', text: 'later', status: 'scheduled', startedAt: 1, nextAt: 900 }, { id: 'w1', kind: 'wakeup', text: 'sooner', status: 'scheduled', startedAt: 1, nextAt: 500 }])
  expect(waits.map(r => r.id)).toEqual(['w1', 'w2', 'a', 'z'])
  expect(backgroundOf([{ id: 'x', kind: 'monitor', text: '', status: 'running', startedAt: 1 }])[0].title).toBe('monitor')
  // An unknown status (savvy's "killed", or a word it adds later) reads as ended.
  expect(backgroundOf([{ id: 'x', kind: 'shell', text: 'a', status: 'killed', startedAt: 1 }])[0].state).toBe('ended')
})

test('background: the last entry per id wins', () => {
  const rows = backgroundOf([{ id: 'a', kind: 'shell', text: 'one', status: 'running', startedAt: 1 }, { id: 'a', kind: 'shell', text: 'two', status: 'failed', startedAt: 1, endedAt: 2 }])
  expect(rows.length).toBe(1); expect(rows[0]).toMatchObject({ title: 'two', state: 'failed', endedAt: 2 })
})

test('background: a 50 KB command is clipped to 60 characters for the title and to the tip bound for the tip', () => {
  const [r] = backgroundOf([{ id: 'a', kind: 'shell', text: 'x '.repeat(25_000), status: 'running', startedAt: 1 }])
  expect([...r.title].length).toBeLessThanOrEqual(60); expect([...r.tip].length).toBeLessThanOrEqual(300)
})

test('background: the hash is short, stable and differs per id', () => {
  expect(h('b1')).toBe(h('b1')); expect(h('b1')).not.toBe(h('b2')); expect(h('x'.repeat(10_000)).length).toBeLessThanOrEqual(7)
  expect(h('b1')).toMatch(/^[0-9a-z]+$/)
})

test('background: shown rows are the active ones not stopped, and failed ones that ended after the last prompt', () => {
  const rows = rowsOf()
  expect(bgVisible(rows, new Map(), 0).map(r => r.id)).toEqual(['b2', 'b1', 'm1', 'wake:resume the release check', 'c1'])
  expect(bgVisible(rows, new Map(), NOW - 5 * 60_000).map(r => r.id)).not.toContain('b2')
  // Stopped at its startedAt: hidden; the same id re-created with a new startedAt shows again.
  const stopped = new Map([['b1', NOW - 3 * 60_000]])
  expect(bgVisible(rows, stopped, 0).map(r => r.id)).not.toContain('b1')
  expect(bgVisible(rows, new Map([['b1', NOW - 99]]), 0).map(r => r.id)).toContain('b1')
})

test('background: the crew carries the running, waiting and failed counts, the next timed row and the lead kind; nothing else moves', () => {
  const plain = crewWith('hydra', []), crew = crewWith('hydra', shown())
  expect(crew.background).toEqual({ running: 2, waiting: 2, failed: 1, next: { kind: 'wakeup', nextAt: NOW + 7 * 60_000 }, lead: 'wakeup' })
  expect(plain.background).toBeUndefined()
  const { background, ...rest } = crew
  expect(rest).toEqual(plain); expect(alertsOf(crew)).toEqual(alertsOf(plain))
  expect(pickLoops(crew, STATES.hydra.ui, true, true)).toEqual(pickLoops(plain, STATES.hydra.ui, true, true))
  expect(crewWith('idle', []).background).toBeUndefined()
})

test('background: the lead icon is the next timed row\'s kind, else the newest running row\'s, else the first waiting row\'s, else failed', () => {
  const lead = (list: unknown[]) => crewWith('idle', bgVisible(backgroundOf(list), new Map(), 0)).background?.lead
  const run = (id: string, kind: string, startedAt: number) => ({ id, kind, text: id, status: 'running', startedAt })
  expect(lead([run('a', 'shell', 1), { id: 'c', kind: 'cron', text: 'c', status: 'scheduled', startedAt: 1, nextAt: 9 }])).toBe('cron')
  expect(lead([run('a', 'shell', 1), run('b', 'monitor', 2), { id: 'c', kind: 'cron', text: 'c', status: 'scheduled', startedAt: 1 }])).toBe('monitor')
  expect(lead([{ id: 'c', kind: 'cron', text: 'c', status: 'scheduled', startedAt: 1 }])).toBe('cron')
  expect(lead([{ id: 'f', kind: 'shell', text: 'f', status: 'failed', startedAt: 1, endedAt: 2 }])).toBe('failed')
  expect(crewWith('idle', bgVisible(backgroundOf([{ id: 'c', kind: 'cron', text: 'c', status: 'scheduled', startedAt: 1 }]), new Map(), 0)).background)
    .toEqual({ running: 0, waiting: 1, failed: 0, lead: 'cron' })
})

test('background: clock times read 24 h or 12 h with AM and PM, in ASCII, at a given offset', () => {
  const at = Date.UTC(2027, 0, 15, 14, 20)
  expect(clockOf(at, false, 0)).toBe('14:20'); expect(clockOf(at, true, 0)).toBe('2:20 PM')
  expect(clockOf(at, false, 120)).toBe('16:20'); expect(clockOf(at, false, -15 * 60)).toBe('23:20')
  expect(clockOf(Date.UTC(2027, 0, 15, 0, 5), true, 0)).toBe('12:05 AM'); expect(clockOf(Date.UTC(2027, 0, 15, 12, 59), true, 0)).toBe('12:59 PM')
  expect(clockOf(Date.UTC(2027, 0, 15, 9, 3), false, 0)).toBe('09:03'); expect(clockOf(NaN, false, 0)).toBe('')
})

test('background: a wakeup\'s track share is the wait used, clamped, and a share that is not a number counts as full', () => {
  expect(trackShare(5, 0, 10)).toBe(0.5); expect(trackShare(-5, 0, 10)).toBe(0); expect(trackShare(50, 0, 10)).toBe(1)
  expect(trackShare(5, 10, 10)).toBe(1); expect(trackShare(NaN, 0, 10)).toBe(1)
})

test('background: minutes read "<1m" under a minute, then whole minutes', () => {
  expect(minutes(59_000)).toBe('<1m'); expect(minutes(60_000)).toBe('1m'); expect(minutes(185_000)).toBe('3m')
})

// ---------- the layout ----------
const line = (i: PaneItem) => `${i.kind}${i.kind === 'section' ? `:${i.name}` : i.kind === 'bg' ? `:${i.row.id}` : i.kind === 'more' ? `:${i.section}` : ''}`

test('paneLayout: Background sits after Running and before Ended, with its count', () => {
  const items = paneLayout(crewWith('hydra', shown()), STATES.hydra.ui, noLoops, unit, null, shown())
  const l = items.map(line)
  expect(l.slice(l.indexOf('section:background'))).toEqual(['section:background', 'bg:b2', 'bg:b1', 'bg:m1', 'bg:wake:resume the release check', 'bg:c1', 'section:ended'])
  expect(l.indexOf('section:running')).toBeLessThan(l.indexOf('section:background'))
  // The header counts the active rows and names the failed apart.
  expect(items.find(i => i.kind === 'section' && i.name === 'background')).toEqual({ kind: 'section', name: 'background', count: 4, failed: 1 })
  // The hairline goes with the first waiting row, under rows that run or failed; with none above it, there is no line.
  expect(items.filter(i => i.kind === 'bg' && i.rule).map(line)).toEqual(['bg:wake:resume the release check'])
  const waiting = shown().filter(r => r.state === 'scheduled')
  expect(paneLayout(crewWith('idle', waiting), STATES.idle.ui, noLoops, unit, null, waiting).some(i => i.kind === 'bg' && i.rule)).toBe(false)
})

test('paneLayout: background alone draws the head and its section, not the empty state', () => {
  const items = paneLayout(crewWith('idle', shown()), STATES.idle.ui, noLoops, unit, null, shown())
  expect(items.map(line)).toEqual(['head', 'section:background', ...shown().map(r => `bg:${r.id}`)])
  expect(paneLayout(crewWith('idle', []), STATES.idle.ui, noLoops, unit, null, [])).toEqual([{ kind: 'empty' }])
})

test('paneLayout: background rows are cut into "+N more" within the bounds', () => {
  const many = backgroundOf(Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, kind: 'shell', text: `job ${i}`, status: 'running', startedAt: NOW - i })))
  const items = paneLayout(crewWith('manyAgents', many), STATES.manyAgents.ui, noLoops, () => ({ host: 4000, engine: 1800 }), null, many)
  expect(items.length * 4000).toBeLessThanOrEqual(HOST_MAX); expect(items.length * 1800).toBeLessThanOrEqual(ENGINE_MAX)
  const more = items.find(i => i.kind === 'more' && i.section === 'background')
  expect(more?.kind === 'more' && more.count + items.filter(i => i.kind === 'bg').length).toBe(100)
})

test('paneLayout: the setup offer is unaffected by background rows', () => {
  const offer = { key: 'k', label: 'l', question: 'q', yes: 'y', no: 'n', more: 0 }
  expect(paneLayout(crewWith('idle', shown()), STATES.idle.ui, noLoops, unit, offer, shown()).slice(0, 2).map(line)).toEqual(['head', 'offer'])
})

// ---------- the drawing ----------
const bgView = (columns = 52) => paneViewOf('background', { columns })

test('pane: an older savvy with no background atom draws the same tree', () => {
  for (const s of ['hydra', 'emptyPane', 'sessionNeed'] as const) expect(paneTree(paneViewOf(s, { background: [] }))).toEqual(paneTree(paneViewOf(s)))
})

const W52 = 52 * 8.5
const wake = h('wake:resume the release check')
const texts = (e: El | undefined) => [...src(e).replace(/<title>.*?<\/title>/g, '').matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => unescape(m[1]))

test('pane: the header reads the active count and names the failed apart in er; with only failed rows it has no count', () => {
  const sec = find(paneTree(bgView()), 'sec-background')!
  expect(words(sec)).toBe('Background 4 · 1 failed'); expect(sec.type).toBe('Svg'); expect(src(sec)).toMatch(/class="er"[^>]*> · 1 failed</)
  expect(alt(sec)).toBe('Background: 4 running or waiting, 1 failed')
  const failedOnly = shown().filter(r => r.state === 'failed'), only = find(paneTree({ ...bgView(), background: failedOnly }), 'sec-background')
  expect(words(only)).toBe('Background · 1 failed'); expect(alt(only)).toBe('Background: 1 failed')
  expect(alt(find(paneTree({ ...bgView(), background: shown().filter(r => r.state === 'running') }), 'sec-background'))).toBe('Background: 2 running or waiting')
})

test('pane: running rows read back (age, since), waiting rows read forward (in, at), a cron its short schedule, a failed row after', () => {
  const t = paneTree(bgView())
  expect(texts(find(t, `bg-${h('b1')}`))).toEqual(['npm run dev -- --port 5173', '3m', 'since 07:57'])
  expect(alt(find(t, `bg-${h('b1')}`))).toBe('npm run dev -- --port 5173, shell, running 3m, since 07:57')
  expect(alt(find(t, `bg-${h('m1')}`))).toBe('watch the deploy logs, monitor, running 12m, since 07:48')
  expect(texts(find(t, `bg-${wake}`))).toEqual(['resume the release check', 'in 7m', 'at 08:07'])
  expect(alt(find(t, `bg-${wake}`))).toBe('resume the release check, wakeup, in 7m, at 08:07')
  // savvy's "every 10 minutes" reads its short form, whole in the tooltip and the alt; line 2 is empty.
  expect(texts(find(t, `bg-${h('c1')}`))).toEqual(['check the CI queue', 'every 10m'])
  // A lone reading line sits on the title's baseline, centred in the row; two lines sit at 13 and 26.
  expect(src(find(t, `bg-${h('c1')}`))).toMatch(/<text x="[\d.]+" y="19" class="fg" font-size="12" text-anchor="end">every 10m<\/text>/)
  expect(src(find(t, `bg-${h('b1')}`))).toMatch(/<text x="[\d.]+" y="13" class="fg" font-size="12" text-anchor="end">3m<\/text>/)
  expect(src(find(t, `bg-${h('c1')}`))).toContain('<title>every 10 minutes</title>'); expect(alt(find(t, `bg-${h('c1')}`))).toBe('check the CI queue, cron, every 10 minutes')
  expect(texts(find(t, `bg-${h('b2')}`))).toEqual(['npm run build:docs', 'failed', 'after 2m'])
  expect(alt(find(t, `bg-${h('b2')}`))).toBe('npm run build:docs, shell, failed after 2m')
  // The kind word is gone from every row.
  for (const r of shown()) expect(texts(find(t, `bg-${r.h}`))).not.toContain(r.kind)
  // A wakeup that is due, a countdown that ceils, a 12-hour clock, a zone offset.
  const due = paneTree({ ...bgView(), now: NOW + 7 * 60_000 }), soon = paneTree({ ...bgView(), now: NOW + 6 * 60_000 + 30_000 })
  expect(texts(find(due, `bg-${wake}`)).slice(1)).toEqual(['due', 'at 08:07']); expect(texts(find(soon, `bg-${wake}`))[1]).toBe('in 1m')
  expect(texts(find(paneTree({ ...bgView(), hour12: true, offsetMin: 120 }), `bg-${wake}`))[2]).toBe('at 10:07 AM')
})

test('pane: a cron with a next time reads like a wakeup over its schedule, with no track', () => {
  const rows = backgroundOf([{ id: 'c', kind: 'cron', text: 'poll', status: 'scheduled', startedAt: NOW - 6 * 60_000, nextAt: NOW + 4 * 60_000, schedule: 'every 10 minutes' }])
  const row = find(paneTree({ ...bgView(), background: rows }), `bg-${h('c')}`)!
  expect(texts(row)).toEqual(['poll', 'in 4m', 'every 10m']); expect(alt(row)).toBe('poll, cron, in 4m, every 10 minutes')
  expect(src(row)).not.toContain('height="2"')
  const hourly = backgroundOf([{ id: 'c', kind: 'cron', text: 'poll', status: 'scheduled', startedAt: NOW, schedule: 'hourly' }])
  const plain = find(paneTree({ ...bgView(), background: hourly }), `bg-${h('c')}`)!
  expect(texts(plain)).toEqual(['poll', 'hourly']); expect(src(plain)).not.toContain('<title>')
})

test('pane: a wakeup draws a still 2 px track under its title, filled in muted by the wait used', () => {
  const t = paneTree(bgView()), s0 = src(find(t, `bg-${wake}`))
  const track = /<rect x="48" y="24" width="([\d.]+)" height="2" rx="1" class="track"\/>/.exec(s0), fill = /<rect x="48" y="24" width="([\d.]+)" height="2" rx="1" class="muted"\/>/.exec(s0)
  expect(s0).not.toContain('class="accent"')
  expect(track).not.toBeNull(); expect(fill).not.toBeNull()
  // Set 10 minutes ago, due in 7: 10 of 17 used.
  expect(Math.abs(+fill![1] - +track![1] * 10 / 17)).toBeLessThan(0.02)
  expect(s0).not.toMatch(/animation|transition/)
  for (const id of ['b1', 'm1', 'c1', 'b2']) expect(src(find(t, `bg-${h(id)}`))).not.toContain('height="2"')
})

test('pane: a failed row is a row Box like the active ones: its image and a slot that ends the tint, with no Stop and no press', () => {
  const t = paneTree(bgView()), box = all(t).find(e => e.type === 'Box' && (e.children ?? []).some(c => typeof c !== 'string' && c.props?.key === `bg-${h('b2')}`))!
  const [row, slot] = box.children as El[]
  expect(box.props?.flexDirection).toBe('row'); expect(row.type).toBe('Svg'); expect(inner(row).width).toBe(W52 - 28)
  expect(slot.type).toBe('Svg'); expect(slot.props?.key).toBe(`slot-${h('b2')}`); expect(inner(slot)).toMatchObject({ width: 28, height: 30 }); expect(inner(slot).press).toBeUndefined()
  // The tint runs 8 px past each seam, clipped there, so the two images read as one rounded row.
  expect(src(row)).toContain(`<rect x="0" y="0" width="${W52 - 28 + 8}" height="30" rx="8" class="needTint"/>`)
  expect(src(slot)).toContain('<rect x="-8" y="0" width="36" height="30" rx="8" class="needTint"/>')
  expect(src(row)).toContain(icon('cross', 12, 's-er')); expect(find(t, `stop-${h('b2')}`)).toBeUndefined()
  expect(src(row)).toContain('<text x="48" y="19" class="fg" font-size="12">npm run build:docs</text>')
  // "failed" ends on the shared reading edge, W - 34, as every other reading does.
  expect(src(row)).toContain(`<text x="${W52 - 34}" y="13" class="er" font-size="12" font-weight="600" text-anchor="end">failed</text>`)
  expect(src(find(t, `bg-${h('b1')}`))).toContain(`<text x="${W52 - 34}" y="13" class="fg" font-size="12" text-anchor="end">3m</text>`)
})

// The x a row's title text starts at in the pane, from the drawn tree: its image's offset in its row Box plus the text's own x.
const titleX = (tree: El, key: string): number => {
  const box = all(tree).find(e => e.type === 'Box' && e.props?.flexDirection === 'row' && (e.children ?? []).some(c => typeof c !== 'string' && c.props?.key === key))
  const kids = (box?.children ?? []) as El[], at = kids.findIndex(c => c.props?.key === key)
  const before = kids.slice(0, at).reduce((x, c) => x + Number(inner(c).width), 0), img = at >= 0 ? kids[at] : find(tree, key)!
  return before + Number(/<text x="([\d.]+)"/.exec(src(img).replace(/<style>.*?<\/style>/g, ''))![1])
}
test('pane: on the drawn tree, every background title starts where the top-level agents\' titles do, running and failed alike', () => {
  for (const columns of [28, 41, 52]) {
    const v = paneViewOf('backgroundCrew', { columns }), t = paneTree(v), agent = titleX(t, 'row-imp')
    expect(agent).toBe(48)
    for (const r of v.background!) expect(`${columns} ${r.id}: ${titleX(t, `bg-${r.h}`)}`).toBe(`${columns} ${r.id}: ${agent}`)
    // A failed agent row draws its crab inside its own image (withCrab): its title starts there too.
    const f = paneTree(paneViewOf('failed', { columns }))
    expect(titleX(f, 'row-e2e')).toBe(agent)
  }
})

test('pane: an active row is a plain image beside its Stop: a 20 px wash box with radius 6 and the filled square, centred on the chevron', () => {
  const t = paneTree(bgView()), box = all(t).find(e => e.type === 'Box' && (e.children ?? []).some(c => typeof c !== 'string' && c.props?.key === `bg-${h('b1')}`))!
  const [row, stop] = box.children as El[]
  expect(box.props?.flexDirection).toBe('row')
  expect(row.type).toBe('Svg'); expect(inner(row).press).toBeUndefined(); expect(inner(row).width).toBe(W52 - 28)
  expect(stop.type).toBe('Client'); expect(stop.props?.key).toBe(`stop-${h('b1')}`)
  // 28 px: the box spans 2 to 22, so its centre is the image's x 12, global W - 16: the chevron's centre.
  expect(inner(stop)).toMatchObject({ press: `stop:${h('b1')}`, hover: true, alt: 'Stop npm run dev -- --port 5173', width: 28, height: 30 })
  expect(src(stop)).toContain('<rect x="2" y="5" width="20" height="20" rx="6" class="wash"/>'); expect(src(stop)).toContain(`<g transform="translate(6 9)">${stopSquare('muted')}</g>`)
  expect(src(row)).toContain('<text x="48" y="19" class="fg" font-size="12">npm run dev -- --port 5173</text>')
})

test('pane: the hairline spans the first waiting row\'s image and its Stop, at their top edge', () => {
  const t = paneTree(bgView())
  expect(src(find(t, `bg-${wake}`))).toContain(`<rect x="0" y="0" width="${W52 - 28}" height="1" class="track"/>`)
  expect(src(find(t, `stop-${wake}`))).toContain('<rect x="0" y="0" width="28" height="1" class="track"/>')
  for (const id of ['b1', 'm1', 'c1']) expect(src(find(t, `stop-${h(id)}`))).not.toContain('height="1"')
})

test('pane: kind icons are SVG paths, muted: a repeat cycle for a cron, an hourglass for a wakeup', () => {
  const t = paneTree(bgView())
  for (const [id, kind] of [['b1', 'shell'], ['m1', 'monitor'], ['c1', 'cron'], ['wake:resume the release check', 'wakeup']] as const)
    expect(src(find(t, `bg-${h(id)}`))).toContain(icon(kind, 12, 's-muted'))
})

test('pane: a cut title carries its full text in a <title> and in the alt; an uncut one has none', () => {
  const text = 'node scripts/serve.mjs --port 5173 --host 0.0.0.0 --open --watch src --watch tests'
  const rows = backgroundOf([{ id: 'x', kind: 'shell', text, status: 'running', startedAt: NOW - 60_000 }])
  const t = paneTree({ ...paneViewOf('background', { columns: 30 }), background: rows }), row = find(t, `bg-${h('x')}`)!
  expect(src(row)).toContain(`<title>${text}</title>`); expect(alt(row)).toContain(`: ${text}`)
  expect(src(find(paneTree(bgView()), `bg-${h('b1')}`))).not.toContain('<title>')
})

test('pane: background rows draw no animation and add no loop', () => {
  for (const s of ['background', 'backgroundCrew'] as const) {
    const v = paneViewOf(s)
    for (const e of all(paneTree(v)).filter(x => String(x.props?.key ?? '').match(/^(bg|stop)-|^sec-background$/))) expect(src(e)).not.toMatch(/animation|infinite|transition/)
  }
})

test('pane: at 28 to 64 cells a row\'s title and both reading lines fit, line 2 drops first, the title never drops, and no lone ellipsis is drawn', () => {
  const long = backgroundOf([...BG_TASKS, { id: 'L', kind: 'cron', text: 'rebuild the search index for every docs page', status: 'scheduled', startedAt: NOW - 1, schedule: 'at 09:00 on weekdays except public holidays' },
    { id: 'T', kind: 'wakeup', text: 'resume the long release check for every package in the repo', status: 'scheduled', startedAt: NOW - 60_000, nextAt: NOW + 50 * 60_000 }])
  const rows = bgVisible(long, new Map(), 0), bad: string[] = []
  for (let columns = 28; columns <= 64; columns++) for (const hour12 of [false, true]) {
    const W = columns * 8.5, t = paneTree({ ...paneViewOf('background', { columns }), background: rows, hour12 })
    for (const r of rows) {
      const e = find(t, `bg-${h(r.id)}`)!, [title, l1 = '', l2 = ''] = texts(e)
      if (!title || title === '…' || (title.endsWith('…') && [...title.slice(0, -1).trim()].length < 8)) bad.push(`${columns} ${r.id}: title ${JSON.stringify(title)}`)
      for (const x of texts(e)) if (x.endsWith('…') && [...x.slice(0, -1).trim()].length < 8) bad.push(`${columns} ${r.id}: ${JSON.stringify(x)}`)
      if (l2 && !l1) bad.push(`${columns} ${r.id}: line 2 without line 1`)
      if (l1 && 48 + textWidth(title, 12) + 10 + Math.max(textWidth(l1, 12, r.state === 'failed' ? 600 : 400), textWidth(l2, 10)) > W - 34 + 0.5) bad.push(`${columns} ${r.id}: overflow ${JSON.stringify([title, l1, l2])}`)
      // The track ends where the reading starts.
      const tr = /<rect x="48" y="24" width="([\d.]+)" height="2" rx="1" class="track"\/>/.exec(src(e))
      if (tr && l1 && 48 + +tr[1] > W - 34 - Math.max(textWidth(l1, 12), textWidth(l2, 10)) - 10 + 0.5) bad.push(`${columns} ${r.id}: track runs under the reading`)
      if (tr && !l1) bad.push(`${columns} ${r.id}: a track under a title that runs over its reading`)
    }
  }
  expect(bad).toEqual([])
  // A schedule too long for the reading edge goes to the alt and the tooltip only; the reading shows the kind word.
  const t = paneTree({ ...paneViewOf('background', { columns: 28 }), background: rows }), row = find(t, `bg-${h('L')}`)!
  expect(words(row)).not.toContain('public holidays'); expect(alt(row)).toContain('at 09:00 on weekdays except public holidays')
  expect(src(row)).toContain('<title>at 09:00 on weekdays except public holidays</title>')
})

test('pane: the more line for background names background tasks', () => {
  const many = backgroundOf(Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, kind: 'shell', text: `job ${i}`, status: 'running', startedAt: NOW - i })))
  const v = paneViewOf('manyAgents', { background: many })
  const more = find(paneTree(v), 'more-background')
  expect(alt(more)).toMatch(/^\d+ more background tasks$/)
})

test('pane: the head is drawn as today with no agents and the crew bar is unchanged beside background rows', () => {
  expect(find(paneTree(paneViewOf('backgroundCrew', { background: [] })), 'head')).toEqual(find(paneTree(paneViewOf('backgroundCrew')), 'head'))
  expect(words(find(paneTree(bgView()), 'head'))).toBe('Subagents 0 running · 0 done · ≈$0.00')
  expect(keys(paneTree(bgView()))).not.toContain('empty')
})

test('pane: a cron schedule reads its short form; an unknown one is kept as it is', () => {
  const table: [string, string][] = [['every 5 minutes', 'every 5m'], ['every 10 minutes', 'every 10m'], ['Every 1 minute', 'every 1m'], ['every hour', 'hourly'],
    ['hourly', 'hourly'], ['every 2 hours', 'every 2h'], ['every 1 hour', 'every 1h'], ['every day', 'daily'], ['daily', 'daily'], ['at 09:00 on weekdays', 'at 09:00 on weekdays']]
  for (const [long, short] of table) expect(`${long} -> ${shortSchedule(long)}`).toBe(`${long} -> ${short}`)
})

test('pane: a row with no text reads its kind word with no tooltip and no trailing colon', () => {
  const rows = backgroundOf([{ id: 'e', kind: 'monitor', text: '', status: 'running', startedAt: NOW - 60_000 }])
  const row = find(paneTree({ ...bgView(), background: rows }), `bg-${h('e')}`)!
  expect(src(row)).not.toContain('<title>'); expect(alt(row)).toBe('monitor, monitor, running 1m, since 07:59')
})
