import { test, expect } from '@playwright/test'
import { show, loops, alts } from './harness'
import { paneTree } from '../../plugin/hooks/pane/draw'
import { pickLoops, BUDGET } from '../../plugin/hooks/loops'
import { paneLoopCount, paneViewOf } from '../../plugin/tests/build-pane'

const SHOTS = ['hydra', 'needsYou', 'failed', 'both', 'drawerOpen', 'helpers', 'emptyPane', 'manyAgents', 'helperNeedsYou', 'nestedHelper', 'costs', 'endedOpen'] as const
for (const s of SHOTS) for (const theme of ['dark', 'light'] as const) for (const w of [28, 30, 36, 52] as const)   // around the ~29 cells the app gives, narrow, wide
  test(`pane: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, paneTree(paneViewOf(s, { columns: w })), { surface: 'pane', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`pane-${s}-${theme}-${w}.png`, { fullPage: true, maxDiffPixels: 0 })  // exact: a 1% ratio hid a stale baseline
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
