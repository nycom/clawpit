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
