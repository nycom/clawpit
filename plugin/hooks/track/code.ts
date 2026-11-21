import type { CodeStat } from '../../types'

// Stands in for oneLine and clip until the kit is wired in.
const clean = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/[\t\n\r\f\v]/g, ' ').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export const codeOf = (band: unknown): CodeStat | null => {
  if (!band || typeof band !== 'object') return null
  const b = band as Record<string, unknown>
  const reused = strings(b.reused).length, created = strings(b.created).length
  return {
    reusePct: reused + created < 3 ? null : Math.round(reused / (reused + created) * 100),
    reused, created,
    callers: strings(b.openCallers).map(r => clean(r, 120)).filter(Boolean),
  }
}
