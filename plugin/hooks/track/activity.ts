import type { Activity } from '../../types'

export type ToolEvent = { tool: string; agentId?: string; input: Record<string, unknown>; result?: unknown; isError?: boolean; at: number }
export type Facts = { activity: Record<string, Activity>; files: Record<string, string[]>; lines: { added: number; removed: number } }  // key '' is the main loop

// Stands in for oneLine and clip until the kit is wired in.
export const clean = (v: unknown, max: number): string =>
  (typeof v === 'string' ? v : '').replace(/[\t\n\r\f\v]/g, ' ').replace(/[\u0000-\u001f\u007f-\u009f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

export const emptyFacts = (): Facts => ({ activity: {}, files: {}, lines: { added: 0, removed: 0 } })

const EDITS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
export const isEdit = (tool: string): boolean => EDITS.includes(tool)

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const tail2 = (p: string) => p.split('/').filter(Boolean).slice(-2).join('/')

export const linesOf = (tool: string, result: unknown): { added: number; removed: number } => {
  const r = rec(result), none = { added: 0, removed: 0 }
  if (r.staged === true || !['Edit', 'MultiEdit', 'Write'].includes(tool)) return none
  if (tool === 'Write' && r.type === 'create') {
    const adds = rec(r.gitDiff).additions
    if (typeof adds === 'number') return { added: adds, removed: 0 }
    return { added: typeof r.content === 'string' && r.content ? r.content.split('\n').length - (r.content.endsWith('\n') ? 1 : 0) : 0, removed: 0 }
  }
  let added = 0, removed = 0
  if (Array.isArray(r.structuredPatch))
    for (const hunk of r.structuredPatch)
      for (const l of Array.isArray(rec(hunk).lines) ? (rec(hunk).lines as unknown[]) : [])
        if (typeof l === 'string') { if (l.startsWith('+')) added++; else if (l.startsWith('-')) removed++ }
  return { added, removed }
}

const describe = (tool: string, input: Record<string, unknown>, at: number): Activity & { path?: string } => {
  const path = clean(input.file_path ?? input.notebook_path, 300)
  const low = tool.toLowerCase()
  if (tool === 'Grep' || tool === 'Glob') {
    const where = clean(input.path, 80)
    return { kind: 'search', verb: 'Searching', target: `"${clean(input.pattern, 80)}"${where ? ` in ${where}` : ''}`, at }
  }
  if (tool === 'Read') return { kind: 'read', verb: 'Reading', target: tail2(path), at, path }
  if (isEdit(tool)) return { kind: 'edit', verb: 'Editing', target: tail2(path), at, path }
  if (tool === 'Bash') return { kind: 'run', verb: 'Running', target: clean(input.command, 40), at }
  if (tool === 'WebFetch' || tool === 'WebSearch' || low.includes('browser') || low.includes('chrome')) {
    let target = clean(input.query, 80)
    try { if (typeof input.url === 'string') target = new URL(input.url).host } catch { target = clean(input.url, 80) }
    return { kind: 'browse', verb: 'Browsing', target, at }
  }
  if (tool === 'Agent') return { kind: 'spawn', verb: 'Starting', target: clean(input.description, 80), at }
  return { kind: 'other', verb: clean(tool, 40), target: '', at }
}

export const onTool = (f: Facts, e: ToolEvent): Facts => {
  try {
    const { path, ...act } = describe(e.tool, rec(e.input), e.at)
    const key = e.agentId ?? ''
    const next: Facts = { ...f, activity: { ...f.activity, [key]: act } }
    if (path) next.files = { ...f.files, [key]: [...(f.files[key] ?? []).filter(p => p !== path), path].slice(-50) }
    if (!e.isError) {
      const l = linesOf(e.tool, e.result)
      next.lines = { added: f.lines.added + l.added, removed: f.lines.removed + l.removed }
    }
    return next
  } catch { return f }
}

export const onThink = (f: Facts, agentId: string | undefined, at: number): Facts =>
  ({ ...f, activity: { ...f.activity, [agentId ?? '']: { kind: 'think', verb: 'Thinking', target: '', at } } })
