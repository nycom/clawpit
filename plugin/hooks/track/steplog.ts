import type { LogLine, SavvyRun } from 'claude-code'
import { clean } from './activity'

export type Logs = Record<string, LogLine[]>  // by run id

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

export const diff = (logs: Logs, prev: SavvyRun[], next: SavvyRun[], parents: Record<string, string>, at: number): Logs => {
  const before = new Map(prev.map(r => [r.id, r]))
  const out: Logs = {}
  for (const r of next) out[r.id] = logs[r.id] ?? []
  const add = (id: string, kind: LogLine['kind'], text: string) => {
    if (out[id]) out[id] = [{ kind, text: clean(text, 200), at }, ...out[id]].slice(0, 30)
  }
  for (const r of next) {
    const p = before.get(r.id)
    const why = clean(r.failNote || r.stepNote, 160)
    const tail = why ? `: ${why}` : ''
    if (r.stepNote && r.stepNote !== p?.stepNote) add(r.id, 'step', r.stepNote)
    if ((r.failedAttempts ?? 0) > (p?.failedAttempts ?? 0)) add(r.id, 'try', `Try ${r.failedAttempts} failed${tail}`)
    if (r.blocked && r.blocked !== p?.blocked) add(r.id, 'ask', `Asked: ${r.blocked}`)
    if (r.status === 'failed' && p?.status !== 'failed') {
      const where = r.stepTotal ? ` at step ${(r.stepDone ?? 0) + 1} of ${r.stepTotal}` : ''
      add(r.id, 'fail', `Failed${where}${tail}`)
      const parent = parents[r.id]
      if (parent) add(parent, 'helper', `Helper "${clean(r.description, 60)}" failed after ${mmss((r.endedAt ?? at) - r.startedAt)}${tail}`)
    }
  }
  return out
}
