import { test, expect } from '@playwright/test'
import { show, loops, type Node } from './harness'
import { crab } from '../../plugin/hooks/crab'
import { dial, segBar, stepBlocks, toggleIcon, icon, type Seg } from '../../plugin/hooks/icons'
import { svg, SIZE } from '../../plugin/hooks/tokens'
import type { CrabSize, Prop, Role, Size } from '../../plugin/types'

const ROLES: Role[] = ['implement', 'review', 'test', 'explore', 'design']
const PROPS: Prop[] = ['search', 'read', 'write', 'think', 'wait', 'fail', 'done', 'none']
const img = (alt: string, width: number, height: number, source: string): Node => ({ type: 'Svg', props: { alt, width, height, source } })
const row = (children: Node[]): Node => ({ type: 'Box', props: { flexDirection: 'row', gap: 1, alignItems: 'center', flexWrap: 'wrap' }, children })
const col = (children: Node[]): Node => ({ type: 'Box', props: { flexDirection: 'column', gap: 1, padding: 1 }, children })

// The specimen sheet: every role by every prop at S, M and L; both dials; both bar tiers in every state; the toggle icons.
function sheet({ walk = false } = {}): Node {
  const crabs = (['S', 'M', 'L'] as CrabSize[]).flatMap(size =>
    ROLES.map(role => row(PROPS.map(prop => { const [w, h] = SIZE.crab[size]; return img(`${role} ${prop} ${size}`, w, h, crab({ role, prop, walk, size })) }))))
  const dials = row([
    ...[0, 35, 75, 95].map(p => img(`dial ${p}`, 34, 22, svg(34, 22, dial(p, p >= 90 ? 'er' : p >= 70 ? 'warn' : 'accent', { ghost: 48 })))),
    img('context dial', 34, 22, svg(34, 22, dial(58, 'accent', { base: 18 }))),
    img('small dial', 26, 17, svg(26, 17, dial(63, 'warn', { ghost: 48, small: true }))),
    img('settling dial', 34, 22, svg(34, 22, dial(60, 'accent', { settle: { from: 20, to: 60 } }), true)),
  ])
  const segs: Seg[] = [{ state: 'done', fill: 1 }, { state: 'failed', fill: 0 }, { state: 'need', fill: 0.4 }, ...ROLES.map(role => ({ state: 'live' as const, role, fill: 0.5 })), { state: 'live', role: 'test', fill: 0.01 }, { state: 'todo', fill: 0 }]
  const bars = (['full', 'compact'] as const).map(tier => img(`bar ${tier}`, 320, 8, svg(320, 8, segBar(segs, 320, tier, walk), walk)))
  const blocks = row(ROLES.map(r => img(`blocks ${r}`, 40, 6, svg(40, 6, stepBlocks(3, 5, r)))).concat(img('blocks er', 40, 6, svg(40, 6, stepBlocks(2, 5, 'er')))))
  const toggles = row((['full', 'gauges', 'line'] as Size[]).flatMap(s => [false, true].map(dot => img(`toggle ${s} ${dot}`, 14, 14, svg(14, 14, toggleIcon(s, dot))))))
  const icons = row((['chev', 'check', 'cross'] as const).map(n => img(n, 12, 12, svg(12, 12, icon(n, 12, 's-muted')))))
  return col([...crabs, dials, ...bars, blocks, toggles, icons])
}

for (const theme of ['dark', 'light'] as const)
  test(`kit: specimen sheet, ${theme} @shot`, async ({ page }) => {
    await show(page, sheet(), { surface: 'pane', widthCells: 60, theme }); await expect(page).toHaveScreenshot(`kit-${theme}.png`, { fullPage: true })
  })
test('kit: a still sheet runs no animation', async ({ page }) => {
  await show(page, sheet({ walk: false }), { surface: 'pane', widthCells: 60, theme: 'dark', motion: true }); expect(await loops(page)).toEqual({ drawings: 0, eased: 0 })
})
test('kit: walkers loop stepped, never eased', async ({ page }) => {
  await show(page, sheet({ walk: true }), { surface: 'pane', widthCells: 60, theme: 'dark', motion: true }); const l = await loops(page)
  expect(l.drawings).toBeGreaterThan(0); expect(l.eased).toBe(0)
})
