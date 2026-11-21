// Fixed colour, size and motion tokens (ALIGNMENT "Colour"). Pure: no host imports.
import type { Role } from '../types'

const ROLES: Role[] = ['implement', 'review', 'test', 'explore', 'design']
export type TokenName =
  | 'fg' | 'muted' | 'track' | 'wash' | 'accent' | 'ok' | 'okText' | 'warn' | 'er' | 'red' | 'needTint' | 'crab' | 'crabInk' | 'halo35' | 'ring60' | 'tint28/er'
  | `role/${Role}` | `roleText/${Role}` | `tint28/${Role}`
type Pair = { light: string; dark: string }

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`
}
const ROLE_FILL: Record<Role, Pair> = {
  implement: { dark: '#1fa8b8', light: '#1d9ead' }, review: { dark: '#c4479b', light: '#c4479b' }, test: { dark: '#8aa62a', light: '#809a27' },
  explore: { dark: '#8a929c', light: '#89919a' }, design: { dark: '#c98af0', light: '#b179d3' },
}
const ROLE_TEXT: Record<Role, Pair> = {
  implement: { dark: '#4cc3d1', light: '#12707c' }, review: { dark: '#e483c6', light: '#a0337c' }, test: { dark: '#a9c454', light: '#566916' },
  explore: { dark: '#adb4bd', light: '#5a6169' }, design: { dark: '#d6a8f5', light: '#874fae' },
}
const ER: Pair = { dark: '#ff7a66', light: '#b3261e' }

const base: Record<string, Pair> = {
  fg: { dark: '#ecebe6', light: '#1f1e1d' }, muted: { dark: '#a3a29b', light: '#5f5e58' },
  track: { dark: 'rgba(255,255,255,.1)', light: 'rgba(0,0,0,.09)' }, wash: { dark: 'rgba(255,255,255,.06)', light: 'rgba(0,0,0,.05)' },
  accent: { dark: '#7aa2f7', light: '#2959aa' }, ok: { dark: '#5fbf8f', light: '#2e8c61' }, okText: { dark: '#5fbf8f', light: '#237550' },
  warn: { dark: '#e3a03d', light: '#9a5c00' }, er: ER, red: { dark: '#b3261e', light: '#b3261e' },
  needTint: { dark: rgba('#b3261e', 0.16), light: rgba('#b3261e', 0.08) },
  crab: { dark: '#d97757', light: '#d97757' }, crabInk: { dark: '#1f1e1d', light: '#1f1e1d' },
  halo35: { dark: rgba('#b3261e', 0.35), light: rgba('#b3261e', 0.35) },
  ring60: { dark: rgba(ER.dark, 0.6), light: rgba(ER.light, 0.6) },
  'tint28/er': { dark: rgba(ER.dark, 0.28), light: rgba(ER.light, 0.28) },
}
for (const r of ROLES) {
  base[`role/${r}`] = ROLE_FILL[r]; base[`roleText/${r}`] = ROLE_TEXT[r]
  base[`tint28/${r}`] = { dark: rgba(ROLE_FILL[r].dark, 0.28), light: rgba(ROLE_FILL[r].light, 0.28) }
}
export const TOKENS = base as Record<TokenName, Pair>
export const SURFACE = { dark: '#252424', light: '#faf9f5' } as const
export const CELL_PX = 8.5
export const SIZE = { chip: 26, row: 48, needRow: 62, helperRow: 32, endedRow: 30, toggle: 24, crab: { S: [25.5, 21], M: [34, 28], L: [51, 42] } } as const
export const MOTION = { curve: 'cubic-bezier(.2,.8,.2,1)', walk: '.5s steps(1)', beat: '1.2s steps(2)', settleMs: 900, fillMs: 600, revealMs: 300 } as const
export const FONT = '-apple-system,BlinkMacSystemFont,system-ui,sans-serif'
export const MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace'

// Class names are token names with '/' as '-'. `s-<token>` strokes, any other token fills.
export const cls = (t: TokenName) => t.replace('/', '-')
const BY_CLASS = new Map((Object.keys(TOKENS) as TokenName[]).map(t => [cls(t), t]))

// Motion classes: the same rule in light and dark, emitted only when used.
const MOTION_RULES: Record<string, string> = {
  la: `.la{animation:st ${MOTION.walk} infinite}`, lb: `.lb{animation:st ${MOTION.walk} infinite -.25s}`,
  bd: `.bd{animation:bob ${MOTION.walk} infinite -.125s}`, pr: `.pr{animation:bob ${MOTION.walk} infinite -.125s}`,
  flag: '.flag{transform-origin:0 50%;animation:wave .5s steps(1) 6}',
  hop: `.hop{animation:hop ${MOTION.beat} infinite}`, sway: `.sway{animation:sway ${MOTION.beat} infinite}`,
  grow: `.grow{transform-box:fill-box;transform-origin:0 50%;animation:grow ${MOTION.fillMs}ms ${MOTION.curve} both}`,
}
const KEYFRAMES: Record<string, string> = {
  la: '@keyframes st{50%{transform:translateY(-1px)}}', lb: '@keyframes st{50%{transform:translateY(-1px)}}',
  bd: '@keyframes bob{50%{transform:translateY(1px)}}', pr: '@keyframes bob{50%{transform:translateY(1px)}}',
  flag: '@keyframes wave{50%{transform:skewY(-14deg)}}', hop: '@keyframes hop{50%{transform:translateY(-3px)}}',
  sway: '@keyframes sway{50%{transform:translateX(2px)}}', grow: '@keyframes grow{from{transform:scaleX(0)}}',
}
const REDUCED = '@media (prefers-reduced-motion: reduce){*{animation:none!important;transition:none!important}}'

export const cssOf = (used: Iterable<string>, animated = false): string => {
  const names = [...new Set(used)].sort()
  const rule = (c: string, m: 'light' | 'dark') => {
    const stroke = c.startsWith('s-'), t = BY_CLASS.get(stroke ? c.slice(2) : c)
    return t ? `.${c}{${stroke ? 'stroke' : 'fill'}:${TOKENS[t][m]}}` : ''
  }
  const light = names.map(c => rule(c, 'light')).join('')
  const dark = names.map(c => rule(c, 'dark')).join('')
  const motion = names.map(c => MOTION_RULES[c] ?? '').join('')
  const kf = [...new Set(names.map(c => KEYFRAMES[c] ?? ''))].join('')
  return `<style>${light}${dark ? `@media (prefers-color-scheme: dark){${dark}}` : ''}${motion}${kf}${animated ? REDUCED : ''}</style>`
}

export const svg = (w: number, h: number, body: string, animated = false): string => {
  const used = new Set<string>()
  for (const m of body.matchAll(/class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) used.add(c)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${cssOf(used, animated)}${body}</svg>`
}

const chan = (s: string, bg?: number[]): number[] => {
  const m = s.match(/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/)
  if (m) { const a = +m[4]; return [1, 2, 3].map((k, i) => +m[k] * a + (bg ? bg[i] : 0) * (1 - a)) }
  const n = parseInt(s.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}
const lum = (rgb: number[]) => rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0)
export const contrast = (fg: string, bg: string): number => {
  const b = chan(bg), a = lum(chan(fg, b)), c = lum(b)
  return (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05)
}
