import type { TestStat } from 'claude-code'

const RUNNER = /\b(vitest|jest|pytest|playwright|mocha|ava|go test|cargo test|mvn\b.*\btest|gradle\b.*\btest|(npm|pnpm|yarn|bun)( run)? test|claude plugin test)\b/

// The last match of `re` in the first stream that has one.
const last = (re: RegExp, streams: string[]): RegExpMatchArray | null => {
  for (const s of streams) { const all = [...s.matchAll(new RegExp(re, 'gi'))]; if (all.length) return all[all.length - 1] }
  return null
}

export const parseTests = (command: string, stdout: string, stderr: string, at: number): TestStat | null => {
  if (!RUNNER.test(command)) return null
  const out = [stdout, stderr]
  const mvn = last(/Tests run:\s*(\d+),\s*Failures:\s*(\d+),\s*Errors:\s*(\d+)/, out)
  if (mvn) { const failed = +mvn[2] + +mvn[3]; return { passed: +mvn[1] - failed, failed, at } }
  const pass = last(/(\d+)\s+pass(?:ed|ing)?\b/, out), fail = last(/(\d+)\s+fail(?:ed|ing|ures?)?\b/, out)
  return pass || fail ? { passed: pass ? +pass[1] : 0, failed: fail ? +fail[1] : 0, at } : null
}
