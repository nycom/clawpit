import { test, expect } from 'claude-code/testing'
import type { CrewAgent } from '../types'
import { paneTree, type El } from '../hooks/pane/draw'
import { ENGINE_MAX, HOST_MAX } from '../hooks/pane/layout'
import { pickLoops } from '../hooks/loops'
import { textWidth } from '../hooks/text'
import { MONO } from '../hooks/tokens'
import { NOW } from './fixtures/states'
import { paneLoopCount, paneViewOf } from './build-pane'

const all = (e: El | string): El[] => (typeof e === 'string' ? [] : [e, ...(e.children ?? []).flatMap(all)])
const find = (tree: El, key: string) => all(tree).find(e => (e.props?.key ?? '') === key)
const keys = (tree: El) => all(tree).map(e => String(e.props?.key ?? '')).filter(Boolean)
const inner = (e: El) => (e.type === 'Client' ? (e.props!.props as Record<string, unknown>) : e.props!)
const src = (e: El | undefined) => String(e ? inner(e).source : '')
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// Visible words of an image: styles dropped, every text element read in order.
const words = (e: El | undefined) =>
  unescape(src(e).replace(/<style>.*?<\/style>/g, '').replace(/<\/text>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const clients = (tree: El) => all(tree).filter(e => e.type === 'Client')
const looping = (tree: El) => clients(tree).filter(c => src(c).includes('infinite'))
// savvy-progress's count of what the engine's text budget sees: never an Svg's source.
const engine = (n: El | string): number => typeof n === 'string' ? n.length
  : n.type === 'Client' ? JSON.stringify(n.props ?? null).length : n.type === 'Svg' ? String(n.props?.alt ?? '').length
  : String(n.props?.key ?? '').length + String(n.props?.label ?? '').length + (n.children ?? []).reduce((s, c) => s + engine(c), 0)
const withAgents = (v: ReturnType<typeof paneViewOf>, map: (a: CrewAgent[]) => CrewAgent[]) => ({ ...v, crew: { ...v.crew, agents: map(v.crew.agents) } })

test('pane: the title is the flow title, or Subagents', () => {
  expect(words(find(paneTree(paneViewOf('hydra')), 'head'))).toContain('Hydra · retro fixes')
  expect(words(find(paneTree(paneViewOf('manyAgents')), 'head'))).toContain('Subagents')
})

test('pane: sections in order: Needs you, Failed, Running, Ended', () => {
  const k = keys(paneTree(paneViewOf('both'))).filter(x => x.startsWith('sec-') || x === 'ended')
  expect(k).toEqual(['sec-need', 'sec-failed', 'sec-running', 'ended'])
  const t = paneTree(paneViewOf('both'))
  expect(words(find(t, 'sec-need'))).toBe('Needs you'); expect(words(find(t, 'sec-failed'))).toBe('Failed 1')
  expect(words(find(t, 'sec-running'))).toBe('Running 2'); expect(words(find(t, 'ended'))).toBe('Ended 1')
})

test('pane: the summary line', () => {
  expect(words(find(paneTree(paneViewOf('both')), 'head'))).toContain('1 needs you · 1 failed · 2 running · 1 done · ≈$1.06 · ~4m left')
  const hydra = words(find(paneTree(paneViewOf('hydra')), 'head'))
  expect(hydra).toContain('4 running · 1 done · ≈$1.06 · ~9m left'); expect(hydra).not.toContain('needs you'); expect(hydra).not.toContain('failed')
})

test('pane: a needs-you row is one looping client 62px tall; only the ring id rings', () => {
  const v = paneViewOf('needsYou'), t = paneTree(v), row = find(t, 'row-e2e')!
  expect(row.type).toBe('Client'); expect(inner(row).height).toBe(62); expect(inner(row).press).toBe('row:e2e')
  expect(src(row)).toContain('infinite'); expect(src(row)).toContain('1.2s steps(2)'); expect(find(t, 'crab-e2e')).toBeUndefined()
  const e2e = v.crew.agents.find(a => a.id === 'e2e')!
  const two = withAgents(v, a => [...a.slice(0, 1), { ...e2e, id: 'e2x', waitingSince: NOW - 1000 }, ...a.slice(1)])
  const t2 = paneTree({ ...two, crew: { ...two.crew, counts: { ...two.crew.counts, need: 2 } } })
  expect(src(find(t2, 'row-e2e'))).toContain('infinite'); expect(src(find(t2, 'row-e2x'))).not.toContain('animation')
  expect(words(find(t2, 'row-e2x'))).toContain('Postgres or SQLite for the fixture?')
})

test('pane: a failed row has no ring, says failed and after m:ss, and shows the reason', () => {
  const row = find(paneTree(paneViewOf('failed')), 'row-e2e')!
  expect(inner(row).height).toBe(62); expect(src(row)).not.toContain('animation')
  const w = words(row)
  expect(w).toContain('failed'); expect(w).toContain('after 2:10'); expect(w).toContain('Could not reach Postgres on :5432')
})

test('pane: a struggling row starts its activity with N failed tries in warn; slow starts with slower', () => {
  const struggling = src(find(paneTree(paneViewOf('failed')), 'row-rev'))
  expect(struggling).toMatch(/class="warn"[^>]*>3 failed tries · </); expect(struggling).not.toContain('slower')
  const slow = src(find(paneTree(paneViewOf('hydra')), 'row-rev'))
  expect(slow).toMatch(/class="warn"[^>]*>slower · </)
  expect(src(find(paneTree(paneViewOf('hydra')), 'row-imp'))).not.toContain('slower')
})

test('pane: the waiting age is in whole minutes', () => {
  expect(words(find(paneTree(paneViewOf('needsYou')), 'row-e2e'))).toContain('waiting <1m')
  expect(words(find(paneTree(paneViewOf('needsYou', { now: NOW + 148_000 })), 'row-e2e'))).toContain('waiting 3m')
})

test('pane: a looping client has the same props one second later', () => {
  const a = looping(paneTree(paneViewOf('needsYou'))), b = looping(paneTree(paneViewOf('needsYou', { now: NOW + 1000 })))
  expect(b).toEqual(a); expect(a.length).toBeGreaterThan(1)
})

test('pane: the drawer lists the log newest first, the error line, and the footer', () => {
  const v = paneViewOf('failed'), ui = { ...v.ui, open: 'e2e' }
  const d = find(paneTree({ ...v, ui, loops: pickLoops(v.crew, ui, true, true) }), 'drawer-e2e')!
  expect(d.type).toBe('Svg')
  const w = words(d)
  expect(w.startsWith('Failed at step 3 of 4: run the login flow test 40s')).toBe(true)
  expect(w.indexOf('Try 3 failed')).toBeLessThan(w.indexOf('Try 1 failed'))
  expect(src(d)).toContain(`font-family="${MONO}"`); expect(src(d)).toMatch(/font-family="[^"]*monospace"[^>]*>connect ECONNREFUSED 127\.0\.0\.1:5432</)
  for (const f of ['steps 2/4', 'tries 3', 'context 62%', 'cost ≈$0.07', 'ran 2:10', 'usually 4m']) expect(w).toContain(f)
  const run = words(find(paneTree(paneViewOf('drawerOpen')), 'drawer-imp'))
  expect(run).toContain('steps 3/5'); expect(run).not.toContain('tries'); expect(run).not.toContain('ran ')
})

test('pane: helpers nest with the toggle text, and a failed helper is counted in er', () => {
  const t = paneTree(paneViewOf('failed')), kids = find(t, 'kids-rev')!
  expect(inner(kids).press).toBe('kids:rev'); expect(words(kids)).toBe('2 helpers · 1 failed')
  expect(src(kids)).toMatch(/class="er"[^>]*> · 1 failed</)
  const k = keys(t)
  expect(k.indexOf('row-rev')).toBeLessThan(k.indexOf('helper-k2')); expect(k.indexOf('helper-k1')).toBeLessThan(k.indexOf('kids-rev'))
  expect(words(find(t, 'helper-k2'))).toContain('no "cacheKey" in src/')
  expect(words(find(paneTree(paneViewOf('hydra')), 'kids-rev'))).toBe('2 helpers')
  expect(find(paneTree(paneViewOf('helpers')), 'helper-k1')).toBeUndefined()
})

test('pane: an ended failed row has the cross and failed after m:ss; a done one the check and m:ss', () => {
  const v = paneViewOf('failed'), e2e = v.crew.agents.find(a => a.id === 'e2e')!
  const crew = { ...v.crew, agents: v.crew.agents.filter(a => a.id !== 'e2e'), ended: [{ ...e2e, state: 'ended' as const }, ...v.crew.ended] }
  const t = paneTree({ ...v, crew, ui: { ...v.ui, shut: [] } })
  const bad = find(t, 'ended-e2e')!, done = find(t, 'ended-docs')!
  expect(words(bad)).toBe('e2e tests failed after 2:10'); expect(src(bad)).toContain('M3 3l6 6M9 3 3 9'); expect(src(bad)).toMatch(/class="er"[^>]*>failed after 2:10</)
  expect(words(done)).toBe('docs pass 1:05'); expect(src(done)).toContain('M2.5 6.3 5 8.8l4.5-5.3'); expect(src(done)).toMatch(/class="okText"[^>]*>1:05</)
})

test('pane: the empty state', () => {
  const t = paneTree(paneViewOf('emptyPane'))
  expect(t.props!.key).toBe('clawpit-pane'); expect(t.children!.length).toBe(1)
  const e = t.children![0] as El
  expect(e.type).toBe('Svg'); expect(words(e)).toBe('No agents yet'); expect(src(e)).toContain('width="51"'); expect(src(e)).not.toContain('animation')
})

test('pane: a two-line question is cut with an ellipsis and fits the body width', () => {
  const long = 'Should the fixture use Postgres, SQLite, or an in-memory fake that mirrors the migrations, given that the login flow test needs real constraints and the CI runner has no database service configured yet?'
  const v = withAgents(paneViewOf('needsYou', { columns: 36 }), a => a.map(x => (x.id === 'e2e' ? { ...x, question: long } : x)))
  const row = find(paneTree(v), 'row-e2e')!, width = inner(row).width as number
  const lines = [...src(row).matchAll(/<text x="([\d.]+)" y="[\d.]+" class="er" font-size="12" font-weight="600">([^<]*)<\/text>/g)]
  expect(lines.length).toBe(2); expect(unescape(lines[1][2]).endsWith('…')).toBe(true)
  for (const [, x, s] of lines) expect(+x + textWidth(unescape(s), 12, 600)).toBeLessThanOrEqual(width - 88 - 34)
})

test('pane: every press is one of the three pane forms', () => {
  for (const s of ['hydra', 'needsYou', 'failed', 'both', 'drawerOpen', 'helpers', 'manyAgents'] as const) {
    const t = paneTree(paneViewOf(s, { ui: { ...paneViewOf(s).ui, shut: [] } }))
    for (const c of clients(t)) {
      const press = inner(c).press
      // A walking helper crab loops without a press: helpers have no drawer.
      if (press === undefined) { expect(String(c.props!.key)).toMatch(/^crab-/); expect(src(c)).toContain('infinite'); continue }
      expect(String(press)).toMatch(/^(row:|kids:).+$|^ended$/)
    }
  }
})

test('pane: 80 agents stay under both bounds', () => {
  const v = paneViewOf('manyAgents'), first = v.crew.agents[0].id, t = paneTree({ ...v, ui: { ...v.ui, open: first } })
  expect(JSON.stringify(t).length).toBeLessThanOrEqual(HOST_MAX); expect(engine(t)).toBeLessThanOrEqual(ENGINE_MAX)
  expect(find(t, `drawer-${first}`)).not.toBeUndefined()
  expect(words(find(t, 'more-running'))).toMatch(/^\+\d+ more$/)
})

test('pane: the loop count follows the plan', () => {
  expect(paneLoopCount(paneViewOf('emptyPane'))).toBe(0)
  const v = paneViewOf('needsYou')
  expect(paneLoopCount(v)).toBe(looping(paneTree(v)).length); expect(paneLoopCount(v)).toBe(v.loops.walkers.length + 1)
})
