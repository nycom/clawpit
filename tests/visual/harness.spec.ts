import { test, expect } from '@playwright/test'
import { show, loops, alts } from './harness'

const img = (css: string) => ({ type: 'Svg', props: { alt: 'a', width: 20, height: 20,
  source: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><style>${css}</style><rect class="x" width="20" height="20"/></svg>` } })

test('harness: a looping image counts as one drawing, a still one as none', async ({ page }) => {
  await show(page, { type: 'Box', children: [img('.x{animation:a 1s steps(2) infinite}@keyframes a{50%{opacity:0}}'), img('')] },
    { surface: 'panel', widthCells: 40, theme: 'dark', motion: true })
  expect(await loops(page)).toEqual({ drawings: 1, eased: 0 })
})
test('harness: an eased loop is reported as eased', async ({ page }) => {
  await show(page, img('.x{animation:a 1s ease-in-out infinite}@keyframes a{50%{opacity:0}}'), { surface: 'panel', widthCells: 40, theme: 'dark', motion: true })
  expect((await loops(page)).eased).toBe(1)
})
test('harness: one image\'s style does not reach the next', async ({ page }) => {
  await show(page, { type: 'Box', children: [img('.x{fill:#ff0000}'), img('')] }, { surface: 'panel', widthCells: 40, theme: 'dark' })
  const fills = await page.evaluate(() => [...document.querySelectorAll('[data-svg]')].map(d => getComputedStyle(d.shadowRoot!.querySelector('rect')!).fill))
  expect(fills[0]).toBe('rgb(255, 0, 0)'); expect(fills[1]).not.toBe('rgb(255, 0, 0)')
})
test('harness: a Client draws its props as an image, and alts lists it', async ({ page }) => {
  const c = { type: 'Client', props: { key: 'k', module: './client/image.tsx', props: img('').props } }
  await show(page, c, { surface: 'pane', widthCells: 44, theme: 'light' })
  expect(await page.locator('[data-svg]').count()).toBe(1); expect(alts(c)).toEqual(['a'])
})
test('harness: a Box is as wide as its cells', async ({ page }) => {
  await show(page, { type: 'Box', props: { width: 10, key: 'b' }, children: ['x'] }, { surface: 'panel', widthCells: 40, theme: 'dark' })
  expect((await page.locator('[data-key="b"]').boundingBox())!.width).toBeCloseTo(92, 0)
})
