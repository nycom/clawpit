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
  id: string; title: string; role: Role; model: string; effort?: string
  state: CrewState; struggling: boolean; tries: number
  prop: Prop; activity: Activity | null
  question?: string; reason?: string; errorLine?: string
  stepDone: number; stepTotal: number
  eta: Eta; usuallyMin: number | null
  startedAt: number; endedAt?: number; waitingSince?: number
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
  sessionNeed?: { question: string; since: number }   // the main session waits on you; not an agent, so in no count but alertsOf's
}

export type ContextStat = { pct: number; msgsPct: number | null; turnsLeft: number | null; autoPct: number | null; alarm: boolean }
export type LimitStat = { kind: 'five_hour' | 'seven_day'; pct: number; pacePct: number | null; projected: number | null; ahead: boolean; hot: boolean }
export type TurnStat = { startedAt: number; added: number; removed: number; costUsd: number | null }
export type TestStat = { passed: number; failed: number; at: number; failedNames?: string[] }   // failedNames: up to 5, only when the run named any
export type CodeStat = { reusePct: number | null; reused: number; created: number; callers: string[] }   // from ponytail's band atom
export type SessionStat = { costUsd: number | null; lastTurnUsd: number | null; turns: number; tokens: number; agentMs: number; turnCosts?: number[] }   // turnCosts: the last 20 main turns, newest last
export type Stats = { context: ContextStat | null; limits: LimitStat[]; turn: TurnStat | null; tests: TestStat | null; session: SessionStat; code: CodeStat | null }

export type ColumnKey = 'context' | 'turn' | '5h' | '7d' | 'plan' | 'session' | 'tests' | 'tokens' | 'agent' | 'reuse' | 'callers' | 'agents'
export type Column = { key: ColumnKey; priority: number }
export type Ui = { size: Size; open: string | null; shut: string[]; paneOpen: boolean; view?: 'crew' | 'costs' }   // view: the pane's; absent is crew
export type Mascot = 'hop' | 'sway' | 'walk' | 'still'
export type LoopPlan = { walkers: string[]; chipPulse: boolean; ring: string | null; mascot: Mascot; count: number }   // ring: an agent id, or 'session'
export type Settle = { from: number; to: number; at: number }   // at: when the value moved, so the sweep runs once
export type ImageProps = { source: string; alt: string; width: number; height: number; press?: string; hover?: boolean; zones?: { to: number; press: string }[] }   // zones: presses by x, each up to `to` px

export type SavvyRun = { /* the fields of savvy's AgentRun that clawpit reads */
  id: string; agentId?: string; type: string; description: string; model: string; effort?: string
  status: 'running' | 'done' | 'failed'; startedAt: number; endedAt?: number
  contextTokens: number; contextMax: number; costUsd: number
  stepDone?: number; stepTotal?: number; stepNote?: string
  failedAttempts?: number; blocked?: string; heldDone?: boolean
  failNote?: string; failLine?: string }
/** The fields of ponytail's `band` atom that clawpit reads (ponytail 5.3.3 `hooks/band/types.d.ts`). */
export type PonytailBand = { reused: string[]; created: string[]; openCallers: string[] }
/** savvy's `need` atom: the main session waits on the person. */
export type SavvyNeed = { text: string; since: number }
export type SavvyFlow = { title: string; total: number; done: number; phase: 'plan' | 'design' | 'delegate' | 'review' | 'close'; isFinished: boolean; tasks: { title: string }[]
  doneTitles?: string[] }  // savvy's norm()-normalised titles of the tasks known done; older savvy leaves it out

declare module 'claude-code' {
  interface PluginState {
    clawpit: { takeover: boolean; stats: Stats; ui: Ui; tick: number; idleSince: number | null }
    'savvy-progress': { flow: SavvyFlow | null; agents: SavvyRun[]; need?: SavvyNeed | null; stages?: string[] }
    ponytail: { band: PonytailBand }
  }
}
