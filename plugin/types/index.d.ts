// The shared contract: every type of the technical design, section 5, plus the atoms clawpit owns and reads.

export type Role = 'implement' | 'review' | 'test' | 'explore' | 'design'
export type Prop = 'search' | 'read' | 'write' | 'think' | 'wait' | 'fail' | 'done' | 'none'
export type Size = 'full' | 'gauges' | 'line'
export type CrabSize = 'S' | 'M' | 'L'                       // .75, 1, 1.5 of 34x28

export type ActivityKind = 'search' | 'read' | 'edit' | 'run' | 'browse' | 'think' | 'wait' | 'spawn' | 'other'
export type Activity = { kind: ActivityKind; verb: string; target: string; at: number }
export type LogKind = 'step' | 'try' | 'fail' | 'ask' | 'helper'
export type LogLine = { kind: LogKind; text: string; at: number }

export type Eta = { kind: 'none' } | { kind: 'left'; minutes: number; slow: boolean } | { kind: 'over' }

export type CrewState = 'need' | 'failed' | 'running' | 'ended'
export type CrewAgent = {
  id: string; title: string; role: Role; model: string
  state: CrewState; struggling: boolean; tries: number
  prop: Prop; activity: Activity | null
  question?: string; reason?: string; errorLine?: string
  stepDone: number; stepTotal: number
  eta: Eta; usuallyMin: number | null
  startedAt: number; endedAt?: number
  contextPct: number; costUsd: number
  parentId?: string; helpers: CrewAgent[]; log: LogLine[]
}
export type PlanPhase = 'plan' | 'delegate' | 'review' | 'close'
export type PlanTask = { name: string; state: 'done' | 'live' | 'need' | 'failed' | 'todo'; role?: Role; fill: number }
export type Plan = { title: string; phase: PlanPhase; done: number; total: number; tasks: PlanTask[] }
export type Crew = {
  title: string                      // flow title, or "Subagents"
  agents: CrewAgent[]                // top level, in section order: need, failed, running
  ended: CrewAgent[]
  counts: { need: number; failed: number; running: number; done: number }
  costUsd: number; leftMin: number | null
  plan: Plan | null
}

export type ContextStat = { pct: number; msgsPct: number | null; turnsLeft: number | null; autoPct: number | null; alarm: boolean }
export type LimitStat = { kind: 'five_hour' | 'seven_day'; pct: number; pacePct: number | null; projected: number | null; ahead: boolean; hot: boolean }
export type TurnStat = { startedAt: number; added: number; removed: number; costUsd: number | null }
export type TestStat = { passed: number; failed: number; at: number }
export type SessionStat = { costUsd: number | null; lastTurnUsd: number | null; turns: number; tokens: number; agentMs: number }
export type Stats = { context: ContextStat | null; limits: LimitStat[]; turn: TurnStat | null; tests: TestStat | null; session: SessionStat }

export type ColumnKey = 'context' | 'turn' | '5h' | '7d' | 'plan' | 'session' | 'tests' | 'tokens' | 'agent' | 'agents'
export type Column = { key: ColumnKey; priority: number }
export type Ui = { size: Size; open: string | null; shut: string[]; paneOpen: boolean }
export type Mascot = 'hop' | 'sway' | 'walk' | 'still'
export type LoopPlan = { walkers: string[]; chipPulse: boolean; ring: string | null; mascot: Mascot; count: number }
export type Settle = { from: number; to: number }
export type ImageProps = { source: string; alt: string; width: number; height: number; press?: string; hover?: boolean }

export type SavvyRun = { /* the fields of savvy's AgentRun that clawpit reads */
  id: string; agentId?: string; type: string; description: string; model: string
  status: 'running' | 'done' | 'failed'; startedAt: number; endedAt?: number
  contextTokens: number; contextMax: number; costUsd: number
  stepDone?: number; stepTotal?: number; stepNote?: string
  failedAttempts?: number; blocked?: string; heldDone?: boolean
  failNote?: string; failLine?: string }
export type SavvyFlow = { title: string; total: number; done: number; phase: 'plan' | 'design' | 'delegate' | 'review' | 'close'; isFinished: boolean; tasks: { title: string }[] }

declare module 'claude-code' {
  interface PluginState {
    clawpit: { takeover: boolean; stats: Stats; ui: Ui; tick: number; idleSince: number | null }
    'savvy-progress': { flow: SavvyFlow | null; agents: SavvyRun[] }
  }
}
