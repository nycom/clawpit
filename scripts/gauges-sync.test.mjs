import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'

const check = (root = '.') => spawnSync('bash', ['scripts/sync-gauges.sh', '--check'], { env: { ...process.env, GAUGES_ROOT: root }, encoding: 'utf8' })
const files = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? files(p) : [p] })
// A tree with plugin/ and gauges/ as in the repo, to break on purpose.
const scratch = () => { const d = mkdtempSync(join(tmpdir(), 'gauges-sync-')); for (const f of ['plugin', 'gauges']) cpSync(f, join(d, f), { recursive: true }); return d }

test('gauges sync: every copy matches its original (run bash scripts/sync-gauges.sh if not)', () => {
  const r = check()
  assert.equal(r.status, 0, r.stdout + r.stderr)
})

test('gauges sync: a changed copy, a changed types prefix and a stray file each fail the check', () => {
  for (const breakIt of [
    d => appendFileSync(join(d, 'gauges/hooks/text.ts'), '\n// drift\n'),
    d => writeFileSync(join(d, 'gauges/types/index.d.ts'), '// drift\n' + readFileSync(join(d, 'gauges/types/index.d.ts'), 'utf8')),
    d => writeFileSync(join(d, 'gauges/hooks/old.ts'), 'export {}\n'),
  ]) {
    const d = scratch(); breakIt(d)
    assert.notEqual(check(d).status, 0)
  }
})

test('gauges sync: every relative import in gauges/hooks resolves inside gauges/', () => {
  for (const f of files('gauges/hooks').filter(p => /\.tsx?$/.test(p))) {
    for (const [, spec] of readFileSync(f, 'utf8').matchAll(/from '(\.{1,2}\/[^']+)'/g)) {
      const base = resolve(dirname(f), spec)
      const hit = ['', '.ts', '.tsx', '.d.ts', '/index.d.ts', '/index.ts'].some(x => existsSync(base + x) && statSync(base + x).isFile())
      assert.ok(hit && relative(resolve('gauges'), base).split('/')[0] !== '..', `${f}: ${spec}`)
    }
  }
})
