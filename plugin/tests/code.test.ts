import { test, expect } from 'claude-code/testing'
import { codeOf } from '../hooks/track/code'

const names = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`)
test('code: the reuse share as ponytail computes it', () =>
  expect(codeOf({ reused: names(18, 'r'), created: names(7, 'c'), openCallers: [] })).toEqual({ reusePct: 72, reused: 18, created: 7, callers: [] }))
test('code: under three functions there is no share', () => expect(codeOf({ reused: ['a'], created: ['b'], openCallers: [] })!.reusePct).toBeNull())
test('code: callers open are the refs, cleaned and capped', () => {
  const c = codeOf({ reused: [], created: [], openCallers: ['hooks/a.ts:4\u0007', 7, 'x'.repeat(300)] })!
  expect(c.callers).toEqual(['hooks/a.ts:4', 'x'.repeat(120)])
})
test('code: ponytail absent or malformed', () => {
  for (const b of [undefined, null, 5, 'x']) expect(codeOf(b)).toBeNull()
  expect(codeOf({ reused: 'x' })).toEqual({ reusePct: null, reused: 0, created: 0, callers: [] })
})
test('code: callers lose C1 control characters too', () =>
  expect(codeOf({ reused: [], created: [], openCallers: ['a:4\u0085\u009bx'] })!.callers).toEqual(['a:4x']))
