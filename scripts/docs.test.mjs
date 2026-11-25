import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const json = p => JSON.parse(readFileSync(p, 'utf8'))

test('docs: AGENTS.md keeps the preview rule and names the baselines', () => {
  const t = readFileSync('AGENTS.md', 'utf8')
  assert.match(t, /## The preview rule/); assert.match(t, /bash scripts\/preview\.sh/); assert.match(t, /npm run refresh:visual/)
})
test('docs: the README no longer says the build has not started', () => assert.doesNotMatch(readFileSync('README.md', 'utf8'), /build not started/))
test('docs: the README opens its install with claude-kit, warns against enabling both, and names no mockup release state', () => {
  const t = readFileSync('README.md', 'utf8'), install = t.slice(t.indexOf('## Install'))
  assert.equal(install.match(/```\n([^`]*)\n```/)[1], '/plugin install clawpit --marketplace nycom/claude-kit')
  assert.match(t, /Never enable `clawpit@claude-kit` and `clawpit@clawpit` together/)
  assert.doesNotMatch(t, /not released|has merged/)
  assert.doesNotMatch(t.match(/<img alt="([^"]*)"/)[1], /hydra/i)
})
test('docs: both plugins carry the one version number, and AGENTS.md says when to bump it', () => {
  const v = json('plugin/.claude-plugin/plugin.json').version
  assert.match(v, /^\d+\.\d+\.\d+$/); assert.equal(json('gauges/.claude-plugin/plugin.json').version, v)
  assert.match(readFileSync('AGENTS.md', 'utf8'), /## Releases/)
})
test('docs: the README carries the command the Agents pane shows without savvy-progress', () => {
  const cmd = readFileSync('plugin/hooks/pane/draw.ts', 'utf8').match(/INSTALL_SAVVY = '([^']+)'/)[1]
  assert.ok(readFileSync('README.md', 'utf8').split('\n').includes(cmd))
})
test('docs: no marketplace entry carries a version of its own', () => {
  for (const p of json('.claude-plugin/marketplace.json').plugins) assert.equal(p.version, undefined)
})
