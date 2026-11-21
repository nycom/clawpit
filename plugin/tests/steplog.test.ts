import { test, expect } from 'claude-code/testing'
import type { SavvyRun } from '../types'
import { diff } from '../hooks/track/steplog'

test('steplog: a new note, a failed try, a question and a failure each add one line', () => {
  const a = { id: 'r1', status: 'running', stepDone: 1, stepTotal: 4 } as SavvyRun
  let logs = diff({}, [a], [{ ...a, stepNote: 'Seeded the fixture data.' }], {}, 10)
  expect(logs.r1[0]).toEqual({ kind: 'step', text: 'Seeded the fixture data.', at: 10 })
  logs = diff(logs, [a], [{ ...a, failedAttempts: 1, failNote: 'connection refused' }], {}, 20)
  expect(logs.r1[0].text).toBe('Try 1 failed: connection refused')
  logs = diff(logs, [a], [{ ...a, blocked: 'Postgres or SQLite?' }], {}, 30); expect(logs.r1[0].text).toBe('Asked: Postgres or SQLite?')
  logs = diff(logs, [{ ...a, stepDone: 2 }], [{ ...a, stepDone: 2, status: 'failed', failNote: 'run the login flow test' }], {}, 40)
  expect(logs.r1[0]).toEqual({ kind: 'fail', text: 'Failed at step 3 of 4: run the login flow test', at: 40 })
  expect(logs.r1.length).toBe(4)
})
test('steplog: a failure with no steps drops the "at step" part', () => {
  const a = { id: 'r1', status: 'running' } as SavvyRun
  expect(diff({}, [a], [{ ...a, status: 'failed', stepNote: 'boom' }], {}, 1).r1[0].text).toBe('Failed: boom')
})
test('steplog: a failed helper is logged on its parent', () => {
  const p = { id: 'r1', status: 'running' } as SavvyRun
  const k = { id: 'k2', status: 'running', description: 'map the cache keys', startedAt: 1000 } as SavvyRun
  const logs = diff({}, [p, k], [p, { ...k, status: 'failed', endedAt: 49_000, failNote: 'no "cacheKey" in src/' }], { k2: 'r1' }, 50)
  expect(logs.r1[0]).toEqual({ kind: 'helper', text: 'Helper "map the cache keys" failed after 0:48: no "cacheKey" in src/', at: 50 })
})
test('steplog: thirty lines at most, a vanished run drops its log', () => {
  const a = { id: 'r1', status: 'running' } as SavvyRun
  let logs = {}
  for (let i = 0; i < 40; i++) logs = diff(logs, [{ ...a, stepNote: `n${i - 1}` }], [{ ...a, stepNote: `n${i}` }], {}, i)
  expect((logs as Record<string, unknown[]>).r1.length).toBe(30)
  expect(diff(logs, [a], [], {}, 99).r1).toBeUndefined()
})
test('steplog: failNote wins over stepNote when both are set', () => {
  const a = { id: 'r1', status: 'running' } as SavvyRun
  const logs = diff({}, [a], [{ ...a, status: 'failed', failNote: 'real cause', stepNote: 'last step' }], {}, 1)
  expect(logs.r1[0].text).toBe('Failed: real cause')
})
test('steplog: a failure with no notes has no dangling colon', () => {
  const a = { id: 'r1', status: 'running', startedAt: 0 } as SavvyRun
  const logs = diff({}, [a], [{ ...a, status: 'failed', failedAttempts: 1 }], {}, 1)
  expect(logs.r1.map(l => l.text)).toEqual(['Failed', 'Try 1 failed'])
  const h = diff({}, [a, { ...a, id: 'k' }], [a, { ...a, id: 'k', status: 'failed', description: 'x', endedAt: 48_000 }], { k: 'r1' }, 1)
  expect(h.r1[0].text).toBe('Helper "x" failed after 0:48')
})
