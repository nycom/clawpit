// The crew: savvy-progress's runs plus clawpit's own trackers, as the rows and chips read them.
import type { Activity, ActivityKind, Crew, CrewAgent, CrewState, Eta, LogLine, Plan, PlanTask, Prop, Role, SavvyFlow, SavvyNeed, SavvyRun } from '../types'

export type CrewInput = { flow: SavvyFlow | null; runs: SavvyRun[]; parents: Record<string, string>; activity: Record<string, Activity>; logs: Record<string, LogLine[]>
  etaOf: (run: SavvyRun, elapsedMs: number) => Eta; usuallyOf: (run: SavvyRun) => number | null; now: number; need?: SavvyNeed | null }

const ROLE_OF_TYPE = new Map<string, Role>([['implementer', 'implement'], ['reviewer', 'review'], ['validator', 'test'], ['designer', 'design'], ['Plan', 'design'],
  ['architect-reviewer', 'design'], ['Explore', 'explore'], ['researcher', 'explore'], ['dev-researcher', 'explore']])
// One alternation per role, so the earliest word in the description decides.
const ROLE_WORD = /(implement|fix|build|merge|wire)|(review|recheck|audit)|(test|validat|e2e|verify)|(design|plan|spec)/
const ROLE_OF_WORD: Role[] = ['implement', 'review', 'test', 'design']

export const roleOf = (type: string, description: string): Role => {
  const byType = ROLE_OF_TYPE.get(type.replace(/^[^:]*:/, '')) ?? (type.endsWith('code-reviewer') ? 'review' : undefined)
  if (byType) return byType
  const m = ROLE_WORD.exec(description.toLowerCase())
  return m ? ROLE_OF_WORD[m.slice(1).findIndex(Boolean)] : 'explore'
}

const PROP_OF: Partial<Record<ActivityKind, Prop>> = { search: 'search', browse: 'search', read: 'read', edit: 'write', think: 'think' }

// savvy keeps failedAttempts until a step moves done on, so an ended run that still has some ended on a failed step.
const endedFailed = (r: SavvyRun) => r.status === 'failed' || (r.status === 'done' && (r.failedAttempts ?? 0) > 0)

const stateOf = (r: SavvyRun): CrewState =>
  r.blocked && r.status === 'running' ? 'need' : endedFailed(r) && r.heldDone ? 'failed' : r.status === 'running' ? 'running' : 'ended'

const propOf = (state: CrewState, r: SavvyRun, activity: Activity | null): Prop =>
  state === 'need' ? 'wait' : endedFailed(r) ? 'fail' : r.status === 'done' ? 'done' : (activity && PROP_OF[activity.kind]) ?? 'none'

const agentOf = (i: CrewInput, r: SavvyRun): CrewAgent => {
  const state = stateOf(r)
  const tries = r.failedAttempts ?? 0
  const activity = i.activity[r.id] ?? null
  const log = i.logs[r.id] ?? []
  const asks = log.filter(l => l.kind === 'ask').map(l => l.at)
  return {
    id: r.id, title: r.description, role: roleOf(r.type, r.description), model: r.model, effort: r.effort,
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

// Another plugin's atom: only a well-formed need counts.
export const needOf = (n: SavvyNeed | null | undefined): { question: string; since: number } | null =>
  n && typeof n.text === 'string' && Number.isFinite(n.since) ? { question: n.text, since: n.since } : null

export const crewOf = (i: CrewInput): Crew => {
  const byId = new Map(i.runs.map(r => [r.id, agentOf(i, r)]))
  const all = [...byId.values()]
  const top: CrewAgent[] = []
  const liveParent = (a: CrewAgent) => { const p = Object.hasOwn(i.parents, a.id) ? byId.get(i.parents[a.id]) : undefined; return isLive(p) ? p : undefined }
  for (const a of all) {
    // The pane draws two levels of helpers, so a parent nested two deep does not take children.
    const parent = liveParent(a), grand = parent && liveParent(parent)
    if (parent && !(grand && liveParent(grand))) { a.parentId = parent.id; parent.helpers.push(a) } else top.push(a)
  }
  for (const a of all) a.helpers.sort(order)
  top.sort(order)
  const agents = top.filter(a => a.state !== 'ended')
  const ended = top.filter(a => a.state === 'ended')
  const count = (s: CrewState) => agents.filter(a => a.state === s).length
  const minutes = all.flatMap(a => (a.state === 'running' && a.eta.kind === 'left' ? [a.eta.minutes] : []))
  const plan = planOf(i.flow, all)
  const need = needOf(i.need)
  return {
    title: plan ? plan.title : 'Subagents', agents, ended,
    counts: { need: count('need'), failed: count('failed'), running: count('running'), done: ended.length },
    costUsd: all.reduce((sum, a) => sum + a.costUsd, 0), leftMin: minutes.length ? Math.max(...minutes) : null, plan,
    ...(need ? { sessionNeed: need } : {}),
  }
}

// Every helper under an agent, nested ones included, in pane order.
export const helpersOf = (a: CrewAgent): CrewAgent[] => (a.helpers ?? []).flatMap(h => [h, ...helpersOf(h)])

// Needs you and failed over the agents, their helpers and the main session: a helper that waits on you needs you as much as its parent would.
export const alertsOf = (crew: Crew): { need: number; failed: number } => {
  const hs = crew.agents.flatMap(helpersOf)
  return { need: crew.counts.need + hs.filter(h => h.state === 'need').length + (crew.sessionNeed ? 1 : 0), failed: crew.counts.failed + hs.filter(h => h.state === 'failed').length }
}

// Whether the main session's need goes before an agent that has waited since `since` (none: undefined). A tie goes to the session.
export const sessionFirst = (crew: Crew, since?: number): boolean => !!crew.sessionNeed && !(since !== undefined && since < crew.sessionNeed.since)

// savvy-progress's own normalisation, so a task matches the runs savvy matched it to.
const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

// savvy's titleOf: of several titles that fit, the longest wins, so "kit-pr2 review" is kit-pr2's and not kit's.
const titleOf = (titles: string[], description: string): string | undefined => {
  const d = norm(description)
  return titles.filter(t => d === t || d.startsWith(`${t} `)).sort((a, b) => b.length - a.length)[0]
}

// A ticked task is done; a run only marks its own task live, waiting or failed. A finished run the session has not
// accepted yet reads as live with a full bar: there is no awaiting-review state to tick.
const taskOf = (name: string, accepted: boolean, a: CrewAgent | undefined): PlanTask => {
  if (accepted) return { name, state: 'done', fill: 1 }
  if (!a) return { name, state: 'todo', fill: 0 }
  const state = a.state === 'need' ? 'need' : a.prop === 'fail' ? 'failed' : 'live'
  const progress = Math.max(0.08, a.stepTotal ? a.stepDone / a.stepTotal : 0)
  return { name, state, role: a.role, fill: a.state === 'running' || a.state === 'need' ? progress : 1 }
}

// The session's count ticks, never more: first the tasks savvy names done, then plan order past tasks whose run is
// running, waiting or held failed, then the earliest left.
export const planOf = (flow: SavvyFlow | null, agents: CrewAgent[]): Plan | null => {
  if (!flow || flow.isFinished) return null
  const titles = flow.tasks.map(t => norm(t.title)), named = new Set((flow.doneTitles ?? []).map(norm))
  const runs = titles.map(t => agents.filter(x => titleOf(titles, x.title) === t).sort((x, y) => y.startedAt - x.startedAt)[0])
  const ticked = titles.map(() => false)
  let left = flow.done
  const tick = (ok: (i: number) => boolean) => titles.forEach((_, i) => { if (left > 0 && !ticked[i] && ok(i)) { ticked[i] = true; left-- } })
  tick(i => named.has(titles[i])); tick(i => !runs[i] || runs[i].state === 'ended'); tick(() => true)
  const tasks = flow.tasks.map((t, i) => taskOf(t.title, ticked[i], runs[i]))
  return { title: flow.title, phase: flow.phase === 'design' ? 'plan' : flow.phase, done: flow.done, total: flow.total, tasks }
}
