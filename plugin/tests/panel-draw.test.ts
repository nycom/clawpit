import { test, expect } from 'claude-code/testing'
import type { CrewAgent, PlanTask } from '../types'
import { COMPACT_KEY, image, panelTree, type El } from '../hooks/panel/draw'
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
// The words a drawing shows: its markup without the styles and the tags.
const words = (src: string) => src.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, '')
const cols = (t: El) => keys(find(t, 'cols')).filter(k => k.startsWith('col-'))
const gauges = (s: StateName) => { const v = viewOf(s); return viewOf(s, { ui: { ...v.ui, size: 'gauges' } }) }

// Tags open and close in order; no stray '<', '>' or bare '&' is left in the text.
const wellFormed = (src: string): boolean => {
  const stack: string[] = []
  for (const m of src.replace(/<style>[\s\S]*?<\/style>/g, '').matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^<>]*?(\/?)>/g)) {
    if (m[1]) { if (stack.pop() !== m[2]) return false } else if (!m[3]) stack.push(m[2])
  }
  const text = words(src)
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
  const box = find(panelTree(viewOf('hydra', { bodyColumns: 88 })), 'col-context')!
  expect(box.props!.width).toBe(14); expect(propsOf(imgOf(box, 'col-context')!).width).toBe(14 * 8.5)
})

test('panel: Compact now appears only in alarm and is never dim', () => {
  const b = find(panelTree(viewOf('context90')), COMPACT_KEY)!; expect(b.type).toBe('Button'); expect(b.props!.label).toBe('Compact now'); expect(b.props!.dimColor).toBeUndefined()
  expect(find(panelTree(viewOf('hydra')), COMPACT_KEY)).toBeUndefined()
  const ctx = sourceOf(panelTree(viewOf('context90')), 'col-context')
  expect(words(ctx)).toContain('auto-compacts at 97%'); expect(ctx).toMatch(/class="er"[^>]*>92%</)
})

test('panel: a looping client has the same props one second later', () => {
  const a = clients(panelTree(viewOf('needsYou'))), b = clients(panelTree(viewOf('needsYou', { now: NOW + 1000 })))
  expect(b).toEqual(a); expect(a.length).toBeGreaterThan(0)
})

test('panel: alert chips share one client; a still chip is a plain Svg', () => {
  const t = panelTree(viewOf('both')), alert = find(t, 'chips-alert')!
  expect(alert.type).toBe('Client')
  expect(all(find(t, 'chips')!).filter(isImage).map(keyOf)[0]).toBe('chips-alert')
  expect(find(t, 'chip-pln')).toBeUndefined(); expect(find(t, 'chip-e2e')).toBeUndefined()
  expect(words(propsOf(alert).source)).toContain('Ship the release notes'); expect(words(propsOf(alert).source)).toContain('Could not reach Postgres')
  const v = viewOf('hydra'), h = panelTree(v)
  const still = v.crew.agents.find(a => a.state === 'running' && !v.loops.walkers.includes(a.id))!
  expect(find(h, `chip-${still.id}`)!.type).toBe('Svg')
  for (const id of v.loops.walkers) expect(find(h, `chip-${id}`)!.type).toBe('Client')
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

test('panel: forty agents collapse into a +N more chip within maxRows', () => {
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
