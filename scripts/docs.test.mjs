import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('docs: AGENTS.md keeps the preview rule and names the baselines', () => {
  const t = readFileSync('AGENTS.md', 'utf8')
  assert.match(t, /## The preview rule/); assert.match(t, /bash scripts\/preview\.sh/); assert.match(t, /npm run refresh:visual/)
})
test('docs: the README no longer says the build has not started', () => assert.doesNotMatch(readFileSync('README.md', 'utf8'), /build not started/))
