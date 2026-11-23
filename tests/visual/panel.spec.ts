import { test, expect } from '@playwright/test'
import { show, loops, alts } from './harness'
import { panelTree } from '../../plugin/hooks/panel/draw'
import { BUDGET } from '../../plugin/hooks/loops'
import { panelLoopCount, viewOf } from '../../plugin/tests/build'
import { EMPTY_CREW, STILL } from '../../plugin/hooks/model'

const SHOTS = ['idle', 'busy', 'hydra', 'needsYou', 'failed', 'both', 'context90', 'limitAhead', 'sizeGauges', 'sizeLine', 'codeColumns', 'filePlan', 'planOutOfOrder'] as const
for (const s of SHOTS) for (const theme of ['dark', 'light'] as const) for (const w of [60, 96] as const)   // narrow, wide
  test(`panel: ${s}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, panelTree(viewOf(s, { bodyColumns: w })), { surface: 'panel', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`panel-${s}-${theme}-${w}.png`, { fullPage: true })
  })
// One folded agent: its name in the value slot and its state under it, at both folded sizes.
for (const s of ['oneRunning', 'oneNeedsYou'] as const) for (const size of ['gauges', 'line'] as const) for (const theme of ['dark', 'light'] as const)
  test(`panel: ${s}, ${size}, ${theme}, 60 cells @shot`, async ({ page }) => {
    const v = viewOf(s, { bodyColumns: 60 })
    await show(page, panelTree({ ...v, ui: { ...v.ui, size } }), { surface: 'panel', widthCells: 60, theme })
    await expect(page).toHaveScreenshot(`panel-${s}-${size}-${theme}-60.png`, { fullPage: true })
  })
// Only the main session waits on you: its chip, then its folded faces.
for (const size of ['full', 'gauges', 'line'] as const) for (const theme of ['dark', 'light'] as const) for (const w of [60, 96] as const)
  test(`panel: sessionNeed, ${size}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    const v = viewOf('sessionNeed', { bodyColumns: w })
    await show(page, panelTree({ ...v, ui: { ...v.ui, size } }), { surface: 'panel', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`panel-sessionNeed-${size}-${theme}-${w}.png`, { fullPage: true })
  })
test('panel: nothing animates while idle', async ({ page }) => {
  await show(page, panelTree(viewOf('idle')), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true }); expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})
for (const s of ['hydra', 'needsYou', 'failed', 'both', 'sizeGauges', 'sizeLine'] as const)
  test(`panel: ${s} loops match the plan and the budget`, async ({ page }) => {
    const v = viewOf(s); await show(page, panelTree(v), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true })
    const l = await loops(page); expect(l.eased).toBe(0); expect(l.drawings).toBe(panelLoopCount(v)); expect(l.drawings).toBeLessThanOrEqual(BUDGET.max)
  })
test('panel: every Svg and Client has a non-empty alt', () => { for (const s of SHOTS) expect(alts(panelTree(viewOf(s))).every(a => a.trim().length > 0)).toBe(true) })
for (const size of ['full', 'gauges', 'line'] as const)
  test(`panel: sessionNeed, ${size}, loops match the plan and the budget, and every image has an alt`, async ({ page }) => {
    const f = viewOf('sessionNeed'), v = viewOf('sessionNeed', { ui: { ...f.ui, size } })
    await show(page, panelTree(v), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true })
    const l = await loops(page); expect(l.eased).toBe(0); expect(l.drawings).toBe(panelLoopCount(v)); expect(l.drawings).toBe(1)
    expect(alts(panelTree(v)).every(a => a.trim().length > 0)).toBe(true)
  })

// The gauges plugin: clawpit's panel with no crew and `alone` set (clawpit-gauges draws the same bytes).
const aloneOf = (s: 'idle' | 'busy' | 'context90' | 'limitAhead', size: 'full' | 'line', w: number) => {
  const v = viewOf(s, { bodyColumns: w, crew: EMPTY_CREW, loops: STILL, armed: false, alone: true })
  return panelTree({ ...v, ui: { ...v.ui, size, paneOpen: false } })
}
for (const s of ['idle', 'busy', 'context90', 'limitAhead'] as const) for (const size of ['full', 'line'] as const) for (const theme of ['dark', 'light'] as const) for (const w of [60, 96] as const)
  test(`panel alone: ${s}, ${size}, ${theme}, ${w} cells @shot`, async ({ page }) => {
    await show(page, aloneOf(s, size, w), { surface: 'panel', widthCells: w, theme })
    await expect(page).toHaveScreenshot(`panel-alone-${s}-${size}-${theme}-${w}.png`, { fullPage: true })
  })
test('panel alone: nothing loops, busy or idle, and every image has an alt', async ({ page }) => {
  for (const s of ['idle', 'busy'] as const) for (const size of ['full', 'line'] as const) {
    await show(page, aloneOf(s, size, 96), { surface: 'panel', widthCells: 96, theme: 'dark', motion: true })
    expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
    expect(alts(aloneOf(s, size, 96)).every(a => a.trim().length > 0 && !/\bagents\b/i.test(a))).toBe(true)
  }
})
