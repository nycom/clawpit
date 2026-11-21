import { test, expect } from 'claude-code/testing'
import { contextOf, contextText, pushTurn } from '../hooks/track/context'

const bd = (over: object) => ({ percentage: 58, totalTokens: 580_000, rawMaxTokens: 1_000_000, autoCompactThreshold: 970_000, isAutoCompactEnabled: true, categories: [{ name: 'Messages', tokens: 340_000, kind: 'used' }], ...over })
test('context: the breakdown scale wins, with auto-compact percent and msgs share', () =>
  expect(contextOf({ percent: 44, breakdown: bd({}) }, [])).toEqual({ pct: 58, msgsPct: 34, turnsLeft: null, autoPct: 97, alarm: false }))
test('context: without a breakdown the context percent is used', () =>
  expect(contextOf({ percent: 44 }, [])).toEqual({ pct: 44, msgsPct: null, turnsLeft: null, autoPct: null, alarm: false }))
test('context: turns left is the room over the median growth', () =>
  expect(contextOf({ breakdown: bd({}) }, [400_000, 450_000, 520_000, 580_000])!.turnsLeft).toBe(6))   // deltas 50k,70k,60k -> median 60k; (970k-580k)/60k = 6.5
test('context: alarm at ninety, or seven under the threshold when that is lower', () => {
  expect(contextOf({ breakdown: bd({ percentage: 90 }) }, [])!.alarm).toBe(true)
  expect(contextOf({ breakdown: bd({ percentage: 84, autoCompactThreshold: 900_000 }) }, [])!.alarm).toBe(true)   // autoPct 90 -> alarm at 83
})
test('context: auto-compact off gives autoPct null', () => expect(contextOf({ breakdown: bd({ isAutoCompactEnabled: false, autoCompactThreshold: undefined }) }, [])!.autoPct).toBeNull())
test('context: absent percent and no breakdown gives pct null', () => expect(contextOf({}, [])).toBeNull())
test('context: a drop clears the history', () => expect(pushTurn([400_000, 450_000], 120_000)).toEqual([120_000]))
test('context: the history keeps the last ten turns', () =>
  expect(pushTurn(Array.from({ length: 10 }, (_, i) => i), 10)).toEqual(Array.from({ length: 10 }, (_, i) => i + 1)))
test('context: the so-what line', () => {
  expect(contextText(null, 0)).toBe('no reading yet')
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: null, autoPct: 97, alarm: false }, 2)).toBe('learning your pace')
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: 7, autoPct: 97, alarm: false }, 44)).toBe('~7 turns · 34% msgs')
  expect(contextText({ pct: 58, msgsPct: null, turnsLeft: 7, autoPct: 97, alarm: false }, 44)).toBe('~7 turns')
  expect(contextText({ pct: 92, msgsPct: 34, turnsLeft: 1, autoPct: 97, alarm: true }, 44)).toBe('auto-compacts at 97%')
  expect(contextText({ pct: 92, msgsPct: null, turnsLeft: null, autoPct: null, alarm: true }, 44)).toBe('context nearly full')
})
test('context: past three turns with no estimate, only the msgs share, or nothing', () => {
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: null, autoPct: 97, alarm: false }, 3)).toBe('34% msgs')
  expect(contextText({ pct: 58, msgsPct: null, turnsLeft: null, autoPct: 97, alarm: false }, 44)).toBe('')
  expect(contextText({ pct: 58, msgsPct: 34, turnsLeft: 7, autoPct: 97, alarm: false }, 2)).toBe('learning your pace')
})
