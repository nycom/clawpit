import { test, expect } from 'claude-code/testing'
import type { CrewAgent, PlanTask } from '../types'
import { COMPACT_KEY, image, panelTree, type El } from '../hooks/panel/draw'
import { NOW, type StateName } from './fixtures/states'
import { viewOf } from './build'

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

test('panel: many alert chips stay within the width and the rest count into +N more', () => {
  for (const n of [3, 8, 12]) for (const bodyColumns of [60, 96]) {
    const v = viewOf('manyAgents'), agents = v.crew.agents.slice(0, 20).map((a, i): CrewAgent => (i < n ? { ...a, state: 'need', question: `Which schema should worker ${i + 1} use?` } : a))
    const t = panelTree({ ...v, crew: { ...v.crew, agents }, bodyColumns }), W = bodyColumns * 8.5
    const rows = find(t, 'chips')!.children as El[], chips = rows.flatMap(r => r.children as El[])
    for (const r of rows) expect((r.children as El[]).reduce((w, c) => w + propsOf(c).width, 0)).toBeLessThanOrEqual(W)
    const shown = chips.filter(c => keyOf(c) !== 'chip-more').reduce((s, c) => s + propsOf(c).alt.split('; ').length, 0)
    const more = find(t, 'chip-more')
    expect(more ? words(propsOf(more).source) : '').toBe(shown < 20 ? `+${20 - shown} more` : '')
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
})
