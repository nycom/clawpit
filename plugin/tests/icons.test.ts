import { test, expect } from 'claude-code/testing'
import { segBar, dial, stepBlocks, toggleIcon, icon, stopSquare } from '../hooks/icons'

test('icons: a live segment is never under 8 percent', () => expect(segBar([{ state: 'live', role: 'test', fill: 0.01 }], 100, 'full')).toContain('width="8"'))
test('icons: a failed segment is solid er', () => expect(segBar([{ state: 'failed', fill: 0 }], 100, 'full')).toContain('class="er"'))
test('icons: the compact tier is 6px', () => expect(segBar([{ state: 'done', fill: 1 }], 100, 'compact')).toContain('height="6"'))
test('icons: a settling needle animates, a placed one does not', () => {
  expect(dial(50, 'accent', { settle: { from: 20, to: 50 } })).toContain('900ms')
  expect(dial(50, 'accent', {})).not.toContain('animation')
})
test('icons: a bad percent never prints NaN', () => expect(dial(NaN, 'er', {})).not.toContain('NaN'))
test('icons: step blocks fill the done ones', () => expect((stepBlocks(2, 4, 'test').match(/role-test/g) ?? []).length).toBe(2))
test('icons: the toggle dot appears only when asked', () => {
  expect(toggleIcon('gauges', true)).toContain('class="er"'); expect(toggleIcon('gauges', false)).not.toContain('class="er"')
})
test('icons: a fractional settle gets a valid keyframe name', () => {
  const svg = dial(63, 'accent', { settle: { from: 42, to: 63 } })
  expect(svg).not.toMatch(/nd\d+\./)
  expect(svg).toContain('@keyframes nd75p6-113p4')
})
test('icons: a crowded bar keeps every segment at least 1px wide', () =>
  expect(segBar(Array.from({ length: 40 }, () => ({ state: 'done' as const, fill: 1 })), 60, 'compact')).not.toContain('width="-'))
test('icons: a crowded bar stays inside its width', () => {
  const svg = segBar(Array.from({ length: 40 }, () => ({ state: 'done' as const, fill: 1 })), 60, 'compact')
  const ends = [...svg.matchAll(/x="([\d.]+)" y="0" width="([\d.]+)"/g)].map(m => +m[1] + +m[2])
  expect(Math.max(...ends)).toBeLessThanOrEqual(60)
})
test('icons: the background kinds are distinct stroked paths, scaled to the size asked', () => {
  const names = ['shell', 'monitor', 'cron', 'wakeup'] as const, ds = names.map(k => /d="([^"]+)"/.exec(icon(k, 12, 's-muted'))![1])
  expect(new Set(ds).size).toBe(names.length)
  for (const k of names) { expect(icon(k, 12, 's-muted')).toContain('fill="none"'); expect(icon(k, 10, 's-er')).toContain('scale(0.83)') }
})
test('icons: Stop is a filled rounded square of 8 in a 12 box, in the fill class asked', () => {
  expect(stopSquare('muted')).toBe('<rect x="2" y="2" width="8" height="8" rx="1.5" class="muted"/>')
})
