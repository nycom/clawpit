import type { Eta } from '../../types'

export type History = Record<string, number[]>

export const STAGES = ['implement', 'review', 'fix', 'validate', 'recheck', 'merge', 'docs']
export const stageOf = (description: string, words: readonly string[] = STAGES): string => { const d = description.toLowerCase(); return words.find(s => new RegExp(`\\b${s}\\b`).test(d)) ?? '' }

export const keysOf = (type: string, model: string, description: string, words: readonly string[] = STAGES): [string, string, string] =>
  [`${type} · ${model} · ${stageOf(description, words)}`, `${type} · ${model}`, type]

export const record = (h: History, keys: readonly string[], ms: number): History => {
  const next = { ...h }
  for (const k of keys) next[k] = [...(next[k] ?? []), ms].slice(-20)
  return next
}

const finest = (h: History, keys: readonly string[]) => {
  const k = keys.find(k => (h[k]?.length ?? 0) >= 3)
  return k === undefined ? null : [...h[k]].sort((a, b) => a - b)
}
const median = (s: number[]) => s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2

export const estimate = (h: History, keys: readonly string[], elapsedMs: number): Eta => {
  const s = finest(h, keys)
  if (!s) return { kind: 'none' }
  const med = median(s), p80 = s[Math.ceil(0.8 * s.length) - 1]
  if (elapsedMs <= med) return { kind: 'left', minutes: Math.ceil((med - elapsedMs) / 60_000), slow: false }
  if (elapsedMs <= p80) return { kind: 'left', minutes: Math.ceil((p80 - elapsedMs) / 60_000), slow: true }
  return { kind: 'over' }
}

export const usually = (h: History, keys: readonly string[]): number | null => {
  const s = finest(h, keys)
  return s ? Math.round(median(s) / 60_000) : null
}
