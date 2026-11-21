import { test, expect } from 'claude-code/testing'
import { crab } from '../hooks/crab'

test('crab: a still crab has no animation', () => expect(crab({ role: 'test', prop: 'read', walk: false, size: 'M' })).not.toContain('animation'))
test('crab: a walker uses steps only', () => {
  const s = crab({ role: 'test', prop: 'read', walk: true, size: 'M' }); expect(s).toContain('steps(1)'); expect(s).not.toMatch(/ease|linear/)
})
test('crab: the same input gives the same string', () =>
  expect(crab({ role: 'review', prop: 'search', walk: true, size: 'S' })).toBe(crab({ role: 'review', prop: 'search', walk: true, size: 'S' })))
test('crab: on red the question bubble inverts', () => expect(crab({ role: 'test', prop: 'wait', walk: false, size: 'S', onRed: true })).toContain('fill="#fff"'))
test('crab: a hop moves on the needs-you beat', () => expect(crab({ role: 'test', prop: 'wait', walk: false, size: 'S', move: 'hop' })).toContain('1.2s steps(2)'))
