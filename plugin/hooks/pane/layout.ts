// What the Agents pane draws, top to bottom, cut to the host's and the engine's size bounds.
import type { Crew, CrewAgent, LoopPlan, Ui } from '../../types'

type SectionName = 'need' | 'failed' | 'running' | 'ended'
export type PaneItem =
  | { kind: 'head'; crew: Crew }
  | { kind: 'section'; name: SectionName; count: number; shut?: boolean }
  | { kind: 'row'; agent: CrewAgent; walk: boolean; ring: boolean; open: boolean }
  | { kind: 'drawer'; agent: CrewAgent }
  | { kind: 'helper'; agent: CrewAgent; walk: boolean }
  | { kind: 'kids'; parentId: string; count: number; failed: number; shut: boolean }
  | { kind: 'ended'; agent: CrewAgent }
  | { kind: 'more'; section: SectionName; count: number }
  | { kind: 'empty' }

// The desktop drops a pane past 262,144 characters of JSON and the engine blanks Clients past 100,000; both with margin.
export const HOST_MAX = 200_000, ENGINE_MAX = 90_000

type Size = { host: number; engine: number }
// `agents`: how many agents the item shows, counted into `+N more` when it is cut.
type Part = { item: PaneItem; fixed: boolean; agents: number }
type Group = { head: PaneItem; name: SectionName; count: number; body: Part[] }

export const paneLayout = (crew: Crew, ui: Ui, loops: LoopPlan, cost: (item: PaneItem) => Size): PaneItem[] => {
  if (!crew.agents.length && !crew.ended.length) return [{ kind: 'empty' }]
  const walk = (a: CrewAgent) => loops.walkers.includes(a.id)
  const rowParts = (a: CrewAgent): Part[] => {
    const shut = ui.shut.includes(a.id)
    return [
      { item: { kind: 'row', agent: a, walk: walk(a), ring: loops.ring === a.id, open: ui.open === a.id }, fixed: false, agents: 1 },
      ...(ui.open === a.id ? [{ item: { kind: 'drawer', agent: a } as PaneItem, fixed: true, agents: 0 }] : []),
      ...(shut ? [] : a.helpers.map(h => ({ item: { kind: 'helper', agent: h, walk: walk(h) } as PaneItem, fixed: false, agents: 1 }))),
      ...(a.helpers.length
        ? [{ item: { kind: 'kids', parentId: a.id, count: a.helpers.length, failed: a.helpers.filter(h => h.state === 'failed').length, shut } as PaneItem, fixed: false, agents: 0 }]
        : []),
    ]
  }
  const groups: Group[] = (['need', 'failed', 'running'] as const).flatMap(name => {
    const list = crew.agents.filter(a => a.state === name)
    return list.length ? [{ head: { kind: 'section', name, count: list.length } as PaneItem, name, count: list.length, body: list.flatMap(rowParts) }] : []
  })
  if (crew.ended.length) {
    const shut = ui.shut.includes('ended')
    groups.push({ head: { kind: 'section', name: 'ended', count: crew.ended.length, shut }, name: 'ended', count: crew.ended.length,
      body: shut ? [] : crew.ended.map(agent => ({ item: { kind: 'ended', agent }, fixed: false, agents: 1 })) })
  }

  const head: PaneItem = { kind: 'head', crew }
  // Fixed items and one `+N more` line per section are reserved first, so whatever is cut, the total stays in bounds.
  const reserved = [head, ...groups.flatMap(g => [g.head, { kind: 'more', section: g.name, count: g.count } as PaneItem,
    ...g.body.filter(p => p.fixed).map(p => p.item)])]
  let used = reserved.map(cost).reduce((a, c) => ({ host: a.host + c.host, engine: a.engine + c.engine }), { host: 0, engine: 0 })
  const out: PaneItem[] = [head]
  for (const g of groups) {
    out.push(g.head)
    let hidden = -1
    for (const p of g.body) {
      if (hidden >= 0) { hidden += p.agents; continue }
      if (p.fixed) { out.push(p.item); continue }
      const c = cost(p.item)
      if (used.host + c.host > HOST_MAX || used.engine + c.engine > ENGINE_MAX) { hidden = p.agents; continue }
      used = { host: used.host + c.host, engine: used.engine + c.engine }
      out.push(p.item)
    }
    if (hidden > 0) out.push({ kind: 'more', section: g.name, count: hidden })
  }
  return out
}
