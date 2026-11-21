import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const run = (args, env = {}) => spawnSync('bash', ['scripts/app-capture.sh', ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } })

test('app-capture: no window exits 3 with a clear message', () => {
  const r = run(['t', 's'], { WINDOW_ID_CMD: 'true', CLAWPIT_APP: 'Claude' })
  assert.equal(r.status, 3); assert.match(r.stderr, /app-capture: no window for Claude/)
})
test('app-capture: the output path is artifacts/app-checks/<task>/current/<state>.png', () => {
  const r = run(['panel', 'idle', '--dry-run'], { WINDOW_ID_CMD: 'echo 42' })
  assert.equal(r.status, 0); assert.ok(r.stdout.trim().endsWith('artifacts/app-checks/panel/current/idle.png'))
})
test('app-capture: --dry-run captures nothing', () => {
  const r = run(['zz-dry', 'shot', '--dry-run'], { WINDOW_ID_CMD: 'echo 42' })
  assert.match(r.stdout, /screencapture -l 42 -o -x/)
  assert.equal(existsSync(join(ROOT, 'artifacts/app-checks/zz-dry')), false)
})
test('app-capture: a missing argument exits 2', () => {
  assert.equal(run(['only-task'], { WINDOW_ID_CMD: 'echo 42' }).status, 2)
})
