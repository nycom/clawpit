import { test, expect } from 'claude-code/testing'
import { segBar, dial, stepBlocks, toggleIcon } from '../hooks/icons'

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
