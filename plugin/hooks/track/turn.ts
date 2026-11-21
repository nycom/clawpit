import type { SessionStat, TurnStat } from '../../types'

export type TurnState = { turn: TurnStat | null; cost0: number | null; session: SessionStat; idleSince: number | null }
export const IDLE_ARM_MS = 600_000
export const TURN_COSTS = 20

export const emptyTurn = (): TurnState =>
  ({ turn: null, cost0: null, session: { costUsd: null, lastTurnUsd: null, turns: 0, tokens: 0, agentMs: 0 }, idleSince: null })

const delta = (s: TurnState, usd: number | null) => (usd === null || s.cost0 === null ? null : usd - s.cost0)

export const onStart = (s: TurnState, at: number, usd: number | null): TurnState =>
  ({ ...s, turn: { startedAt: at, added: 0, removed: 0, costUsd: usd === null ? null : 0 }, cost0: usd, idleSince: null })

export const onLines = (s: TurnState, d: { added: number; removed: number }): TurnState =>
  s.turn ? { ...s, turn: { ...s.turn, added: s.turn.added + d.added, removed: s.turn.removed + d.removed } } : s

export const onCost = (s: TurnState, usd: number | null): TurnState =>
  ({ ...s, turn: s.turn && { ...s.turn, costUsd: delta(s, usd) }, session: { ...s.session, costUsd: usd } })

export const onComplete = (s: TurnState, e: { isMain: boolean; durationMs: number; tokens: number }, at: number, usd: number | null): TurnState => {
  const session = { ...s.session, tokens: s.session.tokens + e.tokens }
  if (!e.isMain) return { ...s, session }
  const last = delta(s, usd), costs = session.turnCosts ?? []
  return {
    ...s, turn: null, idleSince: at,
    // shortcut: a turn with no cost reading adds no entry, so the pane's turn numbers drift if readings come and go; record nulls if that shows up.
    session: { ...session, costUsd: usd, lastTurnUsd: last, turns: session.turns + 1, agentMs: session.agentMs + e.durationMs,
      turnCosts: last === null ? costs : [...costs, last].slice(-TURN_COSTS) },
  }
}

export const isArmed = (s: TurnState, now: number): boolean => s.turn !== null || (s.idleSince !== null && now - s.idleSince < IDLE_ARM_MS)
