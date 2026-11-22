import { test, expect } from 'claude-code/testing'
import { STAGES, estimate, keysOf, record, stageOf, usually, type History } from '../hooks/track/eta'

test('eta: under three runs at every level gives none', () => expect(estimate({ k: [60_000, 60_000] }, ['k'], 0)).toEqual({ kind: 'none' }))
test('eta: before the median it counts down to the median', () =>
  expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 120_000)).toEqual({ kind: 'left', minutes: 4, slow: false }))
test('eta: past the median it re-estimates to the 80th percentile and is slow', () =>
  expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 400_000)).toEqual({ kind: 'left', minutes: 2, slow: true }))
test('eta: past the 80th percentile it is over', () => expect(estimate({ k: [240_000, 360_000, 480_000] }, ['k'], 500_000)).toEqual({ kind: 'over' }))
test('eta: the finest level with three runs wins, else it falls back', () =>
  expect(estimate({ 'a · m · fix': [1], 'a · m': [60_000, 60_000, 60_000] }, ['a · m · fix', 'a · m', 'a'], 0)).toEqual({ kind: 'left', minutes: 1, slow: false }))
test('eta: record keeps the last twenty at all three levels', () => {
  const keys = keysOf('a', 'm', 'fix the cache')
  expect(keys).toEqual(['a · m · fix', 'a · m', 'a'])
  let h: History = {}
  for (let i = 1; i <= 25; i++) h = record(h, keys, i)
  for (const k of keys) { expect(h[k].length).toBe(20); expect(h[k][0]).toBe(6); expect(h[k][19]).toBe(25) }
})
test('eta: stageOf finds the first stage word', () => { expect(stageOf('cache-tax review c1')).toBe('review'); expect(stageOf('plan the release')).toBe('') })
test('eta: stageOf ignores case, as the role does', () => { expect(stageOf('Implement auth')).toBe('implement'); expect(stageOf('REVIEW the fold')).toBe('review') })
test('eta: keys use the configured words', () => {
  expect(keysOf('a', 'm', 'build the api', ['build', 'ship'])).toEqual(['a · m · build', 'a · m', 'a'])
  expect(keysOf('a', 'm', 'implement the api', ['build'])).toEqual(['a · m · ', 'a · m', 'a'])
})
test('eta: stageOf matches whole words of any script, and a word with regex characters only as text', () => {
  expect(stageOf('api évaluer c1', ['évaluer'])).toBe('évaluer'); expect(stageOf('fix c++ thing', ['c++', '(x', 'fix'])).toBe('fix')
})
test('eta: falls back to STAGES when savvy publishes nothing', () => {
  expect(keysOf('a', 'm', 'fix the cache')).toEqual(['a · m · fix', 'a · m', 'a'])
  expect(stageOf('review it', STAGES)).toBe('review')
})
test('eta: usually is the median in whole minutes, or null', () => {
  expect(usually({ k: [60_000, 180_000, 240_000, 300_000] }, ['k'])).toBe(4)
  expect(usually({ k: [60_000] }, ['k'])).toBeNull()
})
