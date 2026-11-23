// Text helpers: cleaning outside strings, measuring, wrapping, formatting. Pure.

// Control characters go; line breaks and tabs become a space, then whitespace collapses.
export const oneLine = (v: unknown): string =>
  (typeof v === 'string' ? v : v == null ? '' : String(v))
    .replace(/[\n\r\t\u2028\u2029]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim()
// Where a cut at `k` lands: never inside a token with a digit (":54…" names another port), so it backs off to the space before it.
const cutAt = (s: string, k: number): number => {
  if (k <= 0 || k >= s.length || s[k] === ' ' || s[k - 1] === ' ') return k
  const a = s.lastIndexOf(' ', k - 1), b = s.indexOf(' ', k)
  return a >= 0 && /\d/.test(s.slice(a + 1, b < 0 ? s.length : b)) ? a : k
}
export const clip = (s: string, max: number): string => (s.length <= max ? s : max <= 1 ? '…'.slice(0, max) : s.slice(0, cutAt(s, max - 1)) + '…')
export const xml = (s: string): string => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)

// shortcut: per-class average advance widths in em, not font metrics; swap in measured tables if wraps drift in the app.
const adv = (ch: string) => /[ijl.,:;'|!]/.test(ch) ? 0.28 : /[ftr()\[\]\- ]/.test(ch) ? 0.34 : /[mwMW@]/.test(ch) ? 0.88 : /[A-Z0-9]/.test(ch) ? 0.64 : ch.charCodeAt(0) > 0x2e80 ? 1 : 0.54
export const textWidth = (s: string, sizePx: number, weight: 400 | 600 | 700 = 400): number =>
  [...s].reduce((w, ch) => w + adv(ch), 0) * sizePx * (weight === 400 ? 1 : 1.04)
export const fit = (s: string, widthPx: number, sizePx: number, weight: 400 | 600 | 700 = 400): string => {
  if (textWidth(s, sizePx, weight) <= widthPx) return s
  const body = s.replace(/…$/, ''), out = [...body]
  while (out.length && textWidth(out.join('') + '…', sizePx, weight) > widthPx) out.pop()
  return body.slice(0, cutAt(body, out.join('').length)).trimEnd() + '…'
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
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// When a plan limit resets, by local calendar day, in skins' band's words: '2:40pm' today, 'tmrw 9:00am', 'Mon 9:00am',
// and a week off 'next Fri 9:00am'. Nothing for an unreadable time or one already past: the window has reset since.
export const fmtReset = (at: number, now: number): string => {
  const d = new Date(at), today = new Date(now)
  if (!Number.isFinite(at) || at <= now) return ''
  const h = d.getHours(), time = `${h % 12 || 12}:${pad(d.getMinutes())}${h < 12 ? 'am' : 'pm'}`
  const day = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n)
  if (d.toDateString() === today.toDateString()) return time
  if (d.toDateString() === day(1).toDateString()) return `tmrw ${time}`
  return `${d >= day(7) ? 'next ' : ''}${WEEKDAYS[d.getDay()]} ${time}`
}
export const fmtLeft = (minutes: number): string => (minutes < 1 ? '<1m left' : `~${Math.round(minutes)}m left`)
export const fmtCost = (usd: number): string => (Math.round(usd * 100) >= 10000 ? `$${Math.round(usd)}` : `≈$${usd.toFixed(2)}`)
export const fmtTokens = (n: number): string =>
  n >= 1e6 || Math.round(n / 1e3) >= 1000 ? `${+(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(n >= 1e5 ? 0 : 1)}k` : String(Math.round(n))
export const fmtDuration = (ms: number): string => {
  const m = Math.floor(ms / 60000), h = Math.floor(m / 60)
  return h ? `${h}h ${m % 60}m` : ms > 0 && ms < 60000 ? '<1m' : `${m}m`
}

// Any model id to a label, by its shape alone: no family table, so a family that ships tomorrow reads right today.
// `short` is the one word a row always shows, `name` adds the version, `window` marks a `[1m]` id. An empty id gives three ''.
const capWord = (t: string) => (t.length <= 3 ? t.toUpperCase() : t[0].toUpperCase() + t.slice(1).toLowerCase())
export const modelLabel = (raw: unknown): { short: string; name: string; window: string } => {
  const id = oneLine(raw).replace(/\s+/g, ''), window = /\[1m\]/i.test(id) ? '1M' : '', unbracketed = id.replace(/\[[^\]]*\]/g, '')
  const bare = unbracketed.replace(/^.*\//, '').replace(/^(?:[a-z0-9]+\.)*(?=claude-)/i, '').replace(/^claude-/i, '')
    .replace(/[-@](?:\d{8}|\d{4}-\d{2}-\d{2})(?=$|[-:])/, '').replace(/-v\d+(?::\d+)?$/i, '').replace(/-latest$/i, '')
  const label = (short: string, name: string) => ({ short: clip(short, 9), name: clip(name, 20), window })
  if (!bare) { const left = unbracketed.replace(/[^a-z0-9]+/gi, ' ').trim(); return left ? label(capWord(left), capWord(left)) : label('', '') }
  const ver = (major: string, minor?: string) => `${major}${minor ? '.' + minor : ''}`
  const old = /^(\d+)(?:[-.](\d{1,2}))?-([a-z]+)$/i.exec(bare)   // claude-3-5-sonnet
  if (old) return label(capWord(old[3]), `${capWord(old[3])} ${ver(old[1], old[2])}`)
  const m = /^([a-z]{2,})(?:-(\d+)(?:[-.](\d{1,2})(?!\d))?)?(?:[-:](.+))?$/i.exec(bare)   // opus-5-5, gpt-5-codex, opus
  if (m && (m[2] || !m[4])) { const f = capWord(m[1]); return label(f, `${f}${m[2] ? ' ' + ver(m[2], m[3]) : ''}${m[4] ? ' ' + m[4] : ''}`) }
  const lead = /^[a-z]{2,}/i.exec(bare)?.[0]
  return label(lead ? capWord(lead) : bare, bare)
}
