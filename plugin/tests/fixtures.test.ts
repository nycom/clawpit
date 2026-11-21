import { test, expect } from 'claude-code/testing'
import { NOW, STATES } from './fixtures/states'

test('fixtures: every state is JSON-safe and names known fields only', () => {
  for (const s of Object.values(STATES)) {
    expect(JSON.parse(JSON.stringify(s))).toEqual(s)
    expect(s.runs.every(r => typeof r.id === 'string' && r.startedAt <= NOW)).toBe(true)
  }
  expect(STATES.hydra.runs.length).toBe(7); expect(STATES.manyAgents.runs.length).toBe(80)
})
