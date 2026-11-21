import type { TestStat } from '../../types'
import { clip, oneLine } from '../text'

const RUNNER = /\b(vitest|jest|pytest|playwright|mocha|ava|go test|cargo test|mvn\b.*\btest|gradle\b.*\btest|(npm|pnpm|yarn|bun)( run)? test|claude plugin test)\b/

// The last match of `re` in the first stream that has one.
const last = (re: RegExp, streams: string[]): RegExpMatchArray | null => {
  for (const s of streams) { const all = [...s.matchAll(new RegExp(re, 'gi'))]; if (all.length) return all[all.length - 1] }
  return null
}

// One failing test per line: bun and `claude plugin test`, node:test, pytest, jest and vitest, playwright (the part after the last ›).
const TIME = String.raw`(?:\s+[[(][\d.]+\s*m?s[\])])?\s*$`
const FAILED = [
  new RegExp(String.raw`^\s*\(fail\)\s+(.+?)${TIME}`),
  new RegExp(String.raw`^\s*✖\s+(?!failing tests:)(.+?)${TIME}`),
  /^FAILED\s+(\S+)/,
  new RegExp(String.raw`^\s*[✕×]\s+(.+?)${TIME}`),
  new RegExp(String.raw`^\s*✘\s.*›\s*(.+?)${TIME}`),
]
const NAMES_MAX = 5, NAME_MAX = 80
const failedNames = (streams: string[]): string[] => {
  const out: string[] = []
  for (const line of streams.join('\n').split('\n')) {
    const m = FAILED.map(re => line.match(re)).find(Boolean), name = m ? clip(oneLine(m[1]), NAME_MAX) : ''
    if (name && !out.includes(name)) out.push(name)
    if (out.length === NAMES_MAX) break
  }
  return out
}

export const parseTests = (command: string, stdout: string, stderr: string, at: number): TestStat | null => {
  if (!RUNNER.test(command)) return null
  const out = [stdout, stderr]
  const named = (t: TestStat): TestStat => { const names = t.failed ? failedNames(out) : []; return names.length ? { ...t, failedNames: names } : t }
  const mvn = last(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/, out)
  if (mvn) { const failed = +mvn[2] + +mvn[3]; return named({ passed: +mvn[1] - failed, failed, at }) }
  // node:test prints the word first: 'ℹ pass 3'.
  const pass = last(/(\d+)\s+pass(?:ed|ing)?\b|ℹ pass (\d+)/, out), fail = last(/(\d+)\s+fail(?:ed|ing|ures?)?\b|ℹ fail (\d+)/, out)
  const n = (m: RegExpMatchArray | null) => (m ? +(m[1] ?? m[2]) : 0)
  return pass || fail ? named({ passed: n(pass), failed: n(fail), at }) : null
}
