import { test, expect } from 'claude-code/testing'
import { TOKENS, SURFACE, cssOf, contrast, type TokenName } from '../hooks/tokens'

test('tokens: every text token meets 4.5:1 on both surfaces', () => {
  for (const t of ['fg', 'muted', 'accent', 'warn', 'er', 'okText', 'roleText/implement', 'roleText/review', 'roleText/test', 'roleText/explore', 'roleText/design'] as TokenName[])
    for (const m of ['dark', 'light'] as const) expect(contrast(TOKENS[t][m], SURFACE[m])).toBeGreaterThanOrEqual(4.5)
})
test('tokens: white on red is at least 4.5:1', () => expect(contrast('#ffffff', TOKENS.red.dark)).toBeGreaterThanOrEqual(4.5))
test('tokens: cssOf emits only the classes used, dark inside the media query', () => {
  const css = cssOf(['fg']); expect(css).toContain('.fg{fill:#1f1e1d}')
  expect(css).toContain('@media (prefers-color-scheme: dark){.fg{fill:#ecebe6}}'); expect(css).not.toContain('.muted')
})
test('tokens: an animated image ends with the reduced-motion rule', () =>
  expect(cssOf(['fg'], true)).toContain('@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}'))
test('tokens: a still image carries no animation rule', () => expect(cssOf(['fg'])).not.toContain('animation'))
