// The crew: savvy-progress's runs plus clawpit's own trackers, as the rows and chips read them.
import type { Activity, ActivityKind, Crew, CrewAgent, CrewState, Eta, LogLine, Plan, PlanTask, Prop, Role, SavvyFlow, SavvyRun } from '../types'

export type CrewInput = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>; logs: Record<string, LogLine[]>
  etaOf: (run: SavvyRun, elapsedMs: number) => Eta; usuallyOf: (run: SavvyRun) => number | null; now: number }

const ROLE_OF_TYPE = new Map<string, Role>([['implementer', 'implement'], ['reviewer', 'review'], ['validator', 'test'], ['designer', 'design'], ['Plan', 'design'],
  ['architect-reviewer', 'design'], ['Explore', 'explore'], ['researcher', 'explore'], ['dev-researcher', 'explore']])
// One alternation per role, so the earliest word in the description decides.
const ROLE_WORD = /(implement|fix|build|merge|wire)|(review|recheck|audit)|(test|validat|e2e|verify)|(design|plan|spec)/
const ROLE_OF_WORD: Role[] = ['implement', 'review', 'test', 'design']

export const roleOf = (type: string, description: string): Role => {
  const byType = ROLE_OF_TYPE.get(type) ?? (type.endsWith('code-reviewer') ? 'review' : undefined)
  if (byType) return byType
  const m = ROLE_WORD.exec(description.toLowerCase())
  return m ? ROLE_OF_WORD[m.slice(1).findIndex(Boolean)] : 'explore'
}

const PROP_OF: Partial<Record<ActivityKind, Prop>> = { search: 'search', browse: 'search', read: 'read', edit: 'write', think: 'think' }

const stateOf = (r: SavvyRun): CrewState =>
  r.blocked && r.status === 'running' ? 'need' : r.status === 'failed' && r.heldDone ? 'failed' : r.status === 'running' ? 'running' : 'ended'

const propOf = (state: CrewState, r: SavvyRun, activity: Activity | null): Prop =>
  state === 'need' ? 'wait' : r.status === 'failed' ? 'fail' : r.status === 'done' ? 'done' : (activity && PROP_OF[activity.kind]) ?? 'none'

const agentOf = (i: CrewInput, r: SavvyRun): CrewAgent => {
  const state = stateOf(r)
  const tries = r.failedAttempts ?? 0
  const activity = i.activity[r.id] ?? null
  const log = i.logs[r.id] ?? []
  const asks = log.filter(l => l.kind === 'ask').map(l => l.at)
  return {
    id: r.id, title: r.description, role: roleOf(r.type, r.description), model: r.model,
    state, struggling: state === 'running' && tries >= 3, tries,
    prop: propOf(state, r, activity), activity,
    question: r.blocked, reason: r.failNote, errorLine: r.failLine,
    stepDone: r.stepDone ?? 0, stepTotal: r.stepTotal ?? 0,
    eta: i.etaOf(r, (r.endedAt ?? Math.max(i.now, r.startedAt)) - r.startedAt), usuallyMin: i.usuallyOf(r),
    startedAt: r.startedAt, endedAt: r.endedAt,
    waitingSince: state === 'need' ? (asks.length ? Math.max(...asks) : r.startedAt) : undefined,
    contextPct: r.contextMax > 0 ? Math.round((r.contextTokens / r.contextMax) * 100) : 0,
    costUsd: r.costUsd, helpers: [], log,
  }
}

const RANK: Record<CrewState, number> = { need: 0, failed: 1, running: 2, ended: 3 }
const newest = (a: CrewAgent) => a.endedAt ?? a.startedAt
// need: longest waiting first; failed and ended: newest first; running: struggling first, then newest first.
const order = (a: CrewAgent, b: CrewAgent): number =>
  RANK[a.state] - RANK[b.state]
  || (a.state === 'need' ? a.waitingSince! - b.waitingSince!
    : a.state === 'running' ? Number(b.struggling) - Number(a.struggling) || b.startedAt - a.startedAt
    : newest(b) - newest(a))

const isLive = (a: CrewAgent | undefined) => a?.state === 'need' || a?.state === 'running'

export const crewOf = (i: CrewInput): Crew => {
  const byId = new Map(i.runs.map(r => [r.id, agentOf(i, r)]))
  const all = [...byId.values()]
  const top: CrewAgent[] = []
  for (const a of all) {
    const parent = Object.hasOwn(i.parents, a.id) ? byId.get(i.parents[a.id]) : undefined
    // The pane draws one level of helpers, so a parent that is itself nested does not take children.
    const grand = parent && Object.hasOwn(i.parents, parent.id) ? byId.get(i.parents[parent.id]) : undefined
    if (parent && isLive(parent) && !isLive(grand)) { a.parentId = parent.id; parent.helpers.push(a) } else top.push(a)
  }
  for (const a of all) a.helpers.sort(order)
  top.sort(order)
  const agents = top.filter(a => a.state !== 'ended')
  const ended = top.filter(a => a.state === 'ended')
  const count = (s: CrewState) => agents.filter(a => a.state === s).length
  const minutes = all.flatMap(a => (a.state === 'running' && a.eta.kind === 'left' ? [a.eta.minutes] : []))
  const plan = planOf(i.flow, all)
  return {
    title: plan ? plan.title : 'Subagents', agents, ended,
    counts: { need: count('need'), failed: count('failed'), running: count('running'), done: ended.length },
    costUsd: all.reduce((sum, a) => sum + a.costUsd, 0), leftMin: minutes.length ? Math.max(...minutes) : null, plan,
  }
}

// savvy-progress's own normalisation, so a task matches the runs savvy matched it to.
const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// savvy's titleOf: of several titles that fit, the longest wins, so "kit-pr2 review" is kit-pr2's and not kit's.
const titleOf = (titles: string[], description: string): string | undefined => {
  const d = norm(description)
  return titles.filter(t => d === t || d.startsWith(`${t} `)).sort((a, b) => b.length - a.length)[0]
}

const taskOf = (name: string, agents: CrewAgent[], titles: string[]): PlanTask => {
  const a = agents.filter(x => titleOf(titles, x.title) === norm(name)).sort((x, y) => y.startedAt - x.startedAt)[0]
  if (!a) return { name, state: 'todo', fill: 0 }
  const state = a.state === 'need' ? 'need' : a.state === 'running' ? 'live' : a.prop === 'fail' ? 'failed' : 'done'
  const progress = Math.max(0.08, a.stepTotal ? a.stepDone / a.stepTotal : 0)
  return { name, state, role: a.role, fill: state === 'live' || state === 'need' ? progress : 1 }
}

export const planOf = (flow: SavvyFlow | null, agents: CrewAgent[]): Plan | null => {
  if (!flow || flow.isFinished) return null
  const titles = flow.tasks.map(t => norm(t.title))
  const tasks = flow.tasks.map(t => taskOf(t.title, agents, titles))
  let short = flow.done - tasks.filter(t => t.state === 'done').length
  for (const t of tasks) if (short > 0 && t.state === 'todo') { t.state = 'done'; t.fill = 1; short-- }
  return { title: flow.title, phase: flow.phase === 'design' ? 'plan' : flow.phase, done: tasks.filter(t => t.state === 'done').length, total: flow.total, tasks }
}
