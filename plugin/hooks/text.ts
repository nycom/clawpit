// Text helpers: cleaning outside strings, measuring, wrapping, formatting. Pure.

// Control characters go; line breaks and tabs become a space, then whitespace collapses.
export const oneLine = (v: unknown): string =>
  (typeof v === 'string' ? v : v == null ? '' : String(v))
    .replace(/[\n\r\t\u2028\u2029]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()
export const clip = (s: string, max: number): string => (s.length <= max ? s : max <= 1 ? '…'.slice(0, max) : s.slice(0, max - 1) + '…')
export const xml = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

// shortcut: per-class average advance widths in em, not font metrics; swap in measured tables if wraps drift in the app.
const adv = (ch: string) => /[ijl.,:;'|!]/.test(ch) ? 0.28 : /[ftr()\[\]\- ]/.test(ch) ? 0.34 : /[mwMW@]/.test(ch) ? 0.88 : /[A-Z0-9]/.test(ch) ? 0.64 : ch.charCodeAt(0) > 0x2e80 ? 1 : 0.54
export const textWidth = (s: string, sizePx: number, weight: 400 | 600 | 700 = 400): number =>
  [...s].reduce((w, ch) => w + adv(ch), 0) * sizePx * (weight === 400 ? 1 : 1.04)
export const fit = (s: string, widthPx: number, sizePx: number, weight: 400 | 600 | 700 = 400): string => {
  if (textWidth(s, sizePx, weight) <= widthPx) return s
  const out = [...s.replace(/…$/, '')]
  while (out.length && textWidth(out.join('') + '…', sizePx, weight) > widthPx) out.pop()
  return out.join('').trimEnd() + '…'
}
// Greedy wrap; whatever does not fit in the last line is cut and marked with an ellipsis.
export const wrap = (s: string, widthPx: number, sizePx: number, lines: number, weight: 400 | 600 | 700 = 400): string[] => {
  const words = s.split(' ').filter(Boolean), out: string[] = []
  let cur = ''
  for (let i = 0; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i]
    if (textWidth(next, sizePx, weight) <= widthPx) { cur = next; continue }
    if (out.length < lines - 1) { if (cur) out.push(cur); cur = fit(words[i], widthPx, sizePx, weight); continue }
    return [...out, fit(`${cur} ${words.slice(i).join(' ')}`.trim() + '…', widthPx, sizePx, weight)]
  }
  if (cur) out.push(cur)
  return out
}
const pad = (n: number) => String(n).padStart(2, '0')
export const fmtClock = (ms: number): string => { const t = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(t / 60)}:${pad(t % 60)}` }
export const fmtAge = (ms: number): string => { const t = Math.max(0, Math.floor(ms / 1000)); return t < 60 ? `${t}s` : `${Math.floor(t / 60)}m` }
export const fmtLeft = (minutes: number): string => (minutes < 1 ? '<1m left' : `~${Math.round(minutes)}m left`)
export const fmtCost = (usd: number): string => (Math.round(usd * 100) >= 10000 ? `$${Math.round(usd)}` : `≈$${usd.toFixed(2)}`)
export const fmtTokens = (n: number): string =>
  n >= 1e6 || Math.round(n / 1e3) >= 1000 ? `${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n))
export const fmtDuration = (ms: number): string => {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : `${m}m`
}
