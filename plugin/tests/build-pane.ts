// Pane views from the named fixtures, for the unit tests and the visual suite.
import type { SavvyRun } from '../types'
import { crewOf } from '../hooks/model'
import { pickLoops } from '../hooks/loops'
import { paneLayout } from '../hooks/pane/layout'
import { itemCost, type PaneView } from '../hooks/pane/draw'
import { ETA, NOW, STATES, USUALLY, type StateName } from './fixtures/states'

export const paneViewOf = (state: StateName, over: Partial<PaneView> = {}): PaneView => {
  const f = STATES[state]
  const crew = crewOf({ ...f, etaOf: (r: SavvyRun) => ETA[r.id] ?? { kind: 'none' }, usuallyOf: (r: SavvyRun) => USUALLY[r.id] ?? null, now: NOW })
  const ui = over.ui ?? f.ui
  return { crew, ui, loops: pickLoops(crew, ui, f.busy, f.armed), columns: 52, now: NOW, ...over }
}

// The pane's own looping drawings: walkers with a row on screen, plus the ring.
export const paneLoopCount = (v: PaneView): number => {
  const items = paneLayout(v.crew, v.ui, v.loops, itemCost)
  return items.filter(i => (i.kind === 'row' || i.kind === 'helper') && i.walk).length + (items.some(i => i.kind === 'row' && i.ring) ? 1 : 0)
}
