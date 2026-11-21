import { test, expect } from 'claude-code/testing'
import type { CrewAgent, PlanTask } from '../types'
import { image, panelTree, type El } from '../hooks/panel/draw'
import { contrast, SURFACE, TOKENS } from '../hooks/tokens'
import { NOW, type StateName } from './fixtures/states'
import { panelLoopCount, viewOf } from './build'

const all = (e: El | string): El[] => (typeof e === 'string' ? [] : [e, ...(e.children ?? []).flatMap(all)])
const keyOf = (e: El) => e.props?.key as string | undefined
const find = (t: El, key: string) => all(t).find(e => keyOf(e) === key)
const keys = (e: El | undefined) => (e?.children ?? []).flatMap(c => (typeof c === 'string' ? [] : [keyOf(c) ?? '']))
const isImage = (e: El) => e.type === 'Svg' || e.type === 'Client'
const images = (t: El) => all(t).filter(isImage)
const clients = (t: El) => all(t).filter(e => e.type === 'Client').map(e => e.props)
const propsOf = (e: El) => (e.type === 'Client' ? e.props!.props : e.props) as { source: string; alt: string; width: number; press?: string }
// The first image at or under a key: a column is a Box holding its image, a chip is the image itself.
const imgOf = (t: El, key: string) => { const e = find(t, key); return e ? all(e).find(isImage) : undefined }
const sourceOf = (t: El, key: string) => { const e = imgOf(t, key); return e ? propsOf(e).source : '' }
// The words a drawing shows: its markup without the styles, the tooltips and the tags.
const words = (src: string) => src.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<[^>]+>/g, '')
const cols = (t: El) => keys(find(t, 'cols')).filter(k => k.startsWith('col-'))
const gauges = (s: StateName) => { const v = viewOf(s); return viewOf(s, { ui: { ...v.ui, size: 'gauges' } }) }

// Tags open and close in order; no stray '<', '>' or bare '&' is left in the text.
const wellFormed = (src: string): boolean => {
  const stack: string[] = []
  for (const m of src.replace(/<style>[\s\S]*?<\/style>/g, '').matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^<>]*?(\/?)>/g)) {
    if (m[1]) { if (stack.pop() !== m[2]) return false } else if (!m[3]) stack.push(m[2])
  }
  const text = src.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
  return stack.length === 0 && !/[<>]/.test(text) && !/&(?!(amp|lt|gt|quot|apos);)/.test(text)
}
const SHOTS: StateName[] = ['idle', 'busy', 'hydra', 'needsYou', 'failed', 'both', 'context90', 'limitAhead', 'sizeGauges', 'sizeLine', 'codeColumns', 'manyAgents']

test('panel: full size is columns, then the plan, then the chips', () => {
  const t = panelTree(viewOf('hydra'))
  expect(t.type).toBe('Box'); expect(keyOf(t)).toBe('clawpit-panel')
  expect(keys(t)).toEqual(['cols', 'plan-line', 'plan-bar', 'chips'])
  expect(keys(find(t, 'cols')).at(-1)).toBe('toggle')
  expect(propsOf(find(t, 'toggle')!)).toMatchObject({ press: 'size', width: 24, height: 24 })
})

test('panel: gauges size has no plan row and no chips, and has the plan and agents columns', () => {
  const t = panelTree(gauges('hydra'))
  expect(keys(t)).toEqual(['cols'])
  expect(cols(t)).toContain('col-plan'); expect(cols(t).at(-1)).toBe('col-agents')
  expect(keys(find(t, 'col-agents'))).toEqual(['mascot'])
  expect(propsOf(find(t, 'mascot')!).press).toBe('open')
})

test('panel: one line holds context, the hot limits, the plan mini bar and the crab last', () => {
  const t = panelTree(viewOf('sizeLine'))
  expect(keys(t)).toEqual(['line'])
  expect(keys(find(t, 'line')).filter(k => k && k !== 'toggle')).toEqual(['col-context', 'col-7d', 'col-plan', 'mascot'])
  expect(keys(find(t, 'line')).at(-1)).toBe('toggle')
  expect(sourceOf(t, 'toggle')).toContain('class="er"')
})

test('panel: no plan and line size shows the session cost', () => {
  const v = viewOf('busy'), t = panelTree(viewOf('busy', { ui: { ...v.ui, size: 'line' } }))
  expect(keys(find(t, 'line')).filter(k => k.startsWith('col-'))).toEqual(['col-context', 'col-7d', 'col-session'])
  expect(words(sourceOf(t, 'col-session'))).toContain('$267')
})

test('panel: the column count follows the cells', () => {
  expect(cols(panelTree(viewOf('hydra', { bodyColumns: 46 }))).length).toBe(3)
  expect(cols(panelTree(viewOf('hydra', { bodyColumns: 88 }))).length).toBe(6)
  // Below 50% context, so no compact chip widens the context column: it takes the one cell its whole so-what needs over the share.
  const v = viewOf('hydra'), box = find(panelTree(viewOf('hydra', { bodyColumns: 88, stats: { ...v.stats, context: { ...v.stats.context!, pct: 40 } } })), 'col-context')!
  expect(box.props!.width).toBe(15); expect(propsOf(imgOf(box, 'col-context')!).width).toBe(15 * 8.5)
})

const atContext = (pct: number, alarm = false, bodyColumns = 96) => { const v = viewOf('hydra'); return panelTree(viewOf('hydra', { bodyColumns, stats: { ...v.stats, context: { ...v.stats.context!, pct, alarm } } })) }
const chipOf = (t: El) => { const c = find(find(t, 'col-context')!, 'compact'); return c ? (c.props!.props as { source: string; alt: string; width: number; height: number; press?: string; hover?: boolean }) : undefined }
const chipFits = (t: El) => {
  const box = find(t, 'col-context')!, at = find(box, 'compact-at')!.props!.left as number
  return at + Math.ceil(chipOf(t)!.width / 8.5) <= (box.props!.width as number)
}
test('panel: from 50% context a compact chip sits in the context column, its own pressable Client, inside the divider', () => {
  expect(find(atContext(49), 'compact')).toBeUndefined()
  for (const t of [atContext(50), panelTree(viewOf('hydra')), panelTree(viewOf('context90'))]) {
    const col = find(t, 'col-context')!, chip = find(col, 'compact')!
    expect(chip.type).toBe('Client'); expect(chipOf(t)).toMatchObject({ press: 'compact', hover: true, height: 18 })
    // No extra row; the image fills the column and keeps its one press, with no zone that could run /compact.
    expect(keys(t)).not.toContain('compact')
    const img = propsOf(imgOf(col, 'col-context')!) as { width: number; press?: string; zones?: unknown }
    expect(img.width).toBe((col.props!.width as number) * 8.5); expect(img.press).toBe('context'); expect(img.zones).toBeUndefined()
    expect(find(col, 'compact-at')!.props).toMatchObject({ position: 'absolute', top: 1 })
  }
  // The chip's cells fit inside the context column; the columns still fit the body beside the toggle.
  for (const bodyColumns of [46, 60, 88, 96, 140]) for (const [pct, alarm] of [[60, false], [88, false], [96, true]] as const) {
    const t = atContext(pct, alarm, bodyColumns), ws = cols(t).map(k => find(t, k)!.props!.width as number)
    expect([bodyColumns, pct, chipFits(t)]).toEqual([bodyColumns, pct, true])
    expect(ws.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(bodyColumns - 4)
  }
  const ctx = sourceOf(panelTree(viewOf('context90')), 'col-context')
  expect(words(ctx)).toContain('auto-compacts at 97%'); expect(ctx).toMatch(/class="er"[^>]*>92%</)
})

test('panel: the chip icon takes the context dial\'s tone; the word stays "compact" at one width', () => {
  const widths = new Set<number>()
  for (const [pct, alarm, tone] of [[55, false, 'accent'], [75, false, 'warn'], [92, true, 'er']] as const) {
    const t = atContext(pct, alarm), chip = chipOf(t)!
    expect(chip.source).toContain(`<path class="s-${tone}"`)
    expect(sourceOf(t, 'col-context')).toContain(`class="s-${tone}"`)
    expect(words(chip.source)).toBe('compact')
    widths.add(chip.width)
  }
  expect(widths.size).toBe(1)
})

test('panel: at rest the chip word is muted 400 on the wash; in alarm er 600 on needTint', () => {
  const rest = chipOf(atContext(60))!, alarm = chipOf(atContext(92, true))!
  expect(rest.source).toContain('class="wash"'); expect(rest.source).toMatch(/<text class="muted"[^>]*font-size="11">compact</)
  expect(alarm.source).toContain('class="needTint"'); expect(alarm.source).toMatch(/<text class="er"[^>]*font-size="11" font-weight="600">compact</)
  expect(rest.alt).toBe('Compact context: runs /compact')
  expect(alarm.alt).toBe('Compact context now: auto-compacts at 97%')
  // needTint laid over the surface, then er on it: at least 4.5:1 in both modes.
  const over = (rgba: string, bg: string) => {
    const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number), n = parseInt(bg.slice(1), 16)
    return '#' + [r, g, b].map((c, i) => Math.round(c * a + ((n >> (16 - 8 * i)) & 255) * (1 - a)).toString(16).padStart(2, '0')).join('')
  }
  for (const m of ['dark', 'light'] as const) expect(contrast(TOKENS.er[m], over(TOKENS.needTint[m], SURFACE[m]))).toBeGreaterThanOrEqual(4.5)
})

test('panel: where the column cannot give the chip its cells, the chip is the icon alone', () => {
  const t = atContext(60, false, 30), chip = chipOf(t)!
  expect(chip.width).toBe(20); expect(words(chip.source)).toBe(''); expect(chip.source).toContain('<path class="s-accent"')
  expect(chipFits(t)).toBe(true)
  expect(chip.alt).toBe('Compact context: runs /compact')
  // Nor does the whole chip take a warning's first clause: there the chip is its icon and the 7d warning stays.
  const code = panelTree(viewOf('codeColumns', { bodyColumns: 60 }))
  expect(chipOf(code)!.width).toBe(20); expect(lastText(sourceOf(code, 'col-7d'))).toBe('on pace for 131%')
})

test('panel: a looping client has the same props one second later', () => {
  const a = clients(panelTree(viewOf('needsYou'))), b = clients(panelTree(viewOf('needsYou', { now: NOW + 1000 })))
  expect(b).toEqual(a); expect(a.length).toBeGreaterThan(0)
})

test('panel: alert chips share one client; every chip, still ones too, is a Client that opens the pane', () => {
  const t = panelTree(viewOf('both')), alert = find(t, 'chips-alert')!
  expect(alert.type).toBe('Client')
  expect(all(find(t, 'chips')!).filter(isImage).map(keyOf)[0]).toBe('chips-alert')
  expect(find(t, 'chip-pln')).toBeUndefined(); expect(find(t, 'chip-e2e')).toBeUndefined()
  expect(words(propsOf(alert).source)).toContain('Ship the release notes'); expect(words(propsOf(alert).source)).toContain('Could not reach Postgres')
  const v = viewOf('hydra'), h = panelTree(v)
  const still = v.crew.agents.find(a => a.state === 'running' && !v.loops.walkers.includes(a.id))!
  for (const id of [still.id, ...v.loops.walkers]) expect(find(h, `chip-${id}`)!.type).toBe('Client')
  expect(propsOf(alert).press).toBe(`open:${viewOf('both').crew.agents.find(a => a.state === 'need')!.id}`)
  expect(propsOf(find(h, `chip-${still.id}`)!).press).toBe(`open:${still.id}`)
})

test('panel: a chip presses open:<its id>; in the shared alert image each chip has its own zone; +N more opens the pane', () => {
  const v = viewOf('hydra'), t = panelTree(v)
  for (const a of v.crew.agents) expect(propsOf(find(t, `chip-${a.id}`)!).press).toBe(`open:${a.id}`)
  const b = viewOf('both'), alerts = [...b.crew.agents.filter(a => a.state === 'need'), ...b.crew.agents.filter(a => a.state === 'failed')]
  const p = propsOf(find(panelTree(b), 'chips-alert')!) as ReturnType<typeof propsOf> & { zones: { to: number; press: string }[] }
  expect(p.press).toBe(`open:${alerts[0].id}`)
  expect(p.zones.map(z => z.press)).toEqual(alerts.map(a => `open:${a.id}`))
  expect(p.zones.at(-1)!.to).toBe(p.width)
  expect(p.zones.every((z, i) => i === 0 || z.to > p.zones[i - 1].to)).toBe(true)
  // The red overflow chip and the muted '+N more' keep the plain open.
  const crowd = propsOf(find(panelTree(alertCrowd(6, 0)), 'chips-alert')!) as typeof p
  expect(crowd.zones.at(-1)!.press).toBe('open')
  const many = viewOf('manyAgents')
  expect(propsOf(find(panelTree({ ...many, crew: { ...many.crew, agents: many.crew.agents.slice(0, 40) }, bodyColumns: 60 }), 'chip-more')!).press).toBe('open')
  expect(propsOf(find(panelTree(gauges('hydra')), 'mascot')!).press).toBe('open')
})

test('panel: the limit columns press usage and the context column presses context, in every size; tests has no press', () => {
  for (const v of [viewOf('hydra'), gauges('hydra'), viewOf('sizeLine'), viewOf('limitAhead')]) {
    const t = panelTree(v)
    expect(propsOf(imgOf(t, 'col-context')!).press).toBe('context')
    for (const k of ['col-5h', 'col-7d']) { const e = imgOf(t, k); if (e) expect(propsOf(e).press).toBe('usage') }
    expect(imgOf(t, 'col-5h') ?? imgOf(t, 'col-7d')).toBeDefined()
  }
  const v = viewOf('hydra'), tests = imgOf(panelTree(viewOf('hydra', { busy: false, bodyColumns: 140, stats: { ...v.stats, tests: { passed: 1, failed: 2, at: NOW, failedNames: ['a'] } } })), 'col-tests')!
  expect(tests.type).toBe('Svg'); expect(propsOf(tests).press).toBeUndefined()
})

test('panel: the session column presses costs and is a still Client; no other column gains a press', () => {
  const PRESS: Record<string, string> = { 'col-context': 'context', 'col-5h': 'usage', 'col-7d': 'usage', 'col-session': 'costs' }
  for (const s of SHOTS) for (const t of [panelTree(viewOf(s)), panelTree(gauges(s)), panelTree(viewOf(s, { bodyColumns: 140 }))]) {
    for (const k of keys(find(t, 'cols')).filter(k => k.startsWith('col-') && k !== 'col-agents')) expect([k, propsOf(imgOf(t, k)!).press]).toEqual([k, PRESS[k]])
    const ses = imgOf(t, 'col-session')
    if (ses) { expect(ses.type).toBe('Client'); expect(propsOf(ses).source).not.toContain('infinite') }
  }
  // The one-line size's session item too.
  const v = viewOf('busy'), line = panelTree(viewOf('busy', { ui: { ...v.ui, size: 'line' } }))
  expect(propsOf(imgOf(line, 'col-session')!).press).toBe('costs')
})

test('panel: a failed test run names its failing tests: the so-what the first, the alt and the title all', () => {
  const v = viewOf('hydra'), names = ['panel: wording', 'tests: keeps the names', 'a <b> & c']
  const at = (failedNames: string[]) => propsOf(imgOf(panelTree(viewOf('hydra', { busy: false, bodyColumns: 140, stats: { ...v.stats, tests: { passed: 3, failed: 3, at: NOW - 42_000, failedNames } } })), 'col-tests')!)
  const p = at(names)
  expect(p.source).toMatch(/>panel: wording</)
  expect(p.source).toContain('<title>panel: wording, tests: keeps the names, a &lt;b&gt; &amp; c</title>')
  expect(p.alt).toBe('tests: 3 failed, <1m ago. Failing: panel: wording, tests: keeps the names, a <b> & c')
  expect(wellFormed(p.source)).toBe(true)
  // A long first name is cut to the column with an ellipsis.
  const long = at([`${'very long test name '.repeat(6)}end`])
  expect(words(long.source)).toMatch(/very long test.*…/); expect(long.alt).toContain('end')
  // No names: the age, as before, and no title.
  expect(at([]).source).not.toContain('<title>')
})

test('panel: the plan bar and the folded mini bars name each task and its state', () => {
  const list = 'schema done, api done, savvy-progress implement in progress, e2e tests in progress, cache-tax review c1 in progress, plan the release in progress, merge not started'
  const bar = propsOf(find(panelTree(viewOf('hydra')), 'plan-bar')!)
  expect(bar.alt).toBe(`tasks: ${list}`); expect(bar.source).toContain(`<title>${list}</title>`)
  for (const t of [panelTree(gauges('hydra')), panelTree(viewOf('sizeLine'))]) {
    const p = propsOf(imgOf(t, 'col-plan')!)
    expect(p.alt).toContain(`. Tasks: `); expect(p.source).toContain('<title>schema done, api done, ')
    expect('interactive' in p).toBe(false)
  }
  const f = propsOf(find(panelTree(viewOf('failed')), 'plan-bar')!)
  expect(f.alt).toMatch(/e2e tests failed/)
})

// The words of the last <text> in a drawing: the folded column's alert line.
const lastText = (src: string) => words([...src.matchAll(/<text[^>]*>(.*?)<\/text>/g)].at(-1)![1])
test('panel: the folded alert line keeps " needs you" and " failed" whole and cuts only the title', () => {
  const v = viewOf('needsYou'), need = v.crew.agents.find(a => a.state === 'need')!
  const say = (title: string, state: 'need' | 'failed', bodyColumns: number) => {
    const agents = v.crew.agents.map((a): CrewAgent => (a.id === need.id ? { ...a, title, state, reason: 'broke' } : a))
    return lastText(propsOf(find(panelTree(viewOf('needsYou', { crew: { ...v.crew, agents }, ui: { ...v.ui, size: 'gauges' }, bodyColumns })), 'mascot')!).source)
  }
  const long = 'rewrite the whole release pipeline'
  const seen = new Set<string>()
  for (const cols of [46, 60, 74, 88, 96, 140]) for (const state of ['need', 'failed'] as const) {
    const tail = state === 'need' ? 'needs you' : 'failed', s = say(long, state, cols)
    const m = s.match(new RegExp(`^(.+)… ${tail}$`))
    if (s === `${long} ${tail}`) seen.add('whole')
    else if (m) { expect(m[1].length).toBeGreaterThanOrEqual(6); seen.add('cut') }
    else { expect(s).toBe(tail); seen.add('tail') }
  }
  expect([...seen].sort()).toEqual(['cut', 'tail'])
  expect(say('docs', 'need', 60)).toBe('docs needs you')
})

test('panel: a two-clause so-what drops whole clauses right to left, never cutting a number', () => {
  const v = viewOf('hydra'), soOf = (t: El, key: string) => lastText(sourceOf(t, key))
  // At 88 cells the tokens and session columns have cells to spare, so the long clause claims them.
  const ctx = panelTree(viewOf('hydra', { bodyColumns: 88, stats: { ...v.stats, context: { ...v.stats.context!, turnsLeft: 123_456_789 } } }))
  expect(soOf(ctx, 'col-context')).toBe('~123456789 turns · 34% msgs')
  expect(soOf(ctx, 'col-turn')).toBe('+38 −6 · ≈$0.42')
  // Past those cells the long clause cannot claim, so it goes whole.
  const ctxWide = panelTree(viewOf('hydra', { bodyColumns: 60, stats: { ...v.stats, context: { ...v.stats.context!, turnsLeft: 123_456_789_012 } } }))
  expect(soOf(ctxWide, 'col-context')).toBe('~123456789012 turns')
  const ses = panelTree(viewOf('hydra', { bodyColumns: 76, stats: { ...v.stats, session: { ...v.stats.session, lastTurnUsd: 123_456_789 } } }))
  expect(soOf(ses, 'col-session')).toBe('last turn $123456789')
  // One clause that does not fit goes whole: never 'last turn $12…' nor 'last turn…'.
  const sesWide = panelTree(viewOf('hydra', { bodyColumns: 74, stats: { ...v.stats, session: { ...v.stats.session, lastTurnUsd: 123_456_789_012_345 } } }))
  expect(soOf(sesWide, 'col-session')).toBe('')
  // A long cost claims the spare cells whole, never '$12…'.
  const turn = panelTree(viewOf('hydra', { bodyColumns: 88, stats: { ...v.stats, turn: { ...v.stats.turn!, costUsd: 123_456.78 } } }))
  expect(soOf(turn, 'col-turn')).toBe('+38 −6 · $123457')
  const whole = ['~7 turns · 34% msgs', '~7 turns', 'auto-compacts at 97%', 'last turn $2.46', 'on pace for 58%', 'on pace for 131%', '+38 −6 · ≈$0.42', '+38 −6', '']
  for (const s of ['hydra', 'context90', 'limitAhead'] as const) for (const bodyColumns of [46, 60, 88, 96]) {
    const t = panelTree(viewOf(s, { bodyColumns }))
    for (const k of ['col-context', 'col-turn', 'col-session', 'col-5h', 'col-7d']) if (find(t, k)) expect([k, whole.includes(soOf(t, k))]).toEqual([k, true])
  }
})

test('panel: a column that drops a clause anyway gives up the cells above its floor', () => {
  // Under three turns there is no tokens column, so at 74 cells the turn column is the one squeezed beside Compact.
  const s = viewOf('context90').stats, t = panelTree(viewOf('context90', { bodyColumns: 74, stats: { ...s, session: { ...s.session, turns: 2 } } }))
  const soOf = (key: string) => lastText(sourceOf(t, key))
  expect(soOf('col-turn')).toBe('+38 −6')
  expect(soOf('col-7d')).toBe('on pace for 131%')
  expect(soOf('col-session')).toBe('last turn $2.46')
  expect(cols(t).map(k => find(t, k)!.props!.width as number).reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(70)
})

test('panel: the failed chip pulses only while armed', () => {
  expect(sourceOf(panelTree(viewOf('failed')), 'chips-alert')).toContain('animation')
  expect(sourceOf(panelTree(viewOf('failed', { armed: false })), 'chips-alert')).not.toContain('animation')
})

test('panel: wording', () => {
  const hydra = panelTree(viewOf('hydra')), failed = panelTree(viewOf('failed'))
  expect(words(sourceOf(hydra, 'chip-imp'))).toContain('3/5 · ~2m left')
  expect(words(sourceOf(hydra, 'chip-rev'))).toContain('1/4 · ~4m left · slower')
  expect(words(sourceOf(failed, 'chip-rev'))).toContain('1/4 · ~4m left · 3 failed tries')
  expect(sourceOf(failed, 'chip-rev')).toMatch(/class="warn"[^>]*>1\/4 · ~4m left · 3 failed tries</)
  expect(words(sourceOf(failed, 'chips-alert'))).toContain('failed · Could not reach Postgres on :5432')
  // The so-what is cut to the column; the alt carries the whole sentence.
  const mascot = propsOf(find(panelTree(gauges('hydra')), 'mascot')!)
  expect(mascot.alt).toContain('next: savvy-progress implement · ~2m left'); expect(words(mascot.source)).toMatch(/next: savvy-.*…$/)
  expect(words(sourceOf(hydra, 'plan-line'))).toContain('2/7 tasks · ~9m left')

  const code = panelTree(viewOf('codeColumns', { bodyColumns: 96 }))
  expect(cols(code)).toEqual(['col-context', 'col-5h', 'col-7d', 'col-session', 'col-reuse', 'col-callers'])
  expect(cols(panelTree(viewOf('codeColumns', { bodyColumns: 60 })))).toEqual(['col-context', 'col-5h', 'col-7d', 'col-session'])
  const reuse = sourceOf(code, 'col-reuse'), callers = propsOf(imgOf(code, 'col-callers')!)
  expect(reuse).toMatch(/class="fg"[^>]*>72%</); expect(reuse).toMatch(/class="muted"[^>]*>18 used · 7 new</)
  expect(callers.source).toMatch(/class="warn"[^>]*>2 open</)
  expect(callers.alt).toContain('hooks/band.ts:41, tests/fold.test.ts:12')
  expect(words(callers.source)).toContain('hooks/band.ts:41'); expect(words(callers.source)).toMatch(/…$/)
})

test('panel: a hostile chip title still yields well-formed svg', () => {
  const v = viewOf('hydra'), agents = v.crew.agents.map((a, i): CrewAgent => (i === 0 ? { ...a, title: '<b>&"\u0000' } : a))
  const sources = images(panelTree({ ...v, crew: { ...v.crew, agents } })).map(e => propsOf(e).source)
  expect(sources.every(wellFormed)).toBe(true)
  expect(sources.some(s => s.includes('&lt;b&gt;'))).toBe(true)
  expect(sources.some(s => s.includes('\u0000'))).toBe(false)
})

test('panel: every image has an alt and every client is under the size cap', () => {
  for (const s of SHOTS)
    for (const t of [panelTree(viewOf(s)), panelTree(gauges(s)), panelTree(viewOf(s, { bodyColumns: 60 }))]) {
      expect(images(t).every(e => propsOf(e).alt.trim().length > 0)).toBe(true)
      expect(all(t).filter(e => e.type === 'Client').every(e => JSON.stringify(e.props!.props).length <= 60_000)).toBe(true)
      expect(images(t).every(e => !/NaN|Infinity|undefined/.test(propsOf(e).source + propsOf(e).alt))).toBe(true)
    }
  expect(() => image('big', { source: 'x'.repeat(60_001), alt: 'a', width: 1, height: 1 }, true)).toThrow()
})

test('panel: forty agents collapse into a +N more chip on the two chip rows (CHIP_ROWS)', () => {
  const v = viewOf('manyAgents'), crew = { ...v.crew, agents: v.crew.agents.slice(0, 40) }
  const t = panelTree({ ...v, crew, bodyColumns: 60 })
  const rows = (find(t, 'chips')!.children as El[])
  expect(rows.length).toBe(2)
  const chips = rows.flatMap(r => r.children as El[]), more = find(t, 'chip-more')!
  expect(chips.at(-1)).toBe(more)
  expect(words(propsOf(more).source)).toBe(`+${40 - (chips.length - 1)} more`)
  for (const r of rows) expect((r.children as El[]).reduce((w, c) => w + propsOf(c).width, 0)).toBeLessThanOrEqual(60 * 8.5)
})

test('panel: past forty tasks the plan bar is three proportional parts', () => {
  const v = viewOf('hydra'), tasks: PlanTask[] = Array.from({ length: 41 }, (_, i) => ({ name: `t${i}`, state: i < 20 ? 'done' : i < 30 ? 'live' : 'todo', fill: 0.5 }))
  const src = sourceOf(panelTree({ ...v, crew: { ...v.crew, plan: { ...v.crew.plan!, tasks, total: 41, done: 20 } } }), 'plan-bar')
  expect(src.match(/<rect /g)!.length).toBe(3); expect(words(src)).toBe('')
})

test('panel: many alert chips stay within the width; the alerts left out go red, the normal chips left out count into +N more', () => {
  for (const n of [3, 8, 12]) for (const bodyColumns of [60, 96]) {
    const v = viewOf('manyAgents'), agents = v.crew.agents.slice(0, 20).map((a, i): CrewAgent => (i < n ? { ...a, state: 'need', question: `Which schema should worker ${i + 1} use?` } : a))
    const t = panelTree({ ...v, crew: { ...v.crew, agents }, bodyColumns }), W = bodyColumns * 8.5
    const rows = find(t, 'chips')!.children as El[], chips = rows.flatMap(r => r.children as El[])
    for (const r of rows) expect((r.children as El[]).reduce((w, c) => w + propsOf(c).width, 0)).toBeLessThanOrEqual(W)
    const alerts = propsOf(find(t, 'chips-alert')!).alt.split('; '), over = Number(alerts.at(-1)!.match(/^(\d+) more need you$/)?.[1] ?? 0)
    expect(alerts.length - (over ? 1 : 0) + over).toBe(n)
    const shown = chips.filter(c => keyOf(c) !== 'chip-more' && keyOf(c) !== 'chips-alert').length
    const more = find(t, 'chip-more')
    expect(more ? words(propsOf(more).source) : '').toBe(shown < 20 - n ? `+${20 - n - shown} more` : '')
  }
})

test('panel: a failed chip with no reason and no end time shows no running clock', () => {
  const v = viewOf('failed'), strip = (now: number) => {
    const agents = v.crew.agents.map((a): CrewAgent => (a.state === 'failed' ? { ...a, reason: undefined, endedAt: undefined } : a))
    return clients(panelTree({ ...v, now, crew: { ...v.crew, agents } }))
  }
  expect(strip(NOW + 1000)).toEqual(strip(NOW))
})

test('panel: a helper that waits on you while the pane is closed dresses the crab, dots the toggle and leads the alert chips', () => {
  const wait = (s: 'hydra' | 'failed') => {
    const v = viewOf(s), agents = v.crew.agents.map((a): CrewAgent => (a.id !== 'rev' ? a : {
      ...a, helpers: a.helpers.map((h): CrewAgent => (h.id === 'k1' ? { ...h, state: 'need', prop: 'wait', question: 'Which guard should I keep?', waitingSince: NOW - 30_000 } : h)) }))
    return (size: 'full' | 'gauges' | 'line') => viewOf(s, { crew: { ...v.crew, agents }, ui: { ...v.ui, paneOpen: false, size } })
  }
  const hydra = wait('hydra')
  for (const size of ['gauges', 'line'] as const) {
    const v = hydra(size), t = panelTree(v)
    expect(v.loops.mascot).toBe('hop')
    expect(propsOf(find(t, 'mascot')!).alt).toContain('find callers of guard needs you')
    expect(propsOf(find(t, 'toggle')!).alt).toMatch(/\. An agent needs you$/)
    expect(sourceOf(t, 'toggle')).toContain('class="er"')
  }
  const alert = propsOf(find(panelTree(hydra('full')), 'chips-alert')!)
  expect(alert.alt).toBe('find callers of guard: Which guard should I keep?')
  // need, then a top-level failed agent; the failed helper gets no chip of its own.
  const failed = panelTree(wait('failed')('full')), order = propsOf(find(failed, 'chips-alert')!).alt.split('; ').map(s => s.split(':')[0])
  expect(order).toEqual(['find callers of guard', 'e2e tests'])
  expect(find(failed, 'chip-k1')).toBeUndefined()
})

test('panel: a helper of a helper that waits on you gets a chip and dresses the crab', () => {
  const v = viewOf('hydra'), agents = v.crew.agents.map((a): CrewAgent => (a.id !== 'rev' ? a : {
    ...a, helpers: a.helpers.map((h): CrewAgent => (h.id !== 'k1' ? h : {
      ...h, helpers: [{ ...h, id: 'k3', title: 'read the guard', parentId: 'k1', state: 'need', prop: 'wait', question: 'Keep the old key?', waitingSince: NOW - 30_000, helpers: [] }] })) }))
  const at = (size: 'full' | 'gauges') => panelTree(viewOf('hydra', { crew: { ...v.crew, agents }, ui: { ...v.ui, paneOpen: false, size } }))
  expect(propsOf(find(at('full'), 'chips-alert')!).alt).toBe('read the guard: Keep the old key?')
  expect(propsOf(find(at('gauges'), 'mascot')!).alt).toContain('read the guard needs you')
})

test('panel: a helper that failed dresses the crab and dots the toggle, but gets no chip of its own', () => {
  const v = viewOf('hydra'), agents = v.crew.agents.map((a): CrewAgent => (a.id !== 'rev' ? a : {
    ...a, helpers: a.helpers.map((h): CrewAgent => (h.id === 'k1' ? { ...h, state: 'failed', reason: 'No callers found' } : h)) }))
  const at = (size: 'full' | 'gauges' | 'line') => panelTree(viewOf('hydra', { crew: { ...v.crew, agents }, ui: { ...v.ui, paneOpen: false, size } }))
  for (const size of ['gauges', 'line'] as const) {
    const t = at(size)
    expect(propsOf(find(t, 'mascot')!).alt).toContain('find callers of guard failed')
    expect(propsOf(find(t, 'toggle')!).alt).toMatch(/\. An agent failed$/)
    expect(sourceOf(t, 'toggle')).toContain('class="er"')
  }
  const full = at('full')
  expect(find(full, 'chips-alert')).toBeUndefined(); expect(find(full, 'chip-k1')).toBeUndefined()
  // No phantom pulse: the loops the view counts are the looping drawings the tree carries.
  const fv = viewOf('hydra', { crew: { ...v.crew, agents }, ui: { ...v.ui, paneOpen: false, size: 'full' } })
  expect(panelLoopCount(fv)).toBe(images(panelTree(fv)).filter(e => propsOf(e).source.includes('infinite')).length)
})

test('panel: every animated drawing ends with the reduced-motion rule, the needle settles included', () => {
  const settles = { context: { from: 40, to: 58 }, '5h': { from: 10, to: 21 }, '7d': { from: 50, to: 63 } }
  for (const size of ['full', 'gauges', 'line'] as const) {
    const v = viewOf('hydra', { settles }), t = panelTree(viewOf('hydra', { settles, ui: { ...v.ui, size } }))
    const animated = images(t).map(e => propsOf(e).source).filter(s => s.includes('animation:'))
    expect(animated.some(s => s.includes('@keyframes nd'))).toBe(true)
    for (const s of animated) expect(s).toContain('prefers-reduced-motion')
  }
})

test('panel: a test run under a minute ago reads "<1m ago"', () => {
  const v = viewOf('hydra')
  const t = panelTree(viewOf('hydra', { stats: { ...v.stats, tests: { passed: 179, failed: 0, at: NOW - 42_000 } }, busy: false, bodyColumns: 140 }))
  expect(sourceOf(t, 'col-tests')).toContain('&lt;1m ago')
})

// Twenty workers, the first `need` waiting on you and the next `failed` failed, at 60 cells.
const alertCrowd = (need: number, failed: number, over: Partial<ReturnType<typeof viewOf>> = {}) => {
  const v = viewOf('manyAgents'), agents = v.crew.agents.slice(0, 20).map((a, i): CrewAgent =>
    (i < need ? { ...a, state: 'need', question: `Which schema should worker ${i + 1} use?` } : i < need + failed ? { ...a, state: 'failed', reason: `worker ${i + 1} broke` } : a))
  const crew = { ...v.crew, agents, counts: { ...v.crew.counts, need, failed, running: 20 - need - failed } }
  return viewOf('manyAgents', { crew, bodyColumns: 60, ...over })
}
const alertRow = (t: El) => {
  const img = find(t, 'chips-alert')!, p = propsOf(img), alts = p.alt.split('; ')
  return { img, p, alts, shown: alts.length - 1, last: alts.at(-1)! }
}

test('panel: alerts past one row collapse into a red +N need you chip, never into +N more', () => {
  const t = panelTree(alertCrowd(6, 0)), W = 60 * 8.5, { p, shown, last } = alertRow(t)
  const n = 6 - shown
  expect(shown).toBeGreaterThan(0); expect(n).toBeGreaterThan(0)
  expect(words(p.source).endsWith(`+${n} need you`)).toBe(true)
  expect(p.source).toMatch(new RegExp(`class="red"/><text fill="#fff"[^>]*>\\+${n} need you</text>`))
  expect(last).toBe(`${n} more need you`)
  expect(p.width).toBeLessThanOrEqual(W)
  const rows = find(t, 'chips')!.children as El[]
  for (const r of rows) expect((r.children as El[]).reduce((w, c) => w + propsOf(c).width, 0)).toBeLessThanOrEqual(W)
  // The muted '+N more' counts only the normal chips left out.
  const normal = rows.flatMap(r => r.children as El[]).filter(c => keyOf(c) !== 'chips-alert' && keyOf(c) !== 'chip-more').length
  expect(words(propsOf(find(t, 'chip-more')!).source)).toBe(`+${20 - 6 - normal} more`)
})

test('panel: the red overflow chip reads +N failed only when no agent in it needs you', () => {
  const mix = alertRow(panelTree(alertCrowd(3, 3, { armed: true })))
  expect(words(mix.p.source).endsWith(`+${6 - mix.shown} need you`)).toBe(true)
  expect(mix.last).toMatch(/^\d+ more need you, 3 failed$/)
  const failed = alertRow(panelTree(alertCrowd(1, 5, { armed: true })))
  expect(words(failed.p.source).endsWith(`+${6 - failed.shown} failed`)).toBe(true)
  expect(failed.last).toBe(`${6 - failed.shown} more failed`)
})

test('panel: the red overflow chip pulses inside the alert chips client, and the loop count still matches', () => {
  const v = alertCrowd(6, 0), t = panelTree(v), { img, p } = alertRow(t)
  expect(v.loops.chipPulse).toBe(true)
  expect(img.type).toBe('Client'); expect(alertRow(t).last).toMatch(/^\d+ more need you$/)
  expect(p.source.match(/class="s-halo35 pulse"/g)!.length).toBe(alertRow(t).alts.length)
  expect(panelLoopCount(v)).toBe(images(t).filter(e => propsOf(e).source.includes('infinite')).length)
})

// A chip's tooltips: the `<title>` texts in its drawing, in order.
const tips = (src: string) => [...src.matchAll(/<g><title>([^<]*)<\/title>/g)].map(m => m[1])
const withAgent = (v: ReturnType<typeof viewOf>, id: string, over: Partial<CrewAgent>) =>
  ({ ...v, crew: { ...v.crew, agents: v.crew.agents.map(a => (a.id === id ? { ...a, ...over } : a)) } })

test('panel: a cut chip carries its full text as a tooltip and is never interactive', () => {
  const v = viewOf('hydra'), still = v.crew.agents.find(a => a.state === 'running' && !v.loops.walkers.includes(a.id))!
  const long = 'rewrite the whole release pipeline so that every channel ships from one tagged build'
  const chip = find(panelTree(withAgent(v, still.id, { title: long })), `chip-${still.id}`)!, p = propsOf(chip) as ReturnType<typeof propsOf> & { interactive?: boolean }
  expect(chip.type).toBe('Client')
  expect(words(p.source)).toContain('…')
  expect(tips(p.source)).toHaveLength(1)
  expect(tips(p.source)[0].startsWith(`${long}: `)).toBe(true)
  expect('interactive' in p).toBe(false)
  // Capped at 300 characters, and the same one second later.
  const huge = 'x'.repeat(400), q = propsOf(find(panelTree(withAgent(v, still.id, { title: huge })), `chip-${still.id}`)!)
  expect(tips(q.source)[0].length).toBe(300); expect(tips(q.source)[0].endsWith('…')).toBe(true)
  expect(propsOf(find(panelTree(withAgent({ ...v, now: v.now + 1000 }, still.id, { title: long })), `chip-${still.id}`)!)).toEqual(p)
})

test('panel: an uncut chip has no tooltip', () => {
  const v = viewOf('hydra'), still = v.crew.agents.find(a => a.state === 'running' && !v.loops.walkers.includes(a.id))!
  const chip = find(panelTree(withAgent(v, still.id, { title: 'docs' })), `chip-${still.id}`)!, p = propsOf(chip)
  expect(chip.type).toBe('Client')
  expect(words(p.source as string)).not.toContain('…')
  expect(p.source).not.toContain('<title>')
  expect('interactive' in p).toBe(false)
})

test('panel: in the shared alert image each cut chip has its own tooltip', () => {
  const v = viewOf('both'), [need, failed] = [v.crew.agents.find(a => a.state === 'need')!, v.crew.agents.find(a => a.state === 'failed')!]
  const one = withAgent(withAgent(v, need.id, { title: 'ask', question: 'Ok?' }), failed.id, { title: 'db', reason: 'the database refused every connection the migration opened, all forty of them, for an hour' })
  const p = propsOf(find(panelTree(one), 'chips-alert')!) as ReturnType<typeof propsOf> & { interactive?: boolean }
  expect(tips(p.source)).toEqual(['db: failed · the database refused every connection the migration opened, all forty of them, for an hour'])
  expect('interactive' in p).toBe(false)
  const none = propsOf(find(panelTree(withAgent(one, failed.id, { reason: 'no db' })), 'chips-alert')!)
  expect(none.source).not.toContain('<title>'); expect('interactive' in none).toBe(false)
  // The red overflow chip lists the names it hides.
  const crowd = alertCrowd(6, 0), r = alertRow(panelTree(crowd)), hidden = crowd.crew.agents.slice(r.shown, 6).map(a => a.title).join(', ')
  expect(tips(r.p.source).at(-1)).toBe(hidden)
  expect('interactive' in r.p).toBe(false)
})

test('panel: a hostile title in a tooltip stays well-formed', () => {
  const v = viewOf('both'), need = v.crew.agents.find(a => a.state === 'need')!
  const hostile = `<b>&"\u0000 ${'y'.repeat(80)}`
  const p = propsOf(find(panelTree(withAgent(v, need.id, { title: hostile })), 'chips-alert')!)
  expect(wellFormed(p.source)).toBe(true)
  expect(tips(p.source)[0].startsWith(`&lt;b&gt;&amp;&quot; ${'y'.repeat(80)}: `)).toBe(true)
  expect(p.source).not.toContain('\u0000')
})

const colWidth = (t: El, k: string) => find(t, k)!.props!.width as number
test('panel: at 60 cells the 7d warning so-what survives beside the compact chip', () => {
  for (const s of ['hydra', 'failed'] as const) {
    const t = panelTree(viewOf(s, { bodyColumns: 60 }))
    expect(words(chipOf(t)!.source)).toBe('compact')
    expect(lastText(sourceOf(t, 'col-7d'))).toBe('on pace for 131%')
    expect(cols(t).reduce((a, k) => a + colWidth(t, k), 0)).toBeLessThanOrEqual(60 - 4)
  }
})

test('panel: spare width goes to the column whose clauses would drop, warn first', () => {
  const v = viewOf('hydra'), at = (stats: typeof v.stats) => panelTree(viewOf('hydra', { bodyColumns: 60, stats }))
  const sum = (t: El) => cols(t).reduce((a, k) => a + colWidth(t, k), 0)
  // Below 50%, no chip: the even share (14) is one cell short for the context so-what, and the tokens column has cells over.
  const roomy = at({ ...v.stats, context: { ...v.stats.context!, pct: 40 } })
  expect(colWidth(roomy, 'col-context')).toBe(15); expect(lastText(sourceOf(roomy, 'col-context'))).toBe('~7 turns · 34% msgs')
  expect(colWidth(roomy, 'col-tokens')).toBe(13); expect(lastText(sourceOf(roomy, 'col-tokens'))).toBe('44 turns')
  expect(lastText(sourceOf(roomy, 'col-7d'))).toBe('on pace for 131%')
  expect(sum(roomy)).toBe(60 - 4)
  // With the chip the tokens column gives its slack and the amber warning keeps its cells.
  const calm = { ...v.stats, limits: v.stats.limits.map(l => (l.kind === 'seven_day' ? { ...l, ahead: false } : l)) }
  const hot = at(v.stats)
  expect(colWidth(hot, 'col-tokens')).toBe(9); expect(lastText(sourceOf(hot, 'col-tokens'))).toBe('44 turns'); expect(sum(hot)).toBe(60 - 4)
  expect(lastText(sourceOf(hot, 'col-7d'))).toBe('on pace for 131%')
  // Folded at 78 cells no column has slack left for the chip: the amber warning is the last to give, so the whole chip
  // would cost another column its value and the chip is its icon alone.
  const folded = (stats: typeof v.stats) => panelTree(viewOf('hydra', { bodyColumns: 78, stats, ui: { ...v.ui, size: 'gauges' } }))
  const warm = folded(v.stats), still = folded(calm)
  expect(sum(still)).toBe(78 - 4); expect(sum(warm)).toBeLessThanOrEqual(78 - 4)
  expect(lastText(sourceOf(warm, 'col-7d'))).toBe('on pace for 131%'); expect(chipOf(warm)!.width).toBe(20)
  // With the limit calm, the lowest priority column gives instead: the 7d limit, and the chip is whole.
  expect(colWidth(still, 'col-7d')).toBe(13); expect(lastText(sourceOf(still, 'col-7d'))).toBe(''); expect(words(chipOf(still)!.source)).toBe('compact')
})

test('panel: one folded agent shows its name, not "1 agents", and its state under it', () => {
  const v = viewOf('sizeGauges', { bodyColumns: 96 }), a = v.crew.agents.find(x => x.state === 'need') ?? v.crew.agents[0]
  const texts = (t: El) => [...sourceOf(t, 'mascot').matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m => words(m[1]))
  const one = texts(panelTree({ ...v, crew: { ...v.crew, agents: [a] } } as typeof v))
  expect(one).not.toContain('1')
  expect(one.filter(x => x.includes(a.title.slice(0, 6))).length).toBe(1)
  expect(one.some(x => /^needs you$/.test(x))).toBe(true)
  expect(texts(panelTree(v))).toContain(String(v.crew.agents.length))
})
