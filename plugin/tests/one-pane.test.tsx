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
  // Both kinds of event in the order they happened, for tests that check which came first.
  const log: string[] = []
  on('ui.open', (_$, e) => { opens.push(e.id); log.push(`open:${e.id}`); return { value: { isPlaced: true } } })
  const savvy: string[] = []
  // takeover as clawpit last wrote it, which savvy reads beneath clawpit, logged when the command reaches savvy.
  let takeover = false
  on('state.set', { plugin: 'clawpit', key: 'takeover' }, (_$, e, next) => { takeover = e.value === true; return next(e) })
  on('command.run', { command: 'agents-info' }, (_$, e) => {
    savvy.push(e.args)
    log.push(`savvy:${e.args.trim()}:takeover=${takeover}`)
    return { text: 'savvy' }
  })
  return { opens, savvy, log }
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

test('on the desktop any other argument passes through to savvy unchanged', async ($, on) => {
  const w = setup(on, ['desktop'])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await run($, 'toggle')
  expect(w.savvy).toEqual(['toggle'])
  expect(w.opens).not.toContain('clawpit-agents')
})

test('on the desktop /agents-info demo reaches savvy with takeover on, then opens the clawpit pane; demo stop opens nothing', async ($, on) => {
  const w = setup(on, ['desktop'])
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect((await run($, 'demo')).text).toBe('savvy')
  expect((await run($, ' demo fun ')).text).toBe('savvy')
  // Any case, as savvy lower-cases it.
  expect((await run($, 'DEMO')).text).toBe('savvy')
  await run($, 'demo stop')
  expect(w.log.filter(x => x.startsWith('savvy:') || x === 'open:clawpit-agents')).toEqual([
    'savvy:demo:takeover=true', 'open:clawpit-agents',
    'savvy:demo fun:takeover=true', 'open:clawpit-agents',
    'savvy:DEMO:takeover=true', 'open:clawpit-agents',
    'savvy:demo stop:takeover=true',
  ])
})

test('after a mid-session reload (no session start), the first /agents-info demo still reaches savvy with takeover on', async ($, on) => {
  const w = setup(on, ['desktop'])
  await run($, 'demo')
  expect(w.log.filter(x => x.startsWith('savvy:'))).toEqual(['savvy:demo:takeover=true'])
})

test('no desktop surface: /agents-info demo reaches savvy and opens no clawpit pane', async ($, on) => {
  const w = setup(on, ['terminal'])
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await run($, 'demo')
  expect(w.savvy).toEqual(['demo'])
  expect(w.opens).not.toContain('clawpit-agents')
})

for (const surfaces of [['terminal'], ['vscode'], ['mobile'], []])
  test(`no desktop surface (${surfaces.join(',') || 'none'}): /agents-info is savvy's`, async ($, on) => {
    const w = setup(on, surfaces)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect((await run($, '')).text).toBe('savvy')
    expect(w.savvy).toEqual([''])
    expect(w.opens).not.toContain('clawpit-agents')
  })
