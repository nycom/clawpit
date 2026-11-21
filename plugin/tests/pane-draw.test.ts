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
  expect(words(bad)).toBe('e2e tests failed after 2:10'); expect(src(bad)).toContain('M3 3l6 6M9 3 3 9'); expect(src(bad)).toMatch(/class="er"[^>]*>failed after 2:10</)
  expect(words(done)).toBe('docs pass 1:05'); expect(src(done)).toContain('M2.5 6.3 5 8.8l4.5-5.3'); expect(src(done)).toMatch(/class="okText"[^>]*>1:05</)
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
    expect(words(at(ms))).toMatch(new RegExp(`Keep\\b.* ${age}$`))
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
  // At 40 columns only a few letters of the verb fit after the note: they go, with the separator before them.
  expect(src(find(paneTree(paneViewOf('failed', { columns: 40 })), 'row-rev'))).toMatch(/<tspan class="warn">3 failed tries<\/tspan><\/text>/)
})

test('pane: a reading column with no estimate reads the clock and a muted so far', () => {
  const row = find(paneTree(paneViewOf('manyAgents')), 'row-m0')!
  expect(words(row)).toContain('0:10 so far'); expect(src(row)).toMatch(/<tspan class="fg" font-weight="600">0:10<\/tspan><tspan class="muted"> so far</)
  expect(String(inner(row).alt)).toContain('0:10 so far')
})

test('pane: the empty state says how agents arrive', () => {
  const e = paneTree(paneViewOf('emptyPane')).children![0] as El
  expect(pieces(e)).toEqual([['muted', 'No agents yet'], ['muted', 'Agents you start show up here']])
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

test('pane: the costs view lists turn N · $X newest first with the session total and a back row', () => {
  const v = paneViewOf('costs'), t = paneTree(v)
  expect(t.props!.key).toBe('clawpit-pane'); expect(find(t, 'head')).toBeUndefined()
  const back = find(t, 'back')!
  expect(back.type).toBe('Client'); expect(inner(back).press).toBe('crew'); expect(words(back)).toBe('Agents'); expect(String(inner(back).alt)).toBe('Back to the agents')
  const list = find(t, 'costs')!, w = words(list)
  expect(w.startsWith('Session cost $267 · 44 turns')).toBe(true)
  expect(w).toContain('turn 44 · $2.46 turn 43 · $1.10 turn 42 · $0.85')
  expect(w.indexOf('turn 44')).toBeLessThan(w.indexOf('turn 25')); expect(w).not.toContain('turn 24')
  expect(String(inner(list).alt)).toContain('turn 44 $2.46')
  expect(src(list)).not.toContain('animation')
  const none = words(find(paneTree({ ...v, session: { costUsd: null, lastTurnUsd: null, turns: 0, tokens: 0, agentMs: 0 } }), 'costs')!)
  expect(none).toBe('Session cost no reading yet No turns yet')
  for (const c of clients(t)) expect(String(inner(c).press)).toBe('crew')
})
