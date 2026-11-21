import type { Crew, Settle, Size } from '../../types'
import { alertsOf } from '../model'

const NEXT: Record<Size, Size> = { full: 'gauges', gauges: 'line', line: 'full' }

export const nextSize = (s: Size): Size => NEXT[s]
export const parseSize = (v: unknown): Size => (v === 'gauges' || v === 'line' ? v : 'full')
export const hasDot = (size: Size, crew: Crew): boolean => {
  const { need, failed } = alertsOf(crew)
  return size !== 'full' && need + failed > 0
}
export const settle = (prev: Settle | undefined, pct: number): Settle =>
  !prev ? { from: pct, to: pct } : pct === prev.to ? prev : { from: prev.to, to: pct }
