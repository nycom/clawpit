import type { ContextStat } from '../../types'

export type CtxInput = { percent?: number; breakdown?: { percentage: number; totalTokens: number; rawMaxTokens: number; autoCompactThreshold?: number; isAutoCompactEnabled: boolean; categories: { name: string; tokens: number; kind: string }[] } }

export const pushTurn = (history: number[], totalTokens: number): number[] =>
  history.length && totalTokens < history[history.length - 1] ? [totalTokens] : [...history, totalTokens].slice(-10)

const median = (s: number[]) => s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2

const turnsLeftOf = (b: NonNullable<CtxInput['breakdown']>, history: number[]): number | null => {
  if (history.length < 3) return null
  const growth = history.slice(1).map((t, i) => t - history[i]).filter(d => d > 0).sort((a, b) => a - b)
  if (!growth.length) return null
  return Math.max(0, Math.floor(((b.autoCompactThreshold ?? b.rawMaxTokens) - b.totalTokens) / median(growth)))
}

export const contextOf = (c: CtxInput, history: number[]): ContextStat | null => {
  const b = c.breakdown
  const pct = b ? b.percentage : c.percent
  if (pct === undefined) return null
  const autoPct = b && b.isAutoCompactEnabled && b.autoCompactThreshold !== undefined ? Math.round(b.autoCompactThreshold / b.rawMaxTokens * 100) : null
  const msgs = b?.categories.find(r => r.name === 'Messages' && r.kind === 'used')
  return {
    pct,
    msgsPct: b && msgs ? Math.round(msgs.tokens / b.rawMaxTokens * 100) : null,
    turnsLeft: b ? turnsLeftOf(b, history) : null,
    autoPct,
    alarm: pct >= Math.min(90, (autoPct ?? 97) - 7),
  }
}

export const contextText = (c: ContextStat | null, turns: number): string => {
  if (!c) return 'no reading yet'
  if (c.alarm) return c.autoPct === null ? 'context nearly full' : `auto-compacts at ${c.autoPct}%`
  if (turns < 3) return 'learning your pace'
  const msgs = c.msgsPct === null ? '' : `${c.msgsPct}% msgs`
  return c.turnsLeft === null ? msgs : `~${c.turnsLeft} turns${msgs && ` · ${msgs}`}`
}
