import { test, expect } from 'claude-code/testing'
import { dial } from '../hooks/icons'

test('dial: a settle with no movement draws no animation', () => {
  expect(dial(40, 'accent', { settle: { from: 40, to: 40 } as any })).not.toContain('animation:')
  expect(dial(40, 'accent', { settle: { from: 30, to: 40 } as any })).toContain('animation:')
})
test('dial: a redraw mid-sweep continues the sweep where it is, not from the start', () => {
  const settle = { from: 30, to: 40, at: 1_000 }
  expect(dial(40, 'accent', { settle, now: 1_400 })).toContain('900ms cubic-bezier(.2,.8,.2,1) -400ms')
  expect(dial(40, 'accent', { settle, now: 1_000 })).not.toMatch(/ms -\d+ms/)
  expect(dial(40, 'accent', { settle, now: 1_000 })).toContain('animation:')
})
test('dial: the pace ghost only changes the image when it moves half a percent or more', () => {
  expect(dial(63, 'warn', { ghost: 80.004 })).toBe(dial(63, 'warn', { ghost: 80.012 }))
  expect(dial(63, 'warn', { ghost: 80 })).not.toBe(dial(63, 'warn', { ghost: 81 }))
})
