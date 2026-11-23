import { test, expect } from 'claude-code/testing'
import { oneLine, xml, clip, fit, wrap, textWidth, fmtClock, fmtAge, fmtLeft, fmtCost, fmtTokens, fmtDuration, fmtReset, modelLabel } from '../hooks/text'

test('text: oneLine strips control characters', () => expect(oneLine('a\u0000b\n c\u001b[31m')).toBe('ab c[31m'))
test('text: xml escapes the five characters', () => expect(xml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;'))
test('text: clip ends with an ellipsis', () => expect(clip('abcdef', 4)).toBe('abc…'))
test('text: wrap gives at most two lines and marks the cut', () => {
  const out = wrap('Postgres or SQLite for the fixture, and which port should it use?', 120, 12, 2)
  expect(out.length).toBe(2); expect(out[1].endsWith('…')).toBe(true); expect(out.every(l => textWidth(l, 12) <= 120)).toBe(true)
})
test('text: formats', () => {
  expect(fmtClock(102_000)).toBe('1:42'); expect(fmtAge(42_000)).toBe('42s'); expect(fmtAge(180_000)).toBe('3m')
  expect(fmtLeft(0)).toBe('<1m left'); expect(fmtLeft(2)).toBe('~2m left'); expect(fmtCost(0.42)).toBe('≈$0.42'); expect(fmtCost(267)).toBe('$267')
  expect(fmtTokens(441_000_000)).toBe('441M'); expect(fmtTokens(12_300)).toBe('12.3k'); expect(fmtDuration(39_000_000)).toBe('10h 50m'); expect(fmtDuration(840_000)).toBe('14m')
})
test('text: wrap cuts a long unbreakable word to the width', () => {
  const out = wrap('Use /srv/app/code/project/src/components/VeryLongFileName.tsx?', 120, 12, 2)
  expect(out.every(l => textWidth(l, 12) <= 120)).toBe(true); expect(out[1]).toContain('…')
})
test('text: formatters pick the unit after rounding', () => { expect(fmtCost(99.999)).toBe('$100'); expect(fmtTokens(999_999)).toBe('1M') })
test('text: wrap keeps a long first word instead of dropping it', () => {
  const out = wrap('/srv/app/code/project/VeryLongFileName.tsx is missing', 88, 12, 2)
  expect(out[0]).toContain('/srv'); expect(out.every(l => textWidth(l, 12) <= 88)).toBe(true)
  expect(wrap('/srv/app/code/project/VeryLongFileName.tsx', 88, 12, 2)[0]).toContain('/srv')
})
test('text: wrap carries the words after a long first word to line 2', () => {
  const out = wrap('src/app/code/project/src/VeryLongFileName.tsx is missing', 88, 12, 2)
  expect(out.length).toBe(2); expect(out[1]).toContain('is'); expect(out.every(l => textWidth(l, 12) <= 88)).toBe(true)
})
test('text: a cut never splits a token with a digit', () => {
  const s = 'Could not reach Postgres on :5432 after three restarts'
  expect(fit(s, textWidth('Could not reach Postgres on :54…', 12), 12)).toBe('Could not reach Postgres on…')
  expect(clip('Postgres on :5432', 15)).toBe('Postgres on…')
  expect(wrap(s, textWidth('Postgres on :54…', 12, 600), 12, 2, 600)).toEqual(['Could not reach', 'Postgres on…'])
  // A word with no digit is still cut inside; a lone token with no space before it keeps its cut.
  expect(fit('Searching hooks', textWidth('Searching ho…', 12), 12)).toBe('Searching ho…')
  expect(fit('v2.5.10-beta', textWidth('v2.5.…', 12), 12)).toBe('v2.5.…')
})
test('text: a duration under a minute reads <1m, none reads 0m', () => {
  expect(fmtDuration(1)).toBe('<1m'); expect(fmtDuration(59_999)).toBe('<1m'); expect(fmtDuration(60_000)).toBe('1m'); expect(fmtDuration(0)).toBe('0m')
})

// Any id the run tracker reports reads as a model: no family table, nothing tied to one orchestrator.
test('text: modelLabel reads any id', () => {
  const cases: [string, string, string, string][] = [
    ['claude-opus-5-5', 'Opus', 'Opus 5.5', ''],
    ['claude-fable-5-2', 'Fable', 'Fable 5.2', ''],
    ['claude-sonnet-5-5[1m]', 'Sonnet', 'Sonnet 5.5', '1M'],
    ['claude-opus-5-5[1m][beta]', 'Opus', 'Opus 5.5', '1M'],
    ['claude-haiku-4-5-20251001', 'Haiku', 'Haiku 4.5', ''],
    ['claude-sonnet-4-20250514', 'Sonnet', 'Sonnet 4', ''],
    ['claude-3-5-sonnet-20241022', 'Sonnet', 'Sonnet 3.5', ''],
    ['opus', 'Opus', 'Opus', ''], ['sonnet', 'Sonnet', 'Sonnet', ''], ['haiku', 'Haiku', 'Haiku', ''], ['fable', 'Fable', 'Fable', ''],
    ['opus[1m]', 'Opus', 'Opus', '1M'],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 'Sonnet', 'Sonnet 4.5', ''],
    ['anthropic/claude-opus-5-5', 'Opus', 'Opus 5.5', ''],
    ['claude-nova-7-1', 'Nova', 'Nova 7.1', ''],
    ['gpt-5-codex', 'GPT', 'GPT 5 codex', ''],
    ['gemini-2.5-pro', 'Gemini', 'Gemini 2.5 pro', ''],
    ['qwen2.5-coder:32b', 'Qwen', 'qwen2.5-coder:32b', ''],
    ['o3', 'o3', 'o3', ''],
    ['internal-router-experimental-build-7', 'Internal', 'internal-router-exp…', ''],
    ['claude-', 'Claude', 'Claude', ''],
    ['', '', '', ''], ['   ', '', '', ''],
    ['claude-opus-\n5-5\u0007', 'Opus', 'Opus 5.5', ''],
  ]
  for (const [id, short, name, window] of cases) expect([id, modelLabel(id)]).toEqual([id, { short, name, window }])
  expect(modelLabel(undefined)).toEqual({ short: '', name: '', window: '' })
})
test('text: modelLabel never gives a short word past 9 characters', () => expect(modelLabel('claude-supercalifragilistic-9').short.length).toBeLessThanOrEqual(9))

// When a plan limit resets, by local calendar day, as skins' band said it (the same words).
test('text: fmtReset reads today, tomorrow, the weekday, then next weekday; nothing once past or unreadable', () => {
  const now = new Date(2026, 10, 21, 12, 0).getTime()   // a Saturday, local time
  expect(fmtReset(new Date(2026, 10, 21, 14, 40).getTime(), now)).toBe('2:40pm')
  expect(fmtReset(new Date(2026, 10, 21, 0, 5).getTime(), new Date(2026, 10, 20, 23, 0).getTime())).toBe('tmrw 12:05am')
  expect(fmtReset(new Date(2026, 10, 22, 9, 0).getTime(), now)).toBe('tmrw 9:00am')
  expect(fmtReset(new Date(2026, 10, 24, 9, 0).getTime(), now)).toBe('Tue 9:00am')
  expect(fmtReset(new Date(2026, 10, 28, 9, 0).getTime(), now)).toBe('next Sat 9:00am')
  expect(fmtReset(new Date(2026, 10, 21, 11, 0).getTime(), now)).toBe('')
  expect(fmtReset(NaN, now)).toBe('')
})
