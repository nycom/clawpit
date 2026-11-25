import { test, expect } from 'claude-code/testing'
import type { CrewAgent } from '../types'
import { paneTree, type El } from '../hooks/pane/draw'
import { ENGINE_MAX, HOST_MAX } from '../hooks/pane/layout'
import { pickLoops } from '../hooks/loops'
import { modelLabel, textWidth } from '../hooks/text'
import { helpersOf } from '../hooks/model'
import { FONT, MONO } from '../hooks/tokens'
import { NOW } from './fixtures/states'
import { paneLoopCount, paneViewOf } from './build-pane'

const all = (e: El | string): El[] => (typeof e === 'string' ? [] : [e, ...(e.children ?? []).flatMap(all)])
const find = (tree: El, key: string) => all(tree).find(e => (e.props?.key ?? '') === key)
const keys = (tree: El) => all(tree).map(e => String(e.props?.key ?? '')).filter(Boolean)
const inner = (e: El) => (e.type === 'Client' ? (e.props!.props as Record<string, unknown>) : e.props!)
const src = (e: El | undefined) => String(e ? inner(e).source : '')
const unescape = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
// Visible words of an image: styles dropped, every text element read in order.
const wordsOf = (source: string) =>
  unescape(source.replace(/<style>.*?<\/style>/g, '').replace(/<\/text>/g, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const words = (e: El | undefined) => wordsOf(src(e))
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
  expect(w.startsWith('Failed at step 3 of 4: run the login flow test <1m')).toBe(true)
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
  expect(words(bad)).toBe('e2e tests failed after 2:10 Haiku 5.5'); expect(src(bad)).toContain('M3 3l6 6M9 3 3 9'); expect(src(bad)).toMatch(/class="er"[^>]*>failed after 2:10</)
  expect(words(done)).toBe('docs pass 1:05 Haiku 5.5'); expect(src(done)).toContain('M2.5 6.3 5 8.8l4.5-5.3'); expect(src(done)).toMatch(/class="okText"[^>]*>1:05</)
})

test('pane: the empty state', () => {
  const t = paneTree(paneViewOf('emptyPane'))
  expect(t.props!.key).toBe('clawpit-pane'); expect(t.children!.length).toBe(1)
  const e = t.children![0] as El
  expect(e.type).toBe('Svg'); expect(words(e)).toBe('No agents yet Agents you start show up here'); expect(src(e)).toContain('width="51"'); expect(src(e)).not.toContain('animation')
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

test('pane: a helper that needs you shows its question in er and how long it has waited', () => {
  const v = withAgents(paneViewOf('hydra'), a => a.map(x => (x.id === 'rev'
    ? { ...x, helpers: x.helpers.map(h => (h.id === 'k1' ? { ...h, state: 'need' as const, prop: 'wait' as const, question: 'Keep the old cache key?', waitingSince: NOW - 150_000, activity: null } : h)) } : x)))
  const row = find(paneTree({ ...v, ui: { ...v.ui, shut: [] } }), 'helper-k1')!
  expect(src(row)).toMatch(/class="er"[^>]*>Keep the old cache key\?</); expect(src(row)).toContain('needTint')
  expect(words(row)).toContain('2m'); expect(String(inner(row).alt)).toContain('waiting 2m: Keep the old cache key?')
})

test('pane: a waiting helper keeps its question and a readable wait at 36 columns', () => {
  const at = (ms: number) => {
    const v = withAgents(paneViewOf('hydra', { columns: 36 }), a => a.map(x => (x.id === 'rev'
      ? { ...x, helpers: x.helpers.map(h => (h.id === 'k1' ? { ...h, state: 'need' as const, prop: 'wait' as const, question: 'Keep the old cache key for now?', waitingSince: NOW - ms, activity: null } : h)) } : x)))
    return find(paneTree({ ...v, ui: { ...v.ui, shut: [] } }), 'helper-k1')!
  }
  for (const [ms, age] of [[30_000, '<1m'], [720_000, '12m'], [7_200_000, '120m']] as const) {
    expect(words(at(ms))).toMatch(new RegExp(`Keep\\b.* ${age} Haiku( 5\\.5)?$`))
    expect(String(inner(at(ms)).alt)).toContain(`waiting ${age}: Keep the old cache key for now?`)
  }
})

// hydra with k1 waiting on you and, when `nested`, k3 helping k1 and waiting too.
const waitingHelper = (over: Partial<ReturnType<typeof paneViewOf>> = {}, question = 'Keep the old cache key?', nested = false) =>
  withAgents(paneViewOf('hydra', over), a => a.map(x => (x.id === 'rev' ? { ...x, helpers: x.helpers.map(h => {
    if (h.id !== 'k1') return h
    const need = { ...h, state: 'need' as const, prop: 'wait' as const, question, waitingSince: NOW - 150_000, activity: null }
    return { ...need, helpers: nested ? [{ ...need, id: 'k3', title: 'read the guard', parentId: 'k1', helpers: [] }] : [] }
  }) } : x)))

test('pane: a waiting helper counts in the summary, reads waiting Nm, and cuts its question at two lines', () => {
  const v = waitingHelper({ columns: 36 }, 'Should the guard keep the old cache key for one release, or drop it now that every caller has moved over?')
  const t = paneTree({ ...v, ui: { ...v.ui, shut: [] } }), row = find(t, 'helper-k1')!
  expect(words(find(t, 'head'))).toContain('1 needs you · 4 running')
  expect(inner(row).height).toBe(32); expect(src(row)).toContain('needTint')
  expect(src(row)).toMatch(/text-anchor="end"><tspan class="er" font-weight="600">waiting 2m</)
  const first = src(row).match(/<tspan class="fg">find call[^<]* <\/tspan><tspan class="er">([^<]*)<\/tspan><\/text>/)!
  const second = [...src(row).matchAll(/<text x="10" y="27" class="er" font-size="12" font-weight="600">([^<]*)<\/text>/g)].map(m => unescape(m[1]))
  expect(first[1].startsWith('Should')).toBe(true); expect(second.length).toBe(1); expect(second[0].endsWith('…')).toBe(true)
  expect(String(inner(row).alt)).toContain('waiting 2m: Should the guard')
})

test('pane: a waiting helper\'s segment in the crew bar is er, like a top-level needs-you agent', () => {
  const reds = (v: ReturnType<typeof paneViewOf>) => src(find(paneTree(v), 'head')).match(/class="tint28-er"/g)?.length ?? 0
  expect(reds(waitingHelper())).toBe(reds(paneViewOf('hydra')) + 1)
  expect(reds(waitingHelper({}, 'Keep the old cache key?', true))).toBe(reds(paneViewOf('hydra')) + 2)
})

test('pane: a folded toggle names the helpers that need you in er', () => {
  const v = waitingHelper(), kids = (shut: string[]) => find(paneTree({ ...v, ui: { ...v.ui, shut } }), 'kids-rev')!
  expect(words(kids(['rev']))).toBe('2 helpers · 1 needs you'); expect(src(kids(['rev']))).toMatch(/class="er"[^>]*> · 1 needs you</)
  expect(words(kids([]))).toBe('2 helpers')
  const failed = paneViewOf('failed'), both = withAgents(failed, a => a.map(x => (x.id === 'rev' ? { ...x, helpers: x.helpers.map(h => (h.id === 'k1' ? { ...h, state: 'need' as const } : h)) } : x)))
  expect(words(find(paneTree({ ...both, ui: { ...both.ui, shut: ['rev'] } }), 'kids-rev'))).toBe('2 helpers · 1 needs you · 1 failed')
})

test('pane: a helper of a helper sits under it on the same tree line, indented', () => {
  const v = waitingHelper({}, 'Keep the old cache key?', true), t = paneTree({ ...v, ui: { ...v.ui, shut: [] } }), k = keys(t)
  expect(k.indexOf('helper-k1')).toBeLessThan(k.indexOf('helper-k3')); expect(k.indexOf('helper-k3')).toBeLessThan(k.indexOf('kids-rev'))
  const crab1 = find(t, 'crab-k1')!, crab3 = find(t, 'crab-k3')!
  expect(inner(crab3).width).toBeGreaterThan(inner(crab1).width as number)
  for (const c of [crab1, crab3]) expect(src(c)).toContain('<rect x="12" y="0" width="1.5" height="32" class="track"/>')
  expect((inner(find(t, 'helper-k3')!).width as number) + (inner(crab3).width as number)).toBe(52 * 8.5)
  expect(words(find(t, 'kids-rev'))).toBe('3 helpers')
})

test('pane: step blocks stop at 11 and fill in proportion', () => {
  const v = withAgents(paneViewOf('hydra'), a => a.map(x => (x.id === 'imp' ? { ...x, stepDone: 10, stepTotal: 20 } : x)))
  const s = src(find(paneTree(v), 'row-imp'))
  expect(s.match(/width="6" height="6" rx="2"/g)!.length).toBe(11); expect(s.match(/width="6" height="6" rx="2" class="role-implement"/g)!.length).toBe(6)
  expect(src(find(paneTree(paneViewOf('hydra')), 'row-imp')).match(/width="6" height="6" rx="2"/g)!.length).toBe(5)
})

test('pane: a summary that does not fit one line puts the cost and the time left on a second', () => {
  const wide = find(paneTree(paneViewOf('both')), 'head')!, narrow = find(paneTree(paneViewOf('both', { columns: 36 })), 'head')!
  expect(inner(wide).height).toBe(60); expect(inner(narrow).height).toBe(76)
  expect(src(narrow)).toMatch(/<text x="0" y="68" font-size="12"><tspan class="muted">≈\$1\.06<\/tspan><tspan class="muted"> · <\/tspan><tspan class="muted">~4m left</)
  const first = src(narrow).match(/<text x="0" y="52" font-size="12">(.*?)<\/text>/)![1]
  expect(first).toContain('> done</tspan>'); expect(first).not.toContain('≈$')
})

test('pane: the drawer opens still; only a line under a second old fades in while the older ones slide down', () => {
  const v = paneViewOf('drawerOpen'), imp = v.crew.agents.find(a => a.id === 'imp')!
  const at = (now: number, log = imp.log) => src(find(paneTree({ ...withAgents(v, a => a.map(x => (x.id === 'imp' ? { ...x, log } : x))), now }), 'drawer-imp'))
  // minute-aligned ages: no age crosses a minute between now and now+59 s
  const settled = imp.log.map((l, i) => ({ ...l, at: NOW - (i + 1) * 60_000 }))
  expect(at(NOW + 59_000, settled)).toBe(at(NOW, settled)); expect(at(NOW, settled)).not.toContain('animation')
  // lines under a minute old read <1m, so they hold still too until one crosses the minute
  const young = imp.log.map((l, i) => ({ ...l, at: NOW - 2_000 - i * 10_000 }))
  expect(at(NOW + 30_000, young)).toBe(at(NOW, young)); expect(at(NOW, young)).toContain('&lt;1m'); expect(at(NOW, young)).not.toContain('animation')
  const fresh = [{ kind: 'step' as const, text: 'Ran the fold test.', at: NOW - 400 }, ...settled]
  const s = at(NOW, fresh)
  expect(s).toContain('.nw{animation:in 300ms cubic-bezier(.2,.8,.2,1) 100ms both}')
  expect(s).toContain('@keyframes in{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}')
  expect(s).toContain('.old{animation:dn 300ms cubic-bezier(.2,.8,.2,1) both}'); expect(s).toContain('@keyframes dn{from{transform:translateY(-23px)}to{transform:none}}')
  expect(s.match(/<g class="nw">/g)!.length).toBe(1); expect(s.match(/<g class="old">/g)!.length).toBe(settled.length)
  expect(s).toMatch(/<g class="nw"><text[^>]*>Ran the fold test\.<\/text><text[^>]*>&lt;1m<\/text><\/g>/)
  expect(s).toMatch(/@media \(prefers-reduced-motion: reduce\)\{\*\{animation:none!important;transition:none!important\}\}<\/style>(?!.*<style>)/)
  expect(at(NOW + 1_000, fresh)).not.toContain('animation'); expect(s).not.toContain('.rv')
})

// Every text run an image draws, as [class, text], styles and titles dropped.
const pieces = (e: El) => [...src(e).replace(/<style>.*?<\/style>/g, '').replace(/<title>.*?<\/title>/g, '')
  .matchAll(/<(?:tspan|text)\b([^>]*)>([^<]*)(?=<)/g)].map(m => [m[1].match(/class="([^"]*)"/)?.[1] ?? '', unescape(m[2])] as const)
const VIEWS = ['hydra', 'needsYou', 'failed', 'both', 'drawerOpen', 'manyAgents'] as const

test('pane: a cut fragment under 8 characters is dropped, never a bare ellipsis; the struggling note stays', () => {
  const short: string[] = []
  for (const s of VIEWS) for (let columns = 36; columns <= 64; columns += 2) {
    const v = paneViewOf(s, { columns }), t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
    for (const e of all(t).filter(x => x.type === 'Svg' || x.type === 'Client')) for (const [, p] of pieces(e))
      if (p.endsWith('…') && [...p.slice(0, -1).trim()].length < 8) short.push(`${s} ${columns}: ${p}`)
    if (s === 'failed') expect(words(find(t, 'row-rev'))).toMatch(/3 failed tr/)
  }
  expect(short).toEqual([])
  // At 39 columns only a few letters of the verb fit after the note: they go, with the separator before them.
  expect(src(find(paneTree(paneViewOf('failed', { columns: 39 })), 'row-rev'))).toMatch(/<tspan class="warn">3 failed tries<\/tspan><\/text>/)
})

test('pane: a reading column with no estimate reads the clock and a muted so far', () => {
  const row = find(paneTree(paneViewOf('manyAgents')), 'row-m0')!
  expect(words(row)).toContain('0:10 so far'); expect(src(row)).toMatch(/<tspan class="fg" font-weight="600">0:10<\/tspan><tspan class="muted"> so far</)
  expect(String(inner(row).alt)).toContain('0:10 so far')
})

test('pane: the empty state says how agents arrive', () => {
  const e = paneTree(paneViewOf('emptyPane')).children![0] as El
  expect(pieces(e)).toEqual([['fg', 'No agents yet'], ['muted', 'Agents you start show up here']])
  expect(src(e)).toMatch(/font-size="12"[^>]*>Agents you start show up here</)
})

test('pane: the drawer footer wraps whole items and drops usually first when tight', () => {
  const foot = (columns: number) => {
    const v = paneViewOf('failed', { columns }), ui = { ...v.ui, open: 'e2e' }
    return pieces(find(paneTree({ ...v, ui }), 'drawer-e2e')!).map(([, p]) => p).join('|')
  }
  for (const f of ['steps |2/4', 'tries |3', 'context |62%', 'cost |≈$0.07', 'ran |2:10']) expect(foot(30)).toContain(f)
  expect(foot(30)).not.toContain('usually'); expect(foot(36)).toContain('usually |4m'); expect(foot(52)).toContain('usually |4m')
})

test('pane: a cut activity, question or reason carries its full text in a title and the alt, unframed', () => {
  const tip = (e: El) => src(e).match(/<title>([^<]*)<\/title>/)?.[1]
  const rev = find(paneTree(paneViewOf('hydra', { columns: 36 })), 'row-rev')!
  expect(unescape(tip(rev)!)).toBe('slower · Searching "UNATTENDED" in hooks/'); expect(String(inner(rev).alt)).toContain('slower · Searching "UNATTENDED" in hooks/')
  expect(tip(find(paneTree(paneViewOf('hydra')), 'row-imp')!)).toBeUndefined()
  const long = 'Should the fixture use Postgres, SQLite, or an in-memory fake that mirrors the migrations, given that the login flow test needs real constraints?'
  const need = find(paneTree(withAgents(paneViewOf('needsYou', { columns: 36 }), a => a.map(x => (x.id === 'e2e' ? { ...x, question: long } : x)))), 'row-e2e')!
  expect(unescape(tip(need)!)).toBe(long); expect(String(inner(need).alt)).toContain(long)
  const reason = 'Could not reach Postgres on :5432 after three restarts of the container and a fresh volume'
  const failed = find(paneTree(withAgents(paneViewOf('failed', { columns: 36 }), a => a.map(x => (x.id === 'e2e' ? { ...x, reason } : x)))), 'row-e2e')!
  expect(unescape(tip(failed)!)).toBe(reason); expect(String(inner(failed).alt)).toContain(reason)
  expect(tip(find(paneTree(paneViewOf('failed')), 'row-e2e')!)).toBeUndefined()
  const helperW = withAgents(paneViewOf('failed', { columns: 36 }), a => a.map(x => (x.id === 'rev' ? { ...x, helpers: x.helpers.map(h => (h.id === 'k2' ? { ...h, reason: 'no "cacheKey" anywhere in src/ or in the tests' } : h)) } : x)))
  const k2 = find(paneTree({ ...helperW, ui: { ...helperW.ui, shut: [] } }), 'helper-k2')!
  expect(unescape(tip(k2)!)).toBe('no "cacheKey" anywhere in src/ or in the tests'); expect(String(inner(k2).alt)).toContain('no "cacheKey" anywhere in src/ or in the tests')
  for (const e of [rev, need, failed, k2]) expect(inner(e).interactive).toBeUndefined()
})

test('pane: a helper that waits on you is pressed with ask:<id>; other helpers have no press', () => {
  const v = waitingHelper(), t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
  const k1 = find(t, 'helper-k1')!
  expect(k1.type).toBe('Client'); expect(inner(k1).press).toBe('ask:k1'); expect(inner(k1).hover).toBe(true)
  expect(find(t, 'helper-k2')!.type).toBe('Svg')
  expect(inner(find(paneTree(paneViewOf('needsYou')), 'row-e2e')!).press).toBe('row:e2e')
})

test('pane: the costs view lists turn N and $X newest first with the session total and a back row', () => {
  const v = paneViewOf('costs'), t = paneTree(v)
  expect(t.props!.key).toBe('clawpit-pane'); expect(find(t, 'head')).toBeUndefined()
  const back = find(t, 'back')!
  expect(back.type).toBe('Client'); expect(inner(back).press).toBe('crew'); expect(words(back)).toBe('Agents'); expect(String(inner(back).alt)).toBe('Back to the agents')
  const list = find(t, 'costs')!, w = words(list)
  expect(w.startsWith('Session cost $267 · 44 turns')).toBe(true)
  expect(w).toContain('turn 44 $2.46 turn 43 $1.10 turn 42 $0.85')
  expect(w.indexOf('turn 44')).toBeLessThan(w.indexOf('turn 25')); expect(w).not.toContain('turn 24')
  expect(String(inner(list).alt)).toContain('turn 44 $2.46')
  expect(src(list)).not.toContain('animation')
  const none = words(find(paneTree({ ...v, session: { costUsd: null, lastTurnUsd: null, turns: 0, tokens: 0, agentMs: 0 } }), 'costs')!)
  expect(none).toBe('Session cost no reading yet No turns yet')
  for (const c of clients(t)) expect(String(inner(c).press)).toBe('crew')
})

test('pane: the struggling note is never cut; its separator drops first', () => {
  for (const s of ['failed', 'both'] as const) for (let columns = 36; columns <= 64; columns += 2) {
    const note = pieces(find(paneTree(paneViewOf(s, { columns })), 'row-rev')!).filter(([, p]) => p.includes('failed tr')).map(([, p]) => p)
    expect(note.length).toBe(1); expect(['3 failed tries', '3 failed tries · ']).toContain(note[0])
  }
  const row = find(paneTree(paneViewOf('both', { columns: 36 })), 'row-rev')!
  expect(words(row)).toContain('REVIEW 3 failed tries'); expect(src(row)).toMatch(/<tspan class="warn">3 failed tries<\/tspan><\/text>/)
})

test('pane: a helper row keeps its title whole and wraps the reason to line 2 when tight', () => {
  const k2 = (columns: number, reason?: string) => {
    const v = paneViewOf('failed', { columns }), crew = reason ? { ...v.crew, agents: v.crew.agents.map(x => ({ ...x, helpers: x.helpers.map(h => (h.id === 'k2' ? { ...h, reason } : h)) })) } : v.crew
    return find(paneTree({ ...v, crew, ui: { ...v.ui, shut: [] } }), 'helper-k2')!
  }
  const line = (e: El, y: number, cls: string) => [...src(e).matchAll(new RegExp(`<text x="10" y="${y}" class="${cls}" font-size="12" font-weight="600">([^<]*)</text>`, 'g'))].map(m => unescape(m[1]))
  const tight = k2(36)
  expect(inner(tight).height).toBe(32)
  expect(pieces(tight).filter(([, p]) => p.includes('cach'))).toEqual([['fg', 'map the cache keys'], ['er', 'no "cacheKey" in src/']])
  expect(line(tight, 13, 'fg')).toEqual(['map the cache keys']); expect(line(tight, 27, 'er')).toEqual(['no "cacheKey" in src/'])
  expect(String(inner(tight).alt)).toContain('no "cacheKey" in src/')
  const long = k2(36, 'no "cacheKey" in src/ or lib/ after 3 passes over port 5432 config'), second = line(long, 27, 'er')
  expect(second.length).toBe(1); expect(second[0].endsWith('…')).toBe(true); expect(second[0]).not.toMatch(/\d…$/)
  expect(unescape(src(long).match(/<title>([^<]*)<\/title>/)![1])).toBe('no "cacheKey" in src/ or lib/ after 3 passes over port 5432 config')
  expect(words(k2(52))).toContain('map the cache keys no "cacheKey" in src/')
})

test('pane: the empty state ranks its title over the hint', () => {
  const e = paneTree(paneViewOf('emptyPane')).children![0] as El
  expect(src(e)).toMatch(/class="fg" font-size="13"[^>]*>No agents yet</); expect(src(e)).toMatch(/class="muted" font-size="12"[^>]*>Agents you start show up here</)
})

const costList = (turnCosts: number[], turns: number) => {
  const v = paneViewOf('costs')
  return find(paneTree({ ...v, session: { ...v.session, turns, turnCosts } }), 'costs')!
}

test('pane: the cost list right-aligns its amounts at the reading column edge', () => {
  const list = costList([0.42, 12.40], 10), edge = 52 * 8.5 - 8 - 16 - 10
  for (const amount of ['$0.42', '$12.40'])
    expect(src(list)).toMatch(new RegExp(`<text x="${edge}" y="[\\d.]+" class="fg" font-size="12" text-anchor="end">${amount.replace('$', '\\$').replace('.', '\\.')}</text>`))
  for (const turn of ['turn 9', 'turn 10']) expect(src(list)).toMatch(new RegExp(`<text x="0" y="[\\d.]+" class="muted" font-size="12">${turn}</text>`))
  expect(src(list)).toContain('tabular-nums'); expect(words(list)).not.toMatch(/turn \d+ ·/)
})

test('pane: in the cost list only the session total is bold', () => {
  const bold = [...src(find(paneTree(paneViewOf('costs')), 'costs')!).matchAll(/font-weight="600"[^>]*>([^<]*)</g)].map(m => m[1]).filter(t => t.includes('$'))
  expect(bold).toEqual(['$267'])
})

test('pane: the cost list says how many turns it shows', () => {
  const list = find(paneTree(paneViewOf('costs')), 'costs')!, w = words(list)
  expect(src(list)).toMatch(/class="muted" font-size="12" font-weight="600">Last 20 turns</)
  expect(w.indexOf('44 turns')).toBeLessThan(w.indexOf('Last 20 turns')); expect(w.indexOf('Last 20 turns')).toBeLessThan(w.indexOf('turn 44'))
  expect(words(costList([0.42, 12.40], 10))).toContain('Last 2 turns'); expect(words(costList([0.42], 1))).toContain('Last 1 turn turn 1')
})

// The pane width the app gives, measured in the app.
const APP_COLUMNS = 29
const titled = (s: Parameters<typeof paneViewOf>[0], id: string, title: string, columns = APP_COLUMNS) =>
  withAgents(paneViewOf(s, { columns }), a => a.map(x => (x.id === id ? { ...x, title } : x)))
const texts = (e: El) => pieces(e).map(([, p]) => p)

test('pane: at the width the app gives, row titles keep their words', () => {
  expect(texts(find(paneTree(titled('hydra', 'imp', 'Fixture runner')), 'row-imp')!)).toContain('Fixture runner')
  // Alert rows size their own reading column, so a needs-you row does not narrow the running rows.
  expect(texts(find(paneTree(titled('needsYou', 'imp', 'Fixture runner')), 'row-imp')!)).toContain('Fixture runner')
  const need = find(paneTree(titled('needsYou', 'e2e', 'Fixture needs you')), 'row-e2e')!
  expect(texts(need)).toContain('Fixture needs you'); expect(texts(need)).toContain('<1m'); expect(words(need)).not.toContain('waiting')
  expect(String(inner(need).alt)).toContain('waiting <1m')
  const failed = find(paneTree(titled('failed', 'e2e', 'Fixture that failed')), 'row-e2e')!
  expect(texts(failed)).toContain('Fixture that failed'); expect(texts(failed)).toContain('failed'); expect(words(failed)).not.toContain('after 2:10')
  expect(String(inner(failed).alt)).toContain('failed after 2:10')
  // Where the title fits, the row keeps its words.
  expect(words(find(paneTree(titled('needsYou', 'e2e', 'Fixture needs you', 52)), 'row-e2e')!)).toContain('waiting <1m')
  expect(words(find(paneTree(titled('failed', 'e2e', 'Fixture that failed', 52)), 'row-e2e')!)).toContain('after 2:10')
})

test('pane: running rows share one reading-column edge, sized to the widest reading in view', () => {
  const long = 'Fixture runner for the login flow'
  const v = withAgents(paneViewOf('hydra', { columns: APP_COLUMNS }), a => a.map(x => (x.id === 'imp' ? { ...x, title: long }
    : x.id === 'e2e' ? { ...x, title: long, eta: { kind: 'none' as const } } : x)))
  const t = paneTree(v), title = (id: string) => texts(find(t, `row-${id}`)!)[0]
  // e2e's "3:30 so far" is the widest reading: imp's title gets no more room than e2e's.
  expect(title('imp')).toBe(title('e2e')); expect(title('imp').startsWith('Fixture run')).toBe(true)
})

test('pane: no text is ever a lone ellipsis, at 28 to 64 cells', { timeoutMs: 20000 } as never, () => {
  const bare: string[] = []
  for (const s of [...VIEWS, 'helpers', 'helperNeedsYou', 'nestedHelper'] as const) for (let columns = 28; columns <= 64; columns++) {
    for (const v of [paneViewOf(s, { columns }), titled(s, 'e2e', 'Fixture needs you', columns)]) {
      const t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
      for (const e of all(t).filter(x => x.type === 'Svg' || x.type === 'Client')) for (const [, p] of pieces(e))
        if (p.endsWith('…') && [...p.slice(0, -1).trim()].length < 8) bare.push(`${s} ${columns}: ${JSON.stringify(p)}`)
    }
  }
  expect(bare).toEqual([])
  // A dropped second line hands its ellipsis back: a cut reason never reads as one whole word.
  expect(texts(find(paneTree(paneViewOf('failed', { columns: APP_COLUMNS })), 'row-e2e')!)).not.toContain('Could')
})

const NARROW = [28, 29, 30] as const
// The er lines of an alert row's question or reason, in order.
const why = (e: El) => [...src(e).matchAll(/<text x="[\d.]+" y="(?:37|53)" class="er" font-size="12" font-weight="600">([^<]*)<\/text>/g)].map(m => unescape(m[1]))

test('pane: an alert row always shows its why at the width the app gives', () => {
  for (const s of ['needsYou', 'failed', 'both', 'sizeGauges', 'sizeLine'] as const) for (const columns of NARROW) {
    const v = paneViewOf(s, { columns }), t = paneTree(v)
    for (const a of v.crew.agents.filter(x => x.state === 'need' || x.state === 'failed')) {
      const shown = why(find(t, `row-${a.id}`)!).join(' ').replace(/…$/, '')
      expect(`${s} ${columns} ${a.id}: ${[...shown].length >= 16 || shown === (a.question ?? a.reason)}`).toBe(`${s} ${columns} ${a.id}: true`)
    }
  }
  // The second line wraps under the tag, from the title's x.
  const row = find(paneTree(paneViewOf('needsYou', { columns: 28 })), 'row-e2e')!
  expect(why(row)[0]).toBe('Postgres or'); expect(src(row)).toMatch(/<text x="48" y="53" class="er" font-size="12" font-weight="600">SQLite/)
  expect(why(find(paneTree(paneViewOf('both', { columns: 28 })), 'row-pln')!)).toEqual(['Ship the', 'release notes in…'])
})

test('pane: a waiting helper keeps "waiting Nm" where its title fits the row, however long its question', () => {
  for (const columns of [36, 40, 41]) {
    const v = paneViewOf('helperNeedsYou', { columns }), row = find(paneTree({ ...v, ui: { ...v.ui, shut: [] } }), 'helper-k1')!
    expect(`${columns}: ${src(row).includes('font-weight="600">waiting 1m</tspan>')}`).toBe(`${columns}: true`)
  }
})

test('pane: the struggling note never drops; where it and the tag will not both fit it takes the tag slot', () => {
  for (const s of ['failed', 'both'] as const) for (const columns of NARROW) {
    const t = paneTree(paneViewOf(s, { columns })), row = find(t, 'row-rev')!
    expect(texts(row).filter(p => p.startsWith('3 failed tries')).length).toBe(1)
    if (!texts(row).includes('REVIEW')) expect(src(row)).toMatch(/<text x="10" y="38" font-size="12"><tspan class="warn">3 failed tries/)
    expect(String(inner(find(t, 'crab-rev')!).alt)).toContain('review')
  }
})

// Each row's title as drawn: its first fg piece, which must start the agent's title; '' when the title dropped.
const titleIds = (as: CrewAgent[]): [string, string][] => as.flatMap(a => [[a.id, a.title] as [string, string], ...titleIds(a.helpers)])
const shownTitles = (t: El, v: ReturnType<typeof paneViewOf>) => {
  const titles = new Map(titleIds(v.crew.agents))
  return all(t).filter(x => /^(row|helper)-/.test(String(x.props?.key ?? ''))).map(e => {
    const key = String(e.props!.key), title = titles.get(key.replace(/^(row|helper)-/, ''))!
    const p = (pieces(e).find(([cls]) => cls === 'fg')?.[1] ?? '').trim().replace(/…$/, '')
    return { key, title, shown: p && title.startsWith(p) ? p : '' }
  })
}

test('pane: a title never drops; the reading shortens first', () => {
  const nested = paneViewOf('nestedHelper', { columns: 28 }), k3 = texts(find(paneTree({ ...nested, ui: { ...nested.ui, shut: [] } }), 'helper-k3')!)
  expect(k3.some(p => 'read the guard tests'.startsWith(p.replace(/…$/, '')) && [...p.replace(/…$/, '')].length >= 8)).toBe(true)
  for (const s of [...VIEWS, 'helpers', 'helperNeedsYou', 'nestedHelper'] as const) for (let columns = 28; columns <= 64; columns++) {
    const v = paneViewOf(s, { columns }), t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
    for (const { key, title, shown } of shownTitles(t, v)) expect(`${s} ${columns} ${key}: ${[...shown].length >= Math.min(8, [...title].length)}`).toBe(`${s} ${columns} ${key}: true`)
  }
})

test('pane: one smooth reading edge: titles never shrink as the pane widens, helpers share the running rows\' edge', () => {
  for (const s of [...VIEWS, 'helpers', 'helperNeedsYou', 'nestedHelper'] as const) {
    const last = new Map<string, number>()
    for (let columns = 28; columns <= 64; columns++) {
      const v = paneViewOf(s, { columns }), t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
      for (const { key, shown } of shownTitles(t, v)) {
        const len = [...shown].length
        expect(`${s} ${key} at ${columns}: ${len >= (last.get(key) ?? 0)}`).toBe(`${s} ${key} at ${columns}: true`)
        last.set(key, len)
      }
    }
  }
  const long = 'Fixture runner for the login flow and the rest'
  const v = withAgents(paneViewOf('hydra', { columns: APP_COLUMNS }), a => a.map(x => (x.id === 'imp' ? { ...x, title: long }
    : x.id === 'rev' ? { ...x, helpers: x.helpers.map(h => (h.id === 'k2' ? { ...h, title: long } : h)) } : x)))
  const t = paneTree({ ...v, ui: { ...v.ui, shut: [] } })
  const end = (key: string, x0: number, size: number) => x0 + textWidth(pieces(find(t, key)!).find(([cls]) => cls === 'fg')![1], size, 600)
  expect(Math.abs(end('row-imp', 38 + 10, 13) - end('helper-k2', 50 + 10, 12))).toBeLessThan(12)
})

test('pane: every image names the whole font list, its quotes escaped in the style attribute', () => {
  const fonts = (['hydra', 'both', 'manyAgents'] as const).flatMap(s => all(paneTree(paneViewOf(s))).filter(e => e.type === 'Svg' || e.type === 'Client')
    .flatMap(e => [...src(e).matchAll(/style="font-family:([^"]*?);font-variant/g)].map(m => unescape(m[1]))))
  expect(fonts.length).toBeGreaterThan(0)
  expect(fonts.every(f => f === FONT)).toBe(true)
})

// The model: one muted word under the reading on every row, never cut; effort in the drawer and the alt only.
const alt = (e: El | undefined) => String(e ? inner(e).alt : '')
const open = (v: ReturnType<typeof paneViewOf>) => ({ ...v, ui: { ...v.ui, shut: [] } })
const rowKeys = (t: El) => keys(t).filter(k => /^(row|helper|ended)-/.test(k))
const modelOf = (v: ReturnType<typeof paneViewOf>) => {
  const m = new Map<string, string>()
  for (const a of [...v.crew.agents, ...v.crew.agents.flatMap(helpersOf), ...v.crew.ended]) m.set(a.id, a.model)
  return m
}
const setModel = (v: ReturnType<typeof paneViewOf>, model: (a: CrewAgent) => string, o: Partial<CrewAgent> = {}) => {
  const f = (a: CrewAgent): CrewAgent => ({ ...a, model: model(a), ...o, helpers: a.helpers.map(f) })
  return { ...v, crew: { ...v.crew, agents: v.crew.agents.map(f), ended: v.crew.ended.map(f) } }
}

test('pane: every row shows its model word whole, at every width', () => {
  for (const s of ['hydra', 'both', 'nestedHelper', 'helperNeedsYou'] as const) for (const columns of [28, 30, 36, 52]) {
    const v = open(paneViewOf(s, { columns })), models = modelOf(v), t = paneTree(v), ks = rowKeys(t)
    expect(ks.length).toBeGreaterThan(0)
    for (const k of ks) {
      const id = k.replace(/^(row|helper|ended)-/, ''), m = modelLabel(models.get(id))
      expect([s, columns, k, words(find(t, k)).includes(m.short)]).toEqual([s, columns, k, true])
      expect(alt(find(t, k))).toContain(m.name)
    }
  }
})

test('pane: an unknown family reads as its word, whole, at 28 columns', () => {
  const v = setModel(open(paneViewOf('both', { columns: 28 })), () => 'claude-supercalifragilistic-9'), t = paneTree(v)
  const m = modelLabel('claude-supercalifragilistic-9')
  for (const k of rowKeys(t)) { const w = words(find(t, k)); expect([k, w.includes(m.short) || w.includes(m.name)]).toEqual([k, true]) }
})

test('pane: the model takes nothing from titles, tags or activity', () => {
  const cases: [Parameters<typeof paneViewOf>[0], number[]][] = [['hydra', [28, 30, 52]], ['nestedHelper', [28, 30, 52]],
    ['both', [28, 30, 32, 33, 46, 47, 52]], ['failed', [32, 33, 46, 47]], ['helperNeedsYou', [46, 47, 52]]]
  for (const [s, widths] of cases) for (const columns of widths) {
    const v = open(paneViewOf(s, { columns })), bare = paneTree(setModel(v, () => '')), t = paneTree(v)
    for (const k of rowKeys(t)) {
      const m = modelLabel(modelOf(v).get(k.replace(/^(row|helper|ended)-/, '')))
      // The image's words with its one model line taken out: the muted 10px text holding the name or the word.
      const line = new RegExp(`<text [^>]*class="muted" font-size="10"[^>]*>(${[m.name, m.short].map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})</text>`)
      const e = find(t, k)!, s0 = src(e), cut = s0.replace(line, '')
      expect([s, columns, k, cut !== s0, wordsOf(cut)]).toEqual([s, columns, k, true, words(find(bare, k))])
    }
  }
})

test('pane: an empty model id draws nothing and says nothing', () => {
  const v = setModel(paneViewOf('hydra'), () => ''), t = paneTree(v)
  expect(alt(find(t, 'row-rev'))).toMatch(/^cache-tax review c1, ~/)
  for (const k of rowKeys(t)) expect(words(find(t, k))).not.toMatch(/Opus|Sonnet|Haiku|Fable/)
})

test('pane: effort is in the alt and the drawer only when the run has one', () => {
  const bare = (a: CrewAgent) => a.model.replace('[1m]', ''), v = paneViewOf('drawerOpen')
  const withE = paneTree(setModel(v, bare, { effort: 'high' })), without = paneTree(setModel(v, bare, { effort: undefined }))
  expect(alt(find(withE, 'row-imp'))).toContain('Sonnet 5.5, high effort'); expect(words(find(withE, 'drawer-imp'))).toContain('effort high')
  expect(words(find(withE, 'row-imp'))).not.toContain('high')
  expect(alt(find(without, 'row-imp'))).not.toContain('effort'); expect(words(find(without, 'drawer-imp'))).not.toContain('effort')
  expect(words(find(without, 'drawer-imp'))).toContain('model Sonnet 5.5')
})

test('pane: a 1M id reads its window in the drawer context only', () => {
  const v = setModel(paneViewOf('drawerOpen'), a => a.model.replace('[1m]', '')), wide = paneTree(setModel(v, a => `${a.model}[1m]`)), plain = paneTree(v)
  expect(words(find(wide, 'drawer-imp'))).toContain('context 38% of 1M'); expect(words(find(plain, 'drawer-imp'))).not.toContain('of 1M')
  expect(alt(find(wide, 'row-imp'))).toContain('Sonnet 5.5, 1M window')
})

test('pane: a long model name does not move the reading edge', () => {
  const v = paneViewOf('hydra', { columns: 30 }), long = paneTree(setModel(v, a => (a.id === 'rev' ? 'gpt-5-codex-max-preview' : a.model))), t = paneTree(v)
  for (const k of ['row-e2e', 'row-imp', 'helper-k1']) expect(words(find(long, k))).toBe(words(find(t, k)))
})

test('pane: 80 agents with models, efforts and a drawer stay under both bounds at every width', { timeoutMs: 20000 } as never, () => {
  // Odd widths draw fractional pixels, so each is checked, not only a reference one.
  for (let columns = 20; columns <= 120; columns++) for (const rich of [false, true]) {
    const v0 = paneViewOf('manyAgents', { columns }), v = rich ? setModel(v0, a => `${a.model}[1m]`, { effort: 'xhigh' }) : v0
    for (const t of [paneTree(v), paneTree({ ...v, ui: { ...v.ui, open: v.crew.agents[0].id } })])
      expect([columns, rich, engine(t) <= ENGINE_MAX, JSON.stringify(t).length <= HOST_MAX]).toEqual([columns, rich, true, true])
  }
})

test('pane: an alert row and the drawer name the model in their alt, the state after a comma', () => {
  const t = paneTree(setModel(open(paneViewOf('both')), a => a.model, { effort: 'high' }))
  expect(alt(find(t, 'row-pln'))).toMatch(/^plan the release, Fable 5\.2, high effort, needs you, waiting /)
  expect(alt(find(t, 'row-e2e'))).toMatch(/^e2e tests, Haiku 5\.5, high effort, failed after /)
  const d = paneTree(paneViewOf('drawerOpen'))
  expect(alt(find(d, 'drawer-imp'))).toMatch(/^savvy-progress implement log, Sonnet 5\.5/)
})

test('pane: an alert helper sizes its column on the word; the name shows only where that column holds it', () => {
  const wait = paneTree(open(paneViewOf('helperNeedsYou', { columns: 52 }))), fail = paneTree(open(paneViewOf('both', { columns: 52 })))
  expect(words(find(wait, 'helper-k1'))).toMatch(/waiting 1m Haiku 5\.5$/)   // "waiting 1m" is wider than the name
  expect(words(find(fail, 'helper-k2'))).toMatch(/failed Haiku$/)            // "failed" is not
  // A long name never costs a waiting helper its question.
  const long = (m: string) => words(find(paneTree(setModel(open(paneViewOf('helperNeedsYou', { columns: 40 })), () => m)), 'helper-k1'))
  expect(long('claude-opus-4-6-thinking').replace(/ Opus( 4\.6 thinking)?$/, '')).toBe(long('opus').replace(/ Opus$/, ''))
})

test('pane: a long ended title never runs under its model', () => {
  const title = 'refactor the payment gateway retry policy and typings'
  for (const model of ['claude-sonnet-5-5', 'gemini-2.5-pro', 'claude-opus-4-6-thinking']) for (const columns of [30, 36, 40, 52]) {
    const v = paneViewOf('endedOpen', { columns }), crew = { ...v.crew, ended: v.crew.ended.map(a => ({ ...a, title, model })) }
    const e = find(paneTree({ ...v, crew }), `ended-${crew.ended[0].id}`)!, s0 = src(e)
    const tw = textWidth(unescape(/<text x="38"[^>]*>([^<]*)<\/text>/.exec(s0)![1]), 12)
    const mline = /<text x="([\d.]+)" y="26"[^>]*>([^<]*)<\/text>/.exec(s0)!
    expect([model, columns, 38 + tw <= +mline[1] - textWidth(mline[2], 10) - 4]).toEqual([model, columns, true])
  }
})

// The main session waiting on you: a "Claude" row in Needs you, not an agent and not pressable.
const QUESTION = 'Ship the schema change behind a flag, or migrate every row now?'
test('pane: a session need alone draws the head, the Needs you header and its row, never the empty state', () => {
  const t = paneTree(paneViewOf('sessionNeed'))
  expect(keys(t).filter(k => k !== 'clawpit-pane')).toEqual(['head', 'sec-need', 'session'])
  expect(words(find(t, 'head'))).toContain('1 needs you · 0 running · 0 done')
  // No agent, so no crew bar: the bar is one segment per agent.
  expect(src(find(t, 'head'))).not.toContain('translate(0 26)')
})

test('pane: the session row is a 62px needs-you row with no press, no hover and no chevron; its alt says where to answer', () => {
  const row = find(paneTree(paneViewOf('sessionNeed')), 'session')!
  expect(inner(row).height).toBe(62); expect(inner(row).press).toBeUndefined(); expect(inner(row).hover).toBeUndefined()
  expect(src(row)).toContain('class="needTint"'); expect(src(row)).not.toContain('M4.5 2.5 8 6l-3.5 3.5')
  expect(words(row).startsWith('Claude ')).toBe(true); expect(words(row)).not.toMatch(/EXPLORE/)
  expect(String(inner(row).alt)).toBe(`Claude needs you, waiting 12m: ${QUESTION}. Answer in the prompt.`)
})

test('pane: the session row reads its age alone up to 30 cells and "waiting 12m" from 36; the question stays left of the reading', () => {
  const reads: Record<number, string> = { 28: '12m', 30: '12m', 36: 'waiting 12m', 41: 'waiting 12m', 52: 'waiting 12m' }
  for (const [w, want] of Object.entries(reads)) {
    const row = find(paneTree(paneViewOf('sessionNeed', { columns: +w })), 'session')!, W = inner(row).width as number
    const read = [...src(row).matchAll(/<text x="[\d.]+" y="24" class="er" font-size="13" font-weight="600" text-anchor="end">([^<]*)<\/text>/g)].map(m => m[1])
    expect(read).toEqual([want])
    const lines = [...src(row).matchAll(/<text x="([\d.]+)" y="(37|53)" class="er" font-size="12" font-weight="600">([^<]*)<\/text>/g)]
    expect(lines.length).toBeGreaterThan(0)
    for (const [, x, , s] of lines) { expect(+x).toBe(48); expect(+x + textWidth(unescape(s), 12, 600)).toBeLessThanOrEqual(W - 34 - textWidth(want, 13, 600)) }
  }
})

test('pane: a cut session question keeps its full words in a title; a whole one has none', () => {
  const tip = (cols: number) => src(find(paneTree(paneViewOf('sessionNeed', { columns: cols })), 'session')).match(/<title>([^<]*)<\/title>/)?.[1]
  expect(unescape(tip(28)!)).toBe(QUESTION)
  expect(tip(52)).toBeUndefined()
})

test('pane: the session row sits with the waiting agents by wait and takes the one ring when it waited longest', () => {
  const v = paneViewOf('sessionNeedCrew'), t = paneTree(v), k = keys(t)
  expect(k.indexOf('session')).toBeLessThan(k.indexOf('row-e2e')); expect(k.indexOf('sec-need')).toBeLessThan(k.indexOf('session'))
  expect(src(find(t, 'session'))).toContain('class="s-ring60 ring"'); expect(src(find(t, 'row-e2e'))).not.toContain('animation')
  expect(paneLoopCount(v)).toBe(paneLoopCount(paneViewOf('needsYou')))
  // Asked after e2e: below it, still, and e2e rings.
  const later = { ...v.crew, sessionNeed: { question: QUESTION, since: NOW - 1_000 } }, t2 = paneTree({ ...v, crew: later, loops: pickLoops(later, v.ui, true, true) })
  const k2 = keys(t2)
  expect(k2.indexOf('row-e2e')).toBeLessThan(k2.indexOf('session'))
  expect(src(find(t2, 'session'))).not.toContain('animation'); expect(src(find(t2, 'row-e2e'))).toContain('class="s-ring60 ring"')
  // The crew bar keeps one segment per agent; the summary counts the session.
  const plain = paneTree(paneViewOf('sessionNeedCrew', { crew: { ...v.crew, sessionNeed: undefined } }))
  const bar = (e: El | undefined) => src(e).split('translate(0 26)')[1].split('<text')[0]
  expect(bar(find(t, 'head'))).toBe(bar(find(plain, 'head'))); expect(words(find(t, 'head'))).toContain('2 needs you')
})

// The one-time setup row: the question as a plain image, then Yes and No, each its own press.
const OFFER_Q = 'Light Needs you when this session asks you a question?'
const offerKeys = (t: El) => keys(t).filter(k => k.startsWith('offer'))
test('pane: the setup offer sits directly under the head on the crew view, and on top of an otherwise empty pane', () => {
  expect(keys(paneTree(paneViewOf('offer'))).filter(k => k !== 'clawpit-pane')).toEqual(['offer', 'offer-yes', 'offer-no', 'empty'])
  const k = keys(paneTree(paneViewOf('offerCrew'))).filter(x => x !== 'clawpit-pane')
  expect(k.slice(0, 5)).toEqual(['head', 'offer', 'offer-yes', 'offer-no', 'sec-running'])
  expect(offerKeys(paneTree(paneViewOf('hydra')))).toEqual([])
})

test('pane: the setup offer hides while anything needs you or has failed, and on the costs view', () => {
  const offer = paneViewOf('offer').offer
  for (const s of ['needsYou', 'failed', 'both', 'helperNeedsYou', 'sessionNeed', 'sessionNeedCrew'] as const) expect([s, offerKeys(paneTree(paneViewOf(s, { offer })))]).toEqual([s, []])
  expect(offerKeys(paneTree(paneViewOf('costs', { offer })))).toEqual([])
})

test('pane: the setup offer is fixed, so a crew cut into "+N more" keeps it', () => {
  const t = paneTree(paneViewOf('manyAgents', { offer: paneViewOf('offer').offer }))
  expect(offerKeys(t)).toEqual(['offer', 'offer-yes', 'offer-no']); expect(keys(t)).toContain('more-running')
})

test('pane: the setup offer\'s three alts name the question and what each button writes; Yes says what it costs', () => {
  const t = paneTree(paneViewOf('offer')), text = find(t, 'offer')!, yes = find(t, 'offer-yes')!, no = find(t, 'offer-no')!
  expect(text.type).toBe('Svg'); expect(inner(text).press).toBeUndefined(); expect(inner(text).height).toBe(56)
  expect(String(inner(text).alt)).toBe(`One-time setup: ${OFFER_Q}`)
  expect(String(inner(yes).alt)).toBe('Yes: Session needs you set to both. This opts into about 40 schema tokens; the progress field takes effect from the next session.')
  expect(String(inner(no).alt)).toBe('No: Session needs you set to off')
  // A setting with no note says only what it writes.
  const plain = { ...paneViewOf('offer').offer!, key: 'clawpit.other' }
  expect(String(inner(find(paneTree(paneViewOf('offer', { offer: plain })), 'offer-yes')!).alt)).toBe('Yes: Session needs you set to both')
})

test('pane: Yes and No are equal-weight pressable chips, 42 and 38 px wide', () => {
  const t = paneTree(paneViewOf('offerCrew')), yes = find(t, 'offer-yes')!, no = find(t, 'offer-no')!
  expect([yes.type, no.type]).toEqual(['Client', 'Client'])
  expect([inner(yes).press, inner(no).press]).toEqual(['offer:yes', 'offer:no']); expect([inner(yes).hover, inner(no).hover]).toEqual([true, true])
  expect([inner(yes).width, inner(no).width]).toEqual([42, 38])
  const classes = (e: El) => [...src(e).matchAll(/class="([^"]+)"/g)].map(m => m[1])
  expect(classes(yes)).toEqual(classes(no)); expect(classes(yes)).toEqual(['wash', 'fg'])
  expect(src(yes)).toContain('font-weight="600"'); expect(src(no)).toContain('font-weight="600"')
  expect([words(yes), words(no)]).toEqual(['Yes', 'No'])
})

test('pane: the setup caption counts the offers waiting', () => {
  const v = paneViewOf('offer'), cap = (more: number) => words(find(paneTree({ ...v, offer: { ...v.offer!, more } }), 'offer')).split(' Light')[0]
  expect(cap(0)).toBe('One-time setup'); expect(cap(1)).toBe('One-time setup · 1 of 2'); expect(cap(2)).toBe('One-time setup · 1 of 3')
})

test('pane: the setup question wraps on words to two lines that fit the pane; a long one is cut on line 2 and keeps its words in a title', () => {
  const long = 'Show a short line under the crew bar that names the next step of the plan for every agent?'
  for (const columns of [28, 30, 36, 41, 52]) for (const q of [OFFER_Q, long]) {
    const v = paneViewOf('offer', { columns }), e = find(paneTree({ ...v, offer: { ...v.offer!, question: q } }), 'offer')!, W = inner(e).width as number
    const lines = [...src(e).matchAll(/<text x="8" y="(32|48)" class="fg" font-size="12">([^<]*)<\/text>/g)].map(m => unescape(m[2]))
    expect(lines.length).toBeGreaterThan(0); expect(lines.length).toBeLessThanOrEqual(2)
    for (const l of lines) expect(8 + textWidth(l, 12)).toBeLessThanOrEqual(W - 8)
    const cut = lines.join(' ') !== q
    if (cut) { expect(lines.at(-1)!.endsWith('…')).toBe(true); expect([...lines.at(-1)!.slice(0, -1).trim()].length).toBeGreaterThanOrEqual(8) }
    expect(/<title>/.test(src(e))).toBe(cut)
    expect(String(inner(e).alt)).toBe(`One-time setup: ${q}`)
  }
  // The real question is whole from 28 cells up; the long one is cut at 28 and whole at 52.
  expect(words(find(paneTree(paneViewOf('offer', { columns: 28 })), 'offer'))).toBe(`One-time setup ${OFFER_Q}`)
})

test('pane: with cost hidden and no time left, a narrow head keeps one row', () => {
  const v = paneViewOf('both', { columns: 28 }), bare = { ...v, crew: { ...v.crew, leftMin: null } }
  expect(inner(find(paneTree({ ...bare, showCost: false }), 'head')!).height).toBe(60); expect(inner(find(paneTree(bare), 'head')!).height).toBe(76)
})

test('pane: one setup offer costs the engine under 2,000 characters', () => {
  for (const columns of [28, 52]) {
    const t = paneTree(paneViewOf('offer', { columns })), offer = all(t).find(e => e.type === 'Box' && (e.children ?? []).some(c => typeof c !== 'string' && c.props?.key === 'offer'))!
    expect(engine(offer)).toBeLessThan(2_000)
  }
})

test('pane: showCost false hides the agent cost in the head and its alt and in the drawer; unset or true draws it', () => {
  const v = paneViewOf('failed'), ui = { ...v.ui, open: 'e2e' }, open = { ...v, ui, loops: pickLoops(v.crew, ui, true, true) }
  const head = (x: typeof v) => find(paneTree(x), 'head')!, drawer = (x: typeof v) => find(paneTree(x), 'drawer-e2e')!
  for (const x of [open, { ...open, showCost: true }]) {
    expect(words(head(x))).toContain('≈$'); expect(String(head(x).props!.alt)).toContain('≈$'); expect(words(drawer(x))).toContain('cost ≈$')
  }
  const off = { ...open, showCost: false }
  expect(words(head(off))).not.toContain('≈$'); expect(String(head(off).props!.alt)).not.toContain('≈$')
  expect(words(drawer(off))).not.toContain('cost'); expect(words(drawer(off))).toContain('context 62%')
})
