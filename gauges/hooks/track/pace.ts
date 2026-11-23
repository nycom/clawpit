import type { LimitStat } from '../../types'

const LENGTH: Record<string, number> = { five_hour: 18_000_000, seven_day: 604_800_000 }

export const paceOf = (limits: { kind: string; percentUsed: number; resetsAt?: string }[], now: number): LimitStat[] =>
  limits.filter(l => l.kind in LENGTH).map(l => {
    const len = LENGTH[l.kind], end = l.resetsAt === undefined ? NaN : Date.parse(l.resetsAt)
    const elapsed = Math.min(Math.max((now - (end - len)) / len, 0), 1)
    const forecast = Number.isFinite(end) && elapsed >= 0.1
    const projected = forecast ? l.percentUsed / elapsed : null, ahead = projected !== null && projected > 100
    return { kind: l.kind as LimitStat['kind'], pct: l.percentUsed, pacePct: forecast ? elapsed * 100 : null, projected, ahead, hot: l.percentUsed >= 50 || ahead,
      ...(Number.isFinite(end) ? { resetsAt: end } : {}) }
  })

export const paceText = (l: LimitStat): string =>
  l.projected === null ? '' : `on pace for ${l.projected > 200 ? '200%+' : `${Math.round(l.projected)}%`}`
