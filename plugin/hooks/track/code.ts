import type { CodeStat } from '../../types'
import { clean } from './activity'

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
