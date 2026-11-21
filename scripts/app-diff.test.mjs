import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { compare, resolveBox } from './app-diff.mjs'

const W = 100, H = 80
const full = [{ x: 0, y: 0, w: 1, h: 1 }]
const image = (paint = () => {}) => {
  const p = new PNG({ width: W, height: H })
  for (let i = 0; i < p.data.length; i += 4) { p.data[i] = 30; p.data[i + 1] = 30; p.data[i + 2] = 30; p.data[i + 3] = 255 }
  paint(p)
  return p
}
const dot = (x, y) => p => { const i = (y * W + x) * 4; p.data[i] = 250; p.data[i + 1] = 250; p.data[i + 2] = 250 }
const strict = { threshold: 0.1, maxRatio: 0 }

test('app-diff: identical images pass', () => {
  const r = compare(image(), image(), full, [], strict)
  assert.equal(r.status, 'pass'); assert.equal(r.changed, 0)
})
test('app-diff: a 1-pixel change inside a mask passes', () => {
  assert.equal(compare(image(dot(10, 10)), image(), full, [{ x: 0, y: 0, w: 0.2, h: 0.2 }], strict).status, 'pass')
})
test('app-diff: the same change outside a mask fails', () => {
  const r = compare(image(dot(90, 70)), image(), full, [{ x: 0, y: 0, w: 0.2, h: 0.2 }], strict)
  assert.equal(r.status, 'fail'); assert.equal(r.changed, 1)
})
test('app-diff: a missing accepted image is "new", not a crash', () => {
  assert.equal(compare(image(), null, full, [], strict).status, 'new')
})
test('app-diff: region fractions resolve the same at two window sizes', () => {
  const box = { x: 0.25, y: 0.5, w: 0.5, h: 0.25 }
  assert.deepEqual(resolveBox(box, 1000, 800), { x: 250, y: 400, w: 500, h: 200 })
  assert.deepEqual(resolveBox(box, 2000, 1600), { x: 500, y: 800, w: 1000, h: 400 })
})
test('app-diff: --idle fails on one changed pixel', () => {
  // The idle check's settings: threshold 0 and no pixel allowed; a barely different pixel still counts.
  const faint = p => { const i = (5 * W + 5) * 4; p.data[i] = 31 }
  assert.equal(compare(image(faint), image(), full, [], { threshold: 0, maxRatio: 0 }).status, 'fail')
})
