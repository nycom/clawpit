// Test-only: panel views built from the named fixture states, shared by the unit tests and the visual suite.
import type { SavvyRun, Settle } from '../types'
import { crewOf } from '../hooks/model'
import { pickLoops } from '../hooks/loops'
import { settle } from '../hooks/panel/fold'
import type { PanelView } from '../hooks/panel/draw'
import { ETA, NOW, STATES, USUALLY, type StateName } from './fixtures/states'

export const viewOf = (state: StateName, over: Partial<PanelView> = {}): PanelView => {
  const f = STATES[state], now = over.now ?? NOW, ui = over.ui ?? f.ui, busy = over.busy ?? f.busy, armed = over.armed ?? f.armed
  const crew = over.crew ?? crewOf({ ...f, etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now })
  const settles: Record<string, Settle> = {}
  if (f.stats.context) settles.context = settle(undefined, f.stats.context.pct, now)
  for (const l of f.stats.limits) settles[l.kind === 'five_hour' ? '5h' : '7d'] = settle(undefined, l.pct, now)
  return { stats: f.stats, crew, ui, loops: pickLoops(crew, ui, busy, armed), busy, armed, bodyColumns: 96, now, settles, ...over }
}

// The panel's own looping drawings: walkers among top-level chips (full size), the alert pulse, a moving folded crab.
export const panelLoopCount = (v: PanelView): number =>
  (v.ui.size === 'full' ? v.loops.walkers.filter(id => v.crew.agents.some(a => a.id === id)).length : 0)
  + (v.loops.chipPulse ? 1 : 0) + (v.loops.mascot !== 'still' ? 1 : 0)
