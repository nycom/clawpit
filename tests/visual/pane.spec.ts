import { test, expect } from '@playwright/test'
import { show, loops, alts } from './harness'
import { paneTree } from '../../plugin/hooks/pane/draw'
import { pickLoops, BUDGET } from '../../plugin/hooks/loops'
import { paneLoopCount, paneViewOf } from '../../plugin/tests/build-pane'
import { bgHash } from '../../plugin/hooks/model'

const SHOTS = ['hydra', 'needsYou', 'failed', 'both', 'drawerOpen', 'helpers', 'emptyPane', 'manyAgents', 'helperNeedsYou', 'nestedHelper', 'costs', 'endedOpen'] as const
for (const s of SHOTS) for (const theme of ['dark', 'light'] as const) for (const w of [28, 30, 36, 52] as const)   // around the ~29 cells the app gives, narrow, wide
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`, { fullPage: true, maxDiffPixels: 0 })  // exact: a 1% ratio hid a stale baseline
  })
// The main session waiting on you, alone and above a waiting agent, at 41 cells as well.
const SESSION = ['sessionNeed', 'sessionNeedCrew'] as const
for (const s of SESSION) for (const theme of ['dark', 'light'] as const) for (const w of [28, 30, 36, 41, 52] as const)
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`, { fullPage: true, maxDiffPixels: 0 })
  })

// The one-time setup row, in an empty pane and over two running agents, at 41 cells as well.
const OFFER = ['offer', 'offerCrew'] as const
for (const s of OFFER) for (const theme of ['dark', 'light'] as const) for (const w of [28, 30, 36, 41, 52] as const)
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`, { fullPage: true, maxDiffPixels: 0 })
  })

// Background work alone, then beside the running crew, at 41 cells as well.
const BACKGROUND = ['background', 'backgroundCrew'] as const
for (const s of BACKGROUND) for (const theme of ['dark', 'light'] as const) for (const w of [28, 30, 36, 41, 52] as const)
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`, { fullPage: true, maxDiffPixels: 0 })
  })

test('pane: nothing animates while idle', async ({ page }) => {
  await show(page, paneTree(paneViewOf('emptyPane')), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
  expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
  const v = paneViewOf('hydra'), ui = { ...v.ui, shut: [] }
  const crew = { ...v.crew, agents: [], ended: [...v.crew.ended, ...v.crew.agents.map(a => ({ ...a, state: 'ended' as const, prop: 'done' as const, endedAt: v.now }))],
    counts: { need: 0, failed: 0, running: 0, done: v.crew.ended.length + v.crew.agents.length }, leftMin: null }
  await show(page, paneTree({ ...v, crew, ui, loops: pickLoops(crew, ui, false, false) }), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
  expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})

test('pane: a held failure does not move in the pane', async ({ page }) => {
  const v = paneViewOf('failed'), agents = v.crew.agents.filter(a => a.state === 'failed').map(a => ({ ...a, helpers: [] }))
  const crew = { ...v.crew, agents, counts: { ...v.crew.counts, need: 0, running: 0 }, leftMin: null }
  const loopPlan = pickLoops(crew, v.ui, false, true)
  await show(page, paneTree({ ...v, crew, loops: loopPlan }), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
  expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})

for (const s of ['hydra', 'needsYou', 'both', 'helperNeedsYou', 'nestedHelper'] as const)
  test(`pane: ${s} loops match the plan and the budget`, async ({ page }) => {
    const v = paneViewOf(s); await show(page, paneTree(v), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
    const l = await loops(page); expect(l.eased).toBe(0); expect(l.drawings).toBe(paneLoopCount(v)); expect(l.drawings).toBeGreaterThan(0)
    expect(l.drawings).toBeLessThanOrEqual(BUDGET.max)
  })

test('pane: every Svg and Client has a non-empty alt', () => {
  for (const s of SHOTS) { const a = alts(paneTree(paneViewOf(s))); expect(a.length).toBeGreaterThan(0); expect(a.every(x => x.trim().length > 0)).toBe(true) }
})

// The session's ring is the pane's one ring: stepped, counted, in the budget.
for (const s of SESSION)
  test(`pane: ${s} loops match the plan and the budget, and every image has an alt`, async ({ page }) => {
    const v = paneViewOf(s); await show(page, paneTree(v), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
    const l = await loops(page); expect(l.eased).toBe(0); expect(l.drawings).toBe(paneLoopCount(v)); expect(l.drawings).toBeGreaterThan(0)
    expect(l.drawings).toBeLessThanOrEqual(BUDGET.max)
    expect(alts(paneTree(v)).every(x => x.trim().length > 0)).toBe(true)
  })

// The setup row adds no loop, and each of its three images has an alt.
for (const s of OFFER)
  test(`pane: ${s} adds no loop, and every image has an alt`, async ({ page }) => {
    const v = paneViewOf(s); await show(page, paneTree(v), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
    expect((await loops(page)).drawings).toBe(paneLoopCount(v)); expect(paneLoopCount(v)).toBe(paneLoopCount({ ...v, offer: null }))
    expect(alts(paneTree(v)).every(x => x.trim().length > 0)).toBe(true)
  })

// The Background section adds no loop, and each of its images, every Stop included, has an alt.
for (const s of BACKGROUND)
  test(`pane: ${s} adds no loop, and every image has an alt`, async ({ page }) => {
    const v = paneViewOf(s); await show(page, paneTree(v), { surface: 'pane', widthCells: 52, theme: 'dark', motion: true })
    expect((await loops(page)).drawings).toBe(paneLoopCount(v)); expect(paneLoopCount(v)).toBe(paneLoopCount({ ...v, background: [] }))
    expect(alts(paneTree(v)).every(x => x.trim().length > 0)).toBe(true)
  })

// Measured on the drawn page: a background title starts where an agent's does, failed rows included; "failed" ends where the
// other readings do; the Stop button centres on the chevron's centre.
for (const w of [28, 41, 52] as const) for (const theme of ['dark', 'light'] as const)
  test(`pane: background titles share the agents' title x, readings share their edge, Stop centres on the chevron, ${w} cells, ${theme}`, async ({ page }) => {
    await show(page, paneTree(paneViewOf('backgroundCrew', { columns: w })), { surface: 'pane', widthCells: w, theme })
    const box = (key: string, sel: string, text?: string) => page.evaluate(([k, q, t]) => {
      const els = [...document.querySelector(`[data-key="${k}"]`)!.shadowRoot!.querySelectorAll(q)], el = t ? els.find(e => e.textContent === t)! : els[0]
      const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, mid: r.left + r.width / 2 }
    }, [key, sel, text ?? ''] as const)
    const agent = (await box('row-imp', 'text')).left
    for (const id of ['b1', 'b2', 'wake:resume the release check']) expect(Math.abs((await box(`bg-${bgHash(id)}`, 'text')).left - agent)).toBeLessThan(0.5)
    expect(Math.abs((await box(`bg-${bgHash('b2')}`, 'text', 'failed')).right - (await box(`bg-${bgHash('b1')}`, 'text', '3m')).right)).toBeLessThan(0.5)
    expect(Math.abs((await box(`stop-${bgHash('b1')}`, 'rect')).mid - (await box('row-imp', 'path')).mid)).toBeLessThan(0.5)
  })
