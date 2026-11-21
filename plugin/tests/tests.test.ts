import { test, expect } from 'claude-code/testing'
import { parseTests } from '../hooks/track/tests'

test('tests: counts from common runners', () => {
  expect(parseTests('npm test', '179 pass\n0 fail', '', 5)).toEqual({ passed: 179, failed: 0, at: 5 })
  expect(parseTests('pytest -q', '3 failed, 41 passed in 2.1s', '', 5)).toEqual({ passed: 41, failed: 3, at: 5 })
  expect(parseTests('mvn -q test', 'Tests run: 12, Failures: 1, Errors: 1, Skipped: 0', '', 5)).toEqual({ passed: 10, failed: 2, at: 5 })
})
test('tests: counts fall back to stderr, and one missing count is zero', () => {
  expect(parseTests('vitest', '', '5 passed', 5)).toEqual({ passed: 5, failed: 0, at: 5 })
})
test('tests: a command that is not a test run, or output with no counts, records nothing', () => {
  expect(parseTests('ls', '3 passed', '', 5)).toBeNull(); expect(parseTests('npm test', 'done', '', 5)).toBeNull()
})
test('tests: stdout counts win over stderr when both carry them', () => {
  expect(parseTests('npm test', '5 passed', '9 passed', 5)).toEqual({ passed: 5, failed: 0, at: 5 })
})
test('tests: a failed run keeps the failing test names from common runners', () => {
  const names = (command: string, stdout: string, stderr = '') => parseTests(command, stdout, stderr, 5)?.failedNames
  expect(names('claude plugin test plugin', '(pass) text: clip [0.10ms]\n(fail) panel: wording [2.10ms]\n\n 243 pass\n 1 fail')).toEqual(['panel: wording'])
  expect(names('npm test', '✔ reads the store (0.4ms)\n✖ parses the cache key (1.2ms)\nℹ tests 2\nℹ pass 1\nℹ fail 1\n\n✖ failing tests:\n\n✖ parses the cache key (1.2ms)')).toEqual(['parses the cache key'])
  expect(names('pytest -q', 'FAILED tests/test_db.py::test_connect - AssertionError: refused\n1 failed, 3 passed in 0.2s')).toEqual(['tests/test_db.py::test_connect'])
  expect(names('npx jest', '  ✓ adds (2 ms)\n  ✕ subtracts two numbers (5 ms)\nTests:       1 failed, 1 passed, 2 total')).toEqual(['subtracts two numbers'])
  expect(names('npx playwright test', '  ✘  2 [chromium] › tests/login.spec.ts:12:5 › login › rejects a bad password (1.2s)\n\n  1 failed\n  3 passed (4.1s)')).toEqual(['rejects a bad password'])
  // stdout, then stderr
  expect(names('npm test', '1 pass\n1 fail', '(fail) cache: evicts [1ms]')).toEqual(['cache: evicts'])
})
test('tests: node:test counts read as ℹ pass N and ℹ fail N', () => {
  expect(parseTests('npm run test:scripts', 'ℹ tests 4\nℹ pass 3\nℹ fail 1', '', 5)).toEqual({ passed: 3, failed: 1, at: 5 })
})
test('tests: at most five failing names, cleaned, deduplicated and cut to 80', () => {
  const out = [...Array.from({ length: 7 }, (_, i) => `(fail) t${i} [1ms]`), '(fail) t0 [1ms]', '7 fail'].join('\n')
  expect(parseTests('bun test', out, '', 5)!.failedNames).toEqual(['t0', 't1', 't2', 't3', 't4'])
  const long = parseTests('bun test', `(fail) a\u0007b ${'x'.repeat(100)} [1ms]\n1 fail`, '', 5)!.failedNames!
  expect(long[0].length).toBe(80); expect(long[0].startsWith('ab x')).toBe(true); expect(long[0].endsWith('…')).toBe(true)
})
test('tests: a passing run carries no failed names', () => {
  expect('failedNames' in parseTests('npm test', '(pass) a [1ms]\n1 pass\n0 fail', '', 5)!).toBe(false)
})
