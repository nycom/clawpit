import type { Column, ColumnKey, Crew, Size, Stats } from '../../types'

export const ORDER: readonly ColumnKey[] = ['context', '5h', '7d', 'tokens', 'session', 'turn', 'tests', 'agent', 'reuse', 'callers', 'plan', 'agents']

export const maxColumns = (bodyColumns: number): number => Math.min(6, Math.max(2, Math.floor((bodyColumns - 4) / 14)))

// The core (context, 5h, 7d, tokens, session) ranks by position, so a narrow row drops it from the right; the folded
// agents and plan rank just under context; the extras only fill what is left, in their order.
export const candidates = (stats: Stats, crew: Crew, size: Size, busy: boolean): Column[] => {
  const cols: Column[] = [{ key: 'context', priority: 100 }, { key: 'session', priority: 93 }]
  const folded = size !== 'full'
  if (folded && (crew.agents.length || crew.sessionNeed || crew.background)) cols.push({ key: 'agents', priority: 99 })
  if (folded && crew.plan) cols.push({ key: 'plan', priority: 97 })
  const five = stats.limits.find(l => l.kind === 'five_hour'), seven = stats.limits.find(l => l.kind === 'seven_day')
  if (five) cols.push({ key: '5h', priority: 96 })
  if (seven) cols.push({ key: '7d', priority: 95 })
  if (busy) cols.push({ key: 'turn', priority: 50 })
  if (stats.tests) cols.push({ key: 'tests', priority: 45 })
  if (stats.session.turns >= 3) cols.push({ key: 'tokens', priority: 94 }, { key: 'agent', priority: 40 })
  if (stats.code?.reusePct != null) cols.push({ key: 'reuse', priority: 12 })
  if (stats.code?.callers.length) cols.push({ key: 'callers', priority: 10 })
  return cols
}

export const fit = (cols: Column[], max: number): ColumnKey[] => {
  const kept = new Set([...cols].sort((a, b) => b.priority - a.priority).slice(0, max).map(c => c.key))
  return ORDER.filter(k => kept.has(k))
}

export const lineParts = (stats: Stats, crew: Crew): ('context' | '5h' | '7d' | 'plan' | 'session' | 'agents')[] => {
  const hot = (kind: string) => stats.limits.some(l => l.kind === kind && l.hot)
  return [
    'context',
    ...(hot('five_hour') ? ['5h' as const] : []),
    ...(hot('seven_day') ? ['7d' as const] : []),
    crew.plan ? 'plan' as const : 'session' as const,
    ...(crew.agents.length || crew.sessionNeed || crew.background ? ['agents' as const] : []),
  ]
}
