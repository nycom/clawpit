import type { Crew, CrewAgent, LoopPlan, Mascot, Ui } from '../types'
import { alertsOf, helpersOf } from './model'

export const BUDGET = { walkers: 3, walkersOnBeat: 2, max: 8 }

const newestFirst = (a: CrewAgent, b: CrewAgent) => b.startedAt - a.startedAt
const waited = (a: CrewAgent) => a.waitingSince ?? a.startedAt

export const pickLoops = (crew: Crew, ui: Ui, busy: boolean, armed: boolean): LoopPlan => {
  const { running } = crew.counts, { need, failed } = alertsOf(crew)
  const beat = need > 0 || (failed > 0 && armed)
  if (!(busy || running > 0 || need > 0) && !beat) return { walkers: [], chipPulse: false, ring: null, mascot: 'still', count: 0 }

  const tops = crew.agents.filter(a => a.state === 'running').sort(newestFirst)
  const helpers = crew.agents.filter(a => ui.paneOpen && !ui.shut.includes(a.id)).flatMap(helpersOf).filter(h => h.state === 'running').sort(newestFirst)
  const topIds = new Set(tops.map(a => a.id))
  let walkers = [...tops, ...helpers].slice(0, beat ? BUDGET.walkersOnBeat : BUDGET.walkers).map(a => a.id)

  const chipPulse = beat && ui.size === 'full'
  const waiters = crew.agents.filter(a => a.state === 'need').sort((a, b) => waited(a) - waited(b))
  const ring = ui.paneOpen && waiters.length ? waiters[0].id : null
  const mascot: Mascot = ui.size === 'full' ? 'still' : need > 0 ? 'hop' : failed > 0 ? (armed ? 'sway' : 'still') : walkers.length ? 'walk' : 'still'

  const count = (w: string[]) =>
    (ui.size === 'full' ? w.filter(id => topIds.has(id)).length : 0) + (ui.paneOpen ? w.length : 0) +
    (chipPulse ? 1 : 0) + (ring ? 1 : 0) + (mascot !== 'still' ? 1 : 0)
  while (walkers.length && count(walkers) > BUDGET.max) walkers = walkers.slice(0, -1)
  return { walkers, chipPulse, ring, mascot, count: count(walkers) }
}
