import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]

const T0 = Date.UTC(2026, 10, 23, 12, 0, 0)

// The engine beneath clawpit, with savvy-progress's /agents-info handler standing in beneath it.
const setup = (on: OnT, surfaces: string[]) => {
  mock.clock(on, { now: T0 })
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('store.keys', () => ({ value: [] }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }))
  on('session.surfaces', () => ({ value: surfaces as never }))
  on('session.usage', () => ({ value: { startedAt: T0, context: { window: 200_000 }, rateLimits: [], cost: { usd: 0 } } as never }))
  const opens: string[] = []
  on('ui.open', (_$, e) => { opens.push(e.id); return { value: { isPlaced: true } } })
  const savvy: string[] = []
  on('command.run', { command: 'agents-info' }, (_$, e) => { savvy.push(e.args); return { text: 'savvy' } })
  return { opens, savvy }
}
const run = ($: $T, args: string) => $.command.run({ command: 'agents-info', args })

test('on the desktop /agents-info opens the clawpit pane and savvy never sees it', async ($, on) => {
  const w = setup(on, ['desktop'])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await run($, '')).text).toBe('opened')
  expect((await run($, ' open ')).text).toBe('opened')
  expect(w.opens.filter(id => id === 'clawpit-agents').length).toBe(2)
  expect(w.savvy).toEqual([])
})

test('/agents-info savvy opens savvy\'s own pane, through savvy', async ($, on) => {
  const w = setup(on, ['desktop', 'terminal'])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await run($, 'savvy')).text).toBe('savvy')
  expect(w.savvy).toEqual(['open'])
  expect(w.opens).not.toContain('clawpit-agents')
})

test('other arguments, and sessions with no desktop attached, pass through unchanged', async ($, on) => {
  const w = setup(on, ['desktop'])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'close')
  expect(w.savvy).toEqual(['close'])
})

for (const surfaces of [['terminal'], ['vscode'], ['mobile'], []])
  test(`no desktop surface (${surfaces.join(',') || 'none'}): /agents-info is savvy's`, async ($, on) => {
    const w = setup(on, surfaces)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect((await run($, '')).text).toBe('savvy')
    expect(w.savvy).toEqual([''])
    expect(w.opens).not.toContain('clawpit-agents')
  })
