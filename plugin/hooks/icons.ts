// Icon, dial and bar drawings as SVG fragments (no <svg> wrapper), coloured by token classes. Pure.
import type { Role, Settle, Size } from '../types'
import { MOTION } from './tokens'

const PATHS = { chev: 'M4.5 2.5 8 6l-3.5 3.5', check: 'M2.5 6.3 5 8.8l4.5-5.3', cross: 'M3 3l6 6M9 3 3 9',
  ask: 'M4.2 4.4a1.8 1.8 0 1 1 2.6 1.6c-.5.3-.8.7-.8 1.2v.5M6 9.6v.01',
  squeeze: 'M3.5 1.5 6 4l2.5-2.5M3.5 10.5 6 8l2.5 2.5M2 6h8',
  // Background kinds: a prompt chevron over an underscore, a pulse line, a repeat cycle (a cron comes back), an hourglass (a wakeup runs out once).
  shell: 'M2 3.5 4.8 6 2 8.5M6.5 9h3.5', monitor: 'M1 6h2.4l1.4-3 2.4 6 1.4-3H11',
  cron: 'M2.4 6A3.6 3.6 0 0 1 8.6 3.5M8.9 1.4v2.3H6.6M9.6 6A3.6 3.6 0 0 1 3.4 8.5M3.1 10.6V8.3h2.3',
  wakeup: 'M3 1.5h6M3 10.5h6M3.7 1.5v1.3c0 1.5 2.3 2 2.3 3.2S3.7 7.7 3.7 9.2v1.3M8.3 1.5v1.3C8.3 4.3 6 4.8 6 6s2.3 1.7 2.3 3.2v1.3' } as const
const n = (v: number) => +v.toFixed(2)

// `cls` is a stroke class, for example "s-muted".
export const icon = (name: keyof typeof PATHS, sizePx: 10 | 12, cls: string): string =>
  `<path class="${cls}" transform="scale(${n(sizePx / 12)})" d="${PATHS[name]}" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`

// Stop: the standard filled rounded square, 8 in a 12 box; `cls` is a fill class, for example "muted".
export const stopSquare = (cls: string): string => `<rect x="2" y="2" width="8" height="8" rx="1.5" class="${cls}"/>`

// A 14x14 picture of the panel in its size; the dot marks an agent that needs you while folded.
export const toggleIcon = (size: Size, hasDot: boolean): string => {
  const line = size === 'line', full = size === 'full'
  const top = line ? '<rect x="2" y="6" width="10" height="2" rx="1" class="muted"/>' : '<rect x="2" y="2.5" width="10" height="3.5" rx="1.2" class="muted"/>'
  const row = line ? '' : full
    ? '<rect x="2" y="8.5" width="2.8" height="2.6" rx=".9" class="muted"/><rect x="5.6" y="8.5" width="2.8" height="2.6" rx=".9" class="muted" opacity=".7"/><rect x="9.2" y="8.5" width="2.8" height="2.6" rx=".9" class="muted" opacity=".7"/>'
    : '<rect x="2.5" y="8.8" width="9" height="2" rx="1" fill="none" class="s-muted" stroke-width=".9" stroke-dasharray="1.2 1.1" opacity=".75"/>'
  return `<rect x=".6" y=".6" width="12.8" height="12.8" rx="3" fill="none" class="s-muted" stroke-opacity=".45"/>${top}${row}${hasDot ? '<circle cx="11.8" cy="2.2" r="2" class="er"/>' : ''}`
}

const CX = 17, CY = 19, R = 14
const pt = (p: number) => { const a = Math.PI * (1 + p / 100); return `${n(CX + R * Math.cos(a))} ${n(CY + R * Math.sin(a))}` }
const arc = (p0: number, p1: number, cls: string, op = 1) =>
  `<path d="M${pt(p0)} A${R} ${R} 0 0 1 ${pt(p1)}" fill="none" class="${cls}" stroke-opacity="${op}" stroke-width="3.2" stroke-linecap="round"/>`
const deg = (p: number) => n((180 * p) / 100)

// A 34x22 half dial (x.75 when small). `base` is the grey base arc of the context dial, up to that percent.
// `now` lets a redraw mid-sweep continue the sweep rather than restart it.
export const dial = (pct: number, tone: 'accent' | 'warn' | 'er', opts: { ghost?: number; small?: boolean; settle?: Settle; base?: number; now?: number } = {}): string => {
  const p = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0)), base = opts.base ?? 0
  // The ghost is rounded to half a percent and a still settle draws no animation, so the image only changes when
  // something moved: a source that differs every tick remounts an animated image in the app (2026-11-21).
  const ghost = opts.ghost == null ? '' : `<g transform="rotate(${deg(Math.round(opts.ghost * 2) / 2)} ${CX} ${CY})"><line x1="${CX}" y1="${CY}" x2="${CX - R + 3}" y2="${CY}" class="s-muted" stroke-width="1.6" stroke-dasharray="2 1.6"/></g>`
  const s = opts.settle && deg(opts.settle.from) !== deg(opts.settle.to) ? opts.settle : undefined
  const kfName = s ? `nd${deg(s.from)}-${deg(s.to)}`.replace(/\./g, 'p') : '' // a dot is not valid in a CSS identifier
  const elapsed = s && opts.now != null ? Math.max(0, Math.round(opts.now - s.at)) : 0
  const anim = s ? `;animation:${kfName} ${MOTION.settleMs}ms ${MOTION.curve}${elapsed ? ` -${elapsed}ms` : ''}` : ''
  const kf = s ? `<style>@keyframes ${kfName}{from{transform:rotate(${deg(s.from)}deg)}to{transform:rotate(${deg(s.to)}deg)}}</style>` : ''
  const needle = `<g style="transform-origin:${CX}px ${CY}px;transform:rotate(${deg(p)}deg)${anim}"><line x1="${CX}" y1="${CY}" x2="${CX - R + 4}" y2="${CY}" class="s-fg" stroke-width="1.8" stroke-linecap="round"/></g>`
  const body = `${kf}${arc(0.5, 99.5, 's-track')}${base ? arc(0.5, base, 's-muted', 0.85) : ''}${p > (base || 1) ? arc(base || 0.5, p, `s-${tone}`) : ''}${ghost}${needle}<circle cx="${CX}" cy="${CY}" r="2.4" class="fg"/>`
  return opts.small ? `<g transform="scale(.75)">${body}</g>` : body
}

export type Seg = { state: 'done' | 'live' | 'need' | 'failed' | 'todo'; role?: Role; fill: number }
// Full tier 8px / radius 3, compact 6px / radius 2, gap 2 (narrower when crowded). `grow` adds the 600 ms fill one-shot.
export const segBar = (segs: Seg[], widthPx: number, tier: 'full' | 'compact', grow = false): string => {
  const h = tier === 'full' ? 8 : 6, r = tier === 'full' ? 3 : 2, gap = Math.min(2, widthPx / (segs.length || 1) / 2), w = (widthPx - gap * (segs.length - 1)) / (segs.length || 1)
  return segs.map((s, i) => {
    const x = n(i * (w + gap)), box = (c: string, bw: number, extra = '') => `<rect x="${x}" y="0" width="${n(bw)}" height="${h}" rx="${r}" class="${c}${extra}"/>`
    if (s.state === 'done') return box('ok', w)
    if (s.state === 'failed') return box('er', w)
    if (s.state === 'todo') return box('track', w)
    const col = s.state === 'need' ? 'er' : `role-${s.role ?? 'explore'}`
    const f = Math.min(1, Math.max(s.state === 'live' ? 0.08 : 0, Number.isFinite(s.fill) ? s.fill : 0))
    return box(`tint28-${s.state === 'need' ? 'er' : s.role ?? 'explore'}`, w) + (f > 0 ? box(col, w * f, grow ? ' grow' : '') : '')
  }).join('')
}

// Compact step blocks: 6px squares, gap 2.
export const stepBlocks = (done: number, total: number, tone: Role | 'er'): string =>
  Array.from({ length: Math.max(0, total) }, (_, i) =>
    `<rect x="${i * 8}" y="0" width="6" height="6" rx="2" class="${i < done ? (tone === 'er' ? 'er' : `role-${tone}`) : 'track'}"/>`).join('')
