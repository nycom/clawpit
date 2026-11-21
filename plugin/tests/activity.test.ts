import { test, expect } from 'claude-code/testing'
import { emptyFacts, isEdit, linesOf, onThink, onTool } from '../hooks/track/activity'

test('activity: each tool maps to its kind, verb and target', () => {
  const f = onTool(emptyFacts(), { tool: 'Edit', agentId: 'a1', input: { file_path: 'x/y/hooks/register.tsx' }, at: 1 })
  expect(f.activity.a1).toEqual({ kind: 'edit', verb: 'Editing', target: 'hooks/register.tsx', at: 1 })
  expect(onTool(emptyFacts(), { tool: 'Grep', input: { pattern: 'UNATTENDED', path: 'hooks/' }, at: 1 }).activity['']).toEqual({ kind: 'search', verb: 'Searching', target: '"UNATTENDED" in hooks/', at: 1 })
  expect(onTool(emptyFacts(), { tool: 'mcp__x__y', input: {}, at: 1 }).activity[''].kind).toBe('other')
})
test('activity: read, run, browse, spawn and think', () => {
  const at = (tool: string, input: Record<string, unknown>) => onTool(emptyFacts(), { tool, input, at: 1 }).activity['']
  expect(at('Read', { file_path: '/a/b/c/d.ts' })).toEqual({ kind: 'read', verb: 'Reading', target: 'c/d.ts', at: 1 })
  expect(at('Bash', { command: 'x'.repeat(60) }).target).toBe('x'.repeat(40))
  expect(at('WebFetch', { url: 'https://example.com/a?b=1' })).toEqual({ kind: 'browse', verb: 'Browsing', target: 'example.com', at: 1 })
  expect(at('WebSearch', { query: 'crabs' }).target).toBe('crabs')
  expect(at('mcp__claude-in-chrome__tabs', {}).kind).toBe('browse')
  expect(at('Agent', { description: 'map the keys' })).toEqual({ kind: 'spawn', verb: 'Starting', target: 'map the keys', at: 1 })
  expect(at('Weird', {})).toEqual({ kind: 'other', verb: 'Weird', target: '', at: 1 })
  expect(onThink(emptyFacts(), 'a1', 7).activity.a1).toEqual({ kind: 'think', verb: 'Thinking', target: '', at: 7 })
  expect(isEdit('MultiEdit')).toBe(true); expect(isEdit('Read')).toBe(false)
})
test('activity: Edit counts plus and minus lines from structuredPatch', () =>
  expect(linesOf('Edit', { structuredPatch: [{ lines: ['+a', '+b', '-c', ' d'] }] })).toEqual({ added: 2, removed: 1 }))
test('activity: a Write that creates a file counts gitDiff additions, else content lines', () => {
  expect(linesOf('Write', { type: 'create', structuredPatch: [], content: 'a\nb\nc', gitDiff: { additions: 7, deletions: 0 } })).toEqual({ added: 7, removed: 0 })
  expect(linesOf('Write', { type: 'create', structuredPatch: [], content: 'a\nb\nc' })).toEqual({ added: 3, removed: 0 })
  expect(linesOf('Write', { type: 'create', structuredPatch: [], content: 'a\nb\nc\n' })).toEqual({ added: 3, removed: 0 })
})
test('activity: a staged edit counts nothing', () => expect(linesOf('Edit', { staged: true, structuredPatch: [{ lines: ['+a'] }] })).toEqual({ added: 0, removed: 0 }))
test('activity: junk results change nothing and do not throw', () => {
  for (const r of [undefined, null, 5, 'x', {}, { structuredPatch: null }, { structuredPatch: [{}] }, { deny: 'no' }])
    expect(linesOf('Edit', r)).toEqual({ added: 0, removed: 0 })
  expect(() => onTool(emptyFacts(), { tool: 'Edit', input: null as never, result: null, at: 1 })).not.toThrow()
})
test('activity: lines add up on success only', () => {
  const r = { structuredPatch: [{ lines: ['+a', '-b'] }] }
  let f = onTool(emptyFacts(), { tool: 'Edit', input: { file_path: 'a' }, result: r, at: 1 })
  f = onTool(f, { tool: 'Edit', input: { file_path: 'a' }, result: r, isError: true, at: 2 })
  expect(f.lines).toEqual({ added: 1, removed: 1 })
})
test('activity: files are capped at 50 per agent', () => {
  let f = emptyFacts()
  for (let i = 0; i < 60; i++) f = onTool(f, { tool: 'Read', agentId: 'a1', input: { file_path: `src/f${i}.ts` }, at: i })
  expect(f.files.a1.length).toBe(50); expect(f.files.a1.at(-1)).toBe('src/f59.ts'); expect(f.files.a1[0]).toBe('src/f10.ts')
})
test('activity: control characters never reach a target', () =>
  expect(onTool(emptyFacts(), { tool: 'Bash', input: { command: 'echo \u0007\nhi' }, at: 1 }).activity[''].target).toBe('echo hi'))
test('activity: C1 control characters are stripped from stored targets', () =>
  expect(onTool(emptyFacts(), { tool: 'Bash', input: { command: 'a\u0085b\u009bc' }, at: 1 }).activity[''].target).toBe('abc'))
