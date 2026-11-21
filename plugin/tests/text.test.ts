import { test, expect } from 'claude-code/testing'
import { oneLine, xml, clip, wrap, textWidth, fmtClock, fmtAge, fmtLeft, fmtCost, fmtTokens, fmtDuration } from '../hooks/text'

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
