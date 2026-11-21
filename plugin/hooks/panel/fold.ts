import type { Crew, Settle, Size } from '../../types'
import { alertsOf } from '../model'
import { MOTION } from '../tokens'

const NEXT: Record<Size, Size> = { full: 'gauges', gauges: 'line', line: 'full' }

export const nextSize = (s: Size): Size => NEXT[s]
export const parseSize = (v: unknown): Size => (v === 'gauges' || v === 'line' ? v : 'full')
export const hasDot = (size: Size, crew: Crew): boolean => {
  const { need, failed } = alertsOf(crew)
  return size !== 'full' && need + failed > 0
}
export const settle = (prev: Settle | undefined, pct: number, at: number): Settle =>
  !prev ? { from: pct, to: pct, at } : pct === prev.to ? prev : { from: prev.to, to: pct, at }
// Only a settle inside its sweep reaches a dial: a later redraw for any other reason must not sweep the needle again.
export const moving = (all: Record<string, Settle>, now: number): Record<string, Settle> =>
  Object.fromEntries(Object.entries(all).filter(([, s]) => now - s.at < MOTION.settleMs))
