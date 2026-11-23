import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs'
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

test('gauges sync: an unbroken copy of the tree passes; each kind of drift fails with its own message', () => {
  const clean = scratch()
  try { assert.equal(check(clean).status, 0, check(clean).stdout) } finally { rmSync(clean, { recursive: true, force: true }) }
  const types = d => join(d, 'gauges/types/index.d.ts')
  for (const [breakIt, says] of [
    [d => appendFileSync(join(d, 'gauges/hooks/text.ts'), '\n// drift\n'), /differs: gauges\/hooks\/text\.ts/],
    [d => writeFileSync(types(d), '// drift\n' + readFileSync(types(d), 'utf8')), /differs: the shared part/],
    [d => writeFileSync(types(d), readFileSync(types(d), 'utf8').replace(/declare module 'claude-code'[\s\S]*$/, '')), /no plugin block/],
    [d => writeFileSync(join(d, 'gauges/hooks/old.ts'), 'export {}\n'), /not a copy or the plugin's own: gauges\/hooks\/old\.ts/],
    [d => writeFileSync(join(d, 'gauges/types/old.d.ts'), 'export {}\n'), /not a copy or the plugin's own: gauges\/types\/old\.d\.ts/],
  ]) {
    const d = scratch()
    try { breakIt(d); const r = check(d); assert.notEqual(r.status, 0); assert.match(r.stdout, says) } finally { rmSync(d, { recursive: true, force: true }) }
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
