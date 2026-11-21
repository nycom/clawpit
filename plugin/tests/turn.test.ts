import { test, expect } from 'claude-code/testing'
import { emptyTurn, isArmed, onComplete, onCost, onLines, onStart } from '../hooks/track/turn'

// The harness has no toBeCloseTo, so closeness is checked against the same tolerance by hand.
const near = (a: number | null | undefined, b: number) => expect(Math.abs((a ?? NaN) - b)).toBeLessThan(1e-5)

test('turn: a main turn tracks lines and the cost delta', () => {
  let s = onStart(emptyTurn(), 1000, 10); s = onLines(s, { added: 38, removed: 6 }); s = onCost(s, 10.42)
  expect(s.turn).toEqual({ startedAt: 1000, added: 38, removed: 6, costUsd: expect.any(Number) }); near(s.turn!.costUsd, 0.42); expect(s.idleSince).toBeNull()
})
test('turn: completing a main turn records the last cost and starts idle', () => {
  const s = onComplete(onStart(emptyTurn(), 1000, 10), { isMain: true, durationMs: 5000, tokens: 900 }, 6000, 12.46)
  expect(s.turn).toBeNull(); near(s.session.lastTurnUsd, 2.46); expect(s.session.turns).toBe(1)
  expect(s.session.agentMs).toBe(5000); expect(s.session.tokens).toBe(900); expect(s.idleSince).toBe(6000)
})
test('turn: an agent turn adds tokens only', () => {
  const idle = onComplete(onStart(emptyTurn(), 0, 0), { isMain: true, durationMs: 1, tokens: 0 }, 1000, 0)
  const s = onComplete(idle, { isMain: false, durationMs: 4000, tokens: 700 }, 9000, 3)
  expect(s.session).toEqual({ ...idle.session, tokens: 700 }); expect(s.idleSince).toBe(1000)
  expect(onComplete(emptyTurn(), { isMain: false, durationMs: 4000, tokens: 50 }, 9000, null).session.turns).toBe(0)
})
test('turn: no ledger gives null costs, never NaN', () => expect(onCost(onStart(emptyTurn(), 0, null), null).turn!.costUsd).toBeNull())
test('turn: armed while busy, for ten minutes of idle, then not', () => {
  const idle = onComplete(onStart(emptyTurn(), 0, 0), { isMain: true, durationMs: 1, tokens: 0 }, 1000, 0)
  expect(isArmed(onStart(emptyTurn(), 0, 0), 5)).toBe(true); expect(isArmed(idle, 1000 + 599_999)).toBe(true); expect(isArmed(idle, 1000 + 600_000)).toBe(false)
})
test('turn: turnCosts keeps the last 20 main-turn costs, newest last; an agent turn or no reading adds none', () => {
  let s = emptyTurn(), usd = 0
  for (let i = 1; i <= 25; i++) { s = onStart(s, i * 10, usd); usd += i / 100; s = onComplete(s, { isMain: true, durationMs: 1, tokens: 0 }, i * 10 + 5, usd) }
  expect(s.session.turnCosts!.length).toBe(20); near(s.session.turnCosts![0], 0.06); near(s.session.turnCosts!.at(-1)!, 0.25)
  expect(onComplete(s, { isMain: false, durationMs: 1, tokens: 1 }, 999, usd + 1).session.turnCosts).toEqual(s.session.turnCosts)
  expect(onComplete(onStart(emptyTurn(), 0, null), { isMain: true, durationMs: 1, tokens: 0 }, 5, null).session.turnCosts).toEqual([])
})
