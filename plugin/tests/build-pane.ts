// Pane views from the named fixtures, for the unit tests and the visual suite.
import type { SavvyRun } from '../types'
import { crewOf } from '../hooks/model'
import { pickLoops } from '../hooks/loops'
import { paneLayout } from '../hooks/pane/layout'
import { itemCost, type PaneView } from '../hooks/pane/draw'
import { offersOf } from '../hooks/setup'
import { ETA, NOW, STATES, USUALLY, type Fixture, type StateName } from './fixtures/states'

// Crews no named fixture shows, built from hydra's: k1 waits on you; k3 helps k1, one level deeper.
const hydra = STATES.hydra, k1 = hydra.runs.find(r => r.id === 'k1')!
export const EXTRA = {
  helperNeedsYou: { ...hydra, runs: hydra.runs.map(r => (r.id === 'k1' ? { ...r, blocked: 'Keep the old cache key for one release, or drop it now that every caller moved?' } : r)) },
  nestedHelper: { ...hydra, runs: [...hydra.runs, { ...k1, id: 'k3', agentId: 'k3', description: 'read the guard tests', startedAt: NOW - 30_000, stepDone: 1, stepTotal: 2 }],
    parents: { ...hydra.parents, k3: 'k1' }, activity: { ...hydra.activity, k3: { kind: 'read', verb: 'Reading', target: 'tests/guard.test.ts', at: NOW - 5_000 } } },
  // Ended unfolded, so its row (mark, time, model) has a picture.
  endedOpen: { ...hydra, ui: { ...hydra.ui, shut: [] } },
  // The pane on its costs view: the last 20 of 44 turns, newest last.
  costs: { ...hydra, ui: { ...hydra.ui, view: 'costs' },
    stats: { ...hydra.stats, session: { ...hydra.stats.session, turnCosts: [...Array.from({ length: 17 }, (_, i) => +(0.2 + i * 0.03).toFixed(2)), 0.85, 1.1, 2.46] } } },
} satisfies Record<string, Fixture>

export const paneViewOf = (state: StateName | keyof typeof EXTRA, over: Partial<PaneView> = {}): PaneView => {
  const f: Fixture = state in EXTRA ? EXTRA[state as keyof typeof EXTRA] : STATES[state as StateName]
  const crew = crewOf({ ...f, etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW })
  const ui = over.ui ?? f.ui
  return { crew, ui, loops: pickLoops(crew, ui, f.busy, f.armed), columns: 52, now: NOW, session: f.stats.session, offer: offersOf(f.config ?? [])[0] ?? null, ...over }
}

// The pane's own looping drawings: walkers with a row on screen, plus the ring (on an agent or the session).
export const paneLoopCount = (v: PaneView): number => {
  const items = paneLayout(v.crew, v.ui, v.loops, itemCost)
  return items.filter(i => (i.kind === 'row' || i.kind === 'helper') && i.walk).length + (items.some(i => (i.kind === 'row' || i.kind === 'session') && i.ring) ? 1 : 0)
}
