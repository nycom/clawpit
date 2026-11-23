import { test, expect } from 'claude-code/testing'
import type { BgRow, LoopPlan, SavvyRun } from '../types'
import { backgroundOf, bgHash, bgVisible, crewOf, alertsOf } from '../hooks/model'
import { paneLayout, ENGINE_MAX, HOST_MAX, type PaneItem } from '../hooks/pane/layout'
import { paneTree, shortSchedule, type El } from '../hooks/pane/draw'
import { minutes, textWidth } from '../hooks/text'
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

test('background: active rows newest started first, then failed, then ended; titles fall back to the kind word', () => {
  const rows = rowsOf()
  expect(rows.map(r => `${r.id}:${r.state}`)).toEqual(['wake:resume the release check:scheduled', 'b1:running', 'm1:running', 'c1:scheduled', 'b2:failed', 'b0:ended'])
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
  expect(bgVisible(rows, new Map(), 0).map(r => r.id)).toEqual(['wake:resume the release check', 'b1', 'm1', 'c1', 'b2'])
  expect(bgVisible(rows, new Map(), NOW - 5 * 60_000).map(r => r.id)).not.toContain('b2')
  // Stopped at its startedAt: hidden; the same id re-created with a new startedAt shows again.
  const stopped = new Map([['b1', NOW - 3 * 60_000]])
  expect(bgVisible(rows, stopped, 0).map(r => r.id)).not.toContain('b1')
  expect(bgVisible(rows, new Map([['b1', NOW - 99]]), 0).map(r => r.id)).toContain('b1')
})

test('background: the crew carries the active and failed counts and nothing else moves', () => {
  const plain = crewWith('hydra', []), crew = crewWith('hydra', shown())
  expect(crew.background).toEqual({ active: 4, failed: 1 })
  expect(plain.background).toBeUndefined()
  const { background, ...rest } = crew
  expect(rest).toEqual(plain); expect(alertsOf(crew)).toEqual(alertsOf(plain))
  expect(pickLoops(crew, STATES.hydra.ui, true, true)).toEqual(pickLoops(plain, STATES.hydra.ui, true, true))
  expect(crewWith('idle', []).background).toBeUndefined()
})

test('background: minutes read "<1m" under a minute, then whole minutes', () => {
  expect(minutes(59_000)).toBe('<1m'); expect(minutes(60_000)).toBe('1m'); expect(minutes(185_000)).toBe('3m')
})

// ---------- the layout ----------
const line = (i: PaneItem) => `${i.kind}${i.kind === 'section' ? `:${i.name}` : i.kind === 'bg' ? `:${i.row.id}` : i.kind === 'more' ? `:${i.section}` : ''}`

test('paneLayout: Background sits after Running and before Ended, with its count', () => {
  const items = paneLayout(crewWith('hydra', shown()), STATES.hydra.ui, noLoops, unit, null, shown())
  const l = items.map(line)
  expect(l.slice(l.indexOf('section:background'))).toEqual(['section:background', 'bg:wake:resume the release check', 'bg:b1', 'bg:m1', 'bg:c1', 'bg:b2', 'section:ended'])
  expect(l.indexOf('section:running')).toBeLessThan(l.indexOf('section:background'))
  expect(items.find(i => i.kind === 'section' && i.name === 'background')).toEqual({ kind: 'section', name: 'background', count: 5, failed: 1 })
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

test('pane: the Background section header reads its count, muted, and is not pressable', () => {
  const t = paneTree(bgView()), sec = find(t, 'sec-background')!
  expect(words(sec)).toBe('Background 5'); expect(sec.type).toBe('Svg'); expect(src(sec)).toContain('class="muted"')
})

test('pane: row alts read the title, the kind and the reading', () => {
  const t = paneTree(bgView())
  expect(alt(find(t, `bg-${h('b1')}`))).toBe('npm run dev -- --port 5173, shell, running 3m')
  expect(alt(find(t, `bg-${h('m1')}`))).toBe('watch the deploy logs, monitor, running 12m')
  expect(alt(find(t, `bg-${h('c1')}`))).toBe('check the CI queue, cron, every 10 minutes')
  expect(alt(find(t, `bg-${h('wake:resume the release check')}`))).toBe('resume the release check, wakeup, next in 5m')
  expect(alt(find(t, `bg-${h('b2')}`))).toBe('npm run build:docs, shell, failed after 2m')
})

test('pane: readings: minutes since start, a countdown that ceils and reads due, the schedule', () => {
  const t = paneTree(bgView())
  expect(words(find(t, `bg-${h('b1')}`))).toBe('npm run dev -- --port 5173 3m shell')
  // savvy's "every 10 minutes" is wider than the 88 px reading column: the reading is its short form, the tooltip and the alt keep it whole.
  expect(words(find(t, `bg-${h('c1')}`))).toBe('check the CI queue every 10m cron')
  expect(src(find(t, `bg-${h('c1')}`))).toContain('<title>every 10 minutes</title>'); expect(alt(find(t, `bg-${h('c1')}`))).toBe('check the CI queue, cron, every 10 minutes')
  const short = backgroundOf([{ id: 'c', kind: 'cron', text: 'poll', status: 'scheduled', startedAt: NOW, schedule: 'hourly' }])
  expect(words(find(paneTree({ ...bgView(), background: short }), `bg-${h('c')}`))).toBe('poll hourly cron')
  expect(src(find(paneTree({ ...bgView(), background: short }), `bg-${h('c')}`))).not.toContain('<title>')
  expect(words(find(t, `bg-${h('wake:resume the release check')}`))).toBe('resume the release check in 5m wakeup')
  const due = paneTree({ ...bgView(), now: NOW + 5 * 60_000 }), soon = paneTree({ ...bgView(), now: NOW + 4 * 60_000 + 30_000 })
  expect(words(find(due, `bg-${h('wake:resume the release check')}`))).toContain(' due ')
  expect(words(find(soon, `bg-${h('wake:resume the release check')}`))).toContain(' in 1m ')
})

test('pane: a failed row says failed in words beside its cross, has no Stop, and its row is still', () => {
  const t = paneTree(bgView()), row = find(t, `bg-${h('b2')}`)!
  expect(words(row)).toBe('npm run build:docs failed shell'); expect(src(row)).toContain(icon('cross', 12, 's-er').slice(0, 30))
  expect(find(t, `stop-${h('b2')}`)).toBeUndefined()
  expect(row.type).toBe('Svg'); expect(inner(row).width).toBe(52 * 8.5 - 24)
  // The alert row's title reads in fg, as the active rows' do.
  expect(src(row)).toContain('<text x="48" y="19" class="fg" font-size="12">npm run build:docs</text>')
})

test('pane: an active row is a row Box: a plain image beside its own Stop image', () => {
  const t = paneTree(bgView()), box = all(t).find(e => e.type === 'Box' && (e.children ?? []).some(c => typeof c !== 'string' && c.props?.key === `bg-${h('b1')}`))!
  const [row, stop] = box.children as El[]
  expect(box.props?.flexDirection).toBe('row')
  expect(row.type).toBe('Svg'); expect(inner(row).press).toBeUndefined(); expect(inner(row).width).toBe(52 * 8.5 - 24)
  expect(stop.type).toBe('Client'); expect(stop.props?.key).toBe(`stop-${h('b1')}`)
  // 24 px, the PAD and chevron slot: the square's centre is the chevron's, W - 16.
  expect(inner(stop)).toMatchObject({ press: `stop:${h('b1')}`, hover: true, alt: 'Stop npm run dev -- --port 5173', width: 24, height: 30 })
  expect(src(stop)).toContain(`<g transform="translate(2 9)">${stopSquare('muted')}</g>`)
  // The title sits on the agents' title x, CRAB + GAP.
  expect(src(row)).toContain('<text x="48" y="19" class="fg" font-size="12">npm run dev -- --port 5173</text>')
})

test('pane: kind icons are SVG paths, muted on active rows', () => {
  const t = paneTree(bgView())
  for (const [id, kind] of [['b1', 'shell'], ['m1', 'monitor'], ['c1', 'cron'], ['wake:resume the release check', 'wakeup']] as const)
    expect(src(find(t, `bg-${h(id)}`))).toContain(icon(kind, 12, 's-muted'))
  expect(src(find(t, `stop-${h('b1')}`))).toContain(stopSquare('muted'))
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

test('pane: at 28 to 64 cells a row\'s title and reading fit, the title never drops, and no lone ellipsis is drawn', () => {
  const long = backgroundOf([...BG_TASKS, { id: 'L', kind: 'cron', text: 'rebuild the search index for every docs page', status: 'scheduled', startedAt: NOW - 1, schedule: 'at 09:00 on weekdays except public holidays' }])
  const bad: string[] = []
  for (let columns = 28; columns <= 64; columns++) {
    const W = columns * 8.5, t = paneTree({ ...paneViewOf('background', { columns }), background: bgVisible(long, new Map(), 0) })
    for (const r of bgVisible(long, new Map(), 0)) {
      const e = find(t, `bg-${h(r.id)}`)!, texts = [...src(e).matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => unescape(m[1]))
      const title = texts[0]
      if (!title || title === '…' || (title.endsWith('…') && [...title.slice(0, -1).trim()].length < 8)) bad.push(`${columns} ${r.id}: title ${JSON.stringify(title)}`)
      for (const x of texts) if (x.endsWith('…') && [...x.slice(0, -1).trim()].length < 8) bad.push(`${columns} ${r.id}: ${JSON.stringify(x)}`)
      const reading = texts[1] ?? ''
      if (48 + textWidth(title, 12) + 10 + textWidth(reading, 12) > W - 34 + 0.5) bad.push(`${columns} ${r.id}: overflow ${JSON.stringify([title, reading])}`)
    }
  }
  expect(bad).toEqual([])
  // A schedule too long for the reading edge goes to the alt only; the reading shows the kind word.
  const t = paneTree({ ...paneViewOf('background', { columns: 28 }), background: bgVisible(long, new Map(), 0) }), row = find(t, `bg-${h('L')}`)!
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
  expect(src(row)).not.toContain('<title>'); expect(alt(row)).toBe('monitor, monitor, running 1m')
})

test('pane: the Background header counts every shown row, and its alt names the active and the failed', () => {
  const sec = find(paneTree(bgView()), 'sec-background')!
  expect(words(sec)).toBe('Background 5'); expect(alt(sec)).toBe('Background 5: 4 running or waiting, 1 failed')
  expect(alt(find(paneTree({ ...bgView(), background: shown().slice(0, 1) }), 'sec-background'))).toBe('Background 1')
})
