import { test, expect } from 'claude-code/testing'
import { paceOf, paceText } from '../hooks/track/pace'

// The harness has no toBeCloseTo, so closeness is checked against the same tolerance by hand.
const near = (a: number | null, b: number, tol = 1e-5) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(tol)
const H5 = 18_000_000, at = (frac: number, reset: number) => reset - H5 + frac * H5
const RESET = '2026-11-21T15:00:00Z', reset = Date.parse(RESET)
test('pace: on pace for N percent', () => {
  const [l] = paceOf([{ kind: 'five_hour', percentUsed: 30, resetsAt: RESET }], at(0.5, reset))
  near(l.pacePct, 50); near(l.projected, 60); expect(l.ahead).toBe(false); expect(l.hot).toBe(false); expect(paceText(l)).toBe('on pace for 60%')
})
test('pace: ahead when the projection passes 100, and hot', () => {
  const [l] = paceOf([{ kind: 'five_hour', percentUsed: 62, resetsAt: RESET }], at(0.47, reset))
  near(l.projected, 131.9, 0.05); expect(l.ahead).toBe(true); expect(l.hot).toBe(true); expect(paceText(l)).toBe('on pace for 132%')
})
test('pace: under ten percent elapsed there is no forecast', () => {
  const [calm, warm] = paceOf([{ kind: 'five_hour', percentUsed: 5, resetsAt: RESET }, { kind: 'five_hour', percentUsed: 50, resetsAt: RESET }], at(0.09, reset))
  expect(calm).toEqual({ kind: 'five_hour', pct: 5, pacePct: null, projected: null, ahead: false, hot: false }); expect(paceText(calm)).toBe('')
  expect(warm.hot).toBe(true)
})
test('pace: no resetsAt gives no forecast', () => expect(paceOf([{ kind: 'seven_day', percentUsed: 63 }], 0)[0]).toMatchObject({ pacePct: null, projected: null, ahead: false, hot: true }))
test('pace: unknown kinds and an empty list give nothing', () => { expect(paceOf([], 0)).toEqual([]); expect(paceOf([{ kind: 'spend_limit', percentUsed: 5 }], 0)).toEqual([]) })
test('pace: a projection past 200 reads 200%+', () => {
  const [l] = paceOf([{ kind: 'five_hour', percentUsed: 90, resetsAt: RESET }], at(0.4, reset))
  expect(paceText(l)).toBe('on pace for 200%+')
})
