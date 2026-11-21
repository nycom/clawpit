import { test, expect } from 'claude-code/testing'
import type { Crew } from '../types'
import { nextSize, parseSize, hasDot, moving, settle } from '../hooks/panel/fold'
import { MOTION } from '../hooks/tokens'

const crew = (counts: Partial<Crew['counts']>): Crew => ({
  title: 'Subagents', agents: [], ended: [], counts: { need: 0, failed: 0, running: 0, done: 0, ...counts },
  costUsd: 0, leftMin: null, plan: null,
})

test('fold: full, gauges, line, full', () => {
  expect(nextSize('full')).toBe('gauges'); expect(nextSize('gauges')).toBe('line'); expect(nextSize('line')).toBe('full')
})
test('fold: a bad stored value is full', () => {
  expect(parseSize('big')).toBe('full'); expect(parseSize(undefined)).toBe('full'); expect(parseSize('line')).toBe('line')
  expect(parseSize('gauges')).toBe('gauges'); expect(parseSize(null)).toBe('full')
})
test('fold: the dot shows only while folded with a waiter or a failure', () => {
  expect(hasDot('full', crew({ need: 1 }))).toBe(false)
  expect(hasDot('gauges', crew({ need: 1 }))).toBe(true)
  expect(hasDot('line', crew({ failed: 1 }))).toBe(true)
  expect(hasDot('line', crew({ running: 2, done: 1 }))).toBe(false)
})
test('fold: settle keeps its object while the value holds', () => {
  const a = settle(undefined, 58, 1); expect(a).toEqual({ from: 58, to: 58, at: 1 }); expect(settle(a, 58, 2)).toBe(a); expect(settle(a, 61, 3)).toEqual({ from: 58, to: 61, at: 3 })
})
test('fold: a settle reaches the dial only inside its sweep', () => {
  const s = { context: { from: 40, to: 58, at: 1_000 }, '5h': { from: 10, to: 21, at: 0 } }
  expect(moving(s, 1_000 + MOTION.settleMs - 1)).toEqual({ context: s.context })
  expect(moving(s, 1_000 + MOTION.settleMs)).toEqual({})
})
test('fold: a waiting or failed helper shows the dot too', () => {
  const parent = (state: 'need' | 'failed') => ({ helpers: [{ state }] }) as unknown as Crew['agents'][number]
  expect(hasDot('gauges', { ...crew({ running: 1 }), agents: [parent('need')] })).toBe(true)
  expect(hasDot('line', { ...crew({ running: 1 }), agents: [parent('failed')] })).toBe(true)
})
