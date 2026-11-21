import { test, expect, mock } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

type $T = Parameters<TestBody>[0]
type OnT = Parameters<TestBody>[1]
type Node = { type: string; key?: string; props: Record<string, unknown> }

const PANE = 'clawpit-agents'
const ON = { options: { bench: true } }
const PANE_PROPS = { title: 'Agents', isFocused: false, bodyColumns: 64, placement: 'dock' }

// The engine beneath clawpit, with a record of every command registered.
const setup = (on: OnT) => {
  mock.clock(on, { now: Date.UTC(2026, 10, 21, 12, 0, 0) })
  mock.store(on)
  const registered: string[] = []
  on('command.register', (_$, e) => { registered.push(e.name); return { value: { command: e.name } } })
  on('command.run', () => ({ text: 'no such command' }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }))
  on('session.surfaces', () => ({ value: ['desktop'] as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } as never }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }) as never)
  on('ui.render', (h, e) => h.ui.resolve(e).Box({ key: 'beneath', children: [] }))
  return { registered }
}

const start = ($: $T) => $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
const bench = ($: $T, args: string) => $.command.run({ command: 'clawpit-bench', args })
const clients = async ($: $T) => {
  const ui = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'Pane', requestId: PANE, props: PANE_PROPS as never })
  const all = (await ui.findAll({})) as unknown as Node[]
  await ui.unmount()
  return { all, crabs: all.filter(n => n.type === 'Client').map(n => n.props.props as { source: string; width: number; height: number }) }
}

test('bench: the command is not registered by default', async ($, on) => {
  const { registered } = setup(on)
  await start($)
  expect(registered).not.toContain('clawpit-bench')
  await bench($, '12')
  expect((await clients($)).crabs).toHaveLength(0)
})

test('bench: with the bench setting on, n crabs are drawn as n looping clients', ON, async ($, on) => {
  const { registered } = setup(on)
  await start($)
  expect(registered).toContain('clawpit-bench')
  await bench($, '12')
  const { crabs } = await clients($)
  expect(crabs).toHaveLength(12)
  for (const c of crabs) { expect(c.source).toContain('steps(1)'); expect(c.source).toContain('infinite'); expect(c.source).not.toMatch(/ease/) }
})

test('bench: 0 restores the normal pane', ON, async ($, on) => {
  setup(on)
  await start($)
  const before = (await clients($)).all
  await bench($, '12')
  expect((await clients($)).crabs).toHaveLength(12)
  await bench($, '0')
  const after = await clients($)
  expect(after.crabs).toHaveLength(0)
  expect(after.all).toEqual(before)
})

test('bench: eased swaps the walk for an eased loop of the same size', ON, async ($, on) => {
  setup(on)
  await start($)
  await bench($, '3')
  const stepped = (await clients($)).crabs
  await bench($, '3 eased')
  const eased = (await clients($)).crabs
  expect(eased).toHaveLength(3)
  for (const [i, c] of eased.entries()) {
    expect(c.source).toMatch(/ease-in-out infinite/); expect(c.source).not.toContain('steps(')
    expect([c.width, c.height]).toEqual([stepped[i].width, stepped[i].height])
  }
})

test('bench: after /reload-plugins, with no session.start, the panel\'s first draw registers the command', ON, async ($, on) => {
  const { registered } = setup(on)
  const ui = await $.ui.mount({ plugin: 'clawpit', surface: 'desktop', component: 'AbovePrompt', props: { bodyColumns: 120, hasSurvey: false, maxRows: 5 } as never })
  await ui.unmount()
  expect(registered).toEqual(['clawpit-bench'])
})
