import { test, expect } from 'claude-code/testing'
import type { ConfigRow } from 'claude-code'
import { OFFER_FROM, offersOf } from '../hooks/setup'

const row = (o: Partial<ConfigRow> & { key: string }): ConfigRow => ({
  label: 'A setting', description: 'Turn this on?', kind: 'choice', value: 'unasked', options: ['unasked', 'off', 'on', 'more'],
  provider: { plugin: o.key.split('.')[0], tier: 'user' }, isLocked: false, ...o,
})

test('setup: offersOf takes unasked choice rows from clawpit and savvy-progress, in the menu order', () => {
  expect(OFFER_FROM).toEqual(['clawpit', 'savvy-progress'])
  const rows = [row({ key: 'savvy-progress.first' }), row({ key: 'other.field' }), row({ key: 'clawpit.second', label: 'Second', description: 'Second one?' })]
  expect(offersOf(rows)).toEqual([
    { key: 'savvy-progress.first', label: 'A setting', question: 'Turn this on?', yes: 'on', no: 'off', more: 1 },
    { key: 'clawpit.second', label: 'Second', question: 'Second one?', yes: 'on', no: 'off', more: 0 },
  ])
})

test('setup: offersOf maps No to the option after unasked and Yes to the next one', () => {
  const [o] = offersOf([row({ key: 'savvy-progress.sessionNeed', options: ['unasked', 'off', 'both', 'ask', 'tool'] })])
  expect([o.no, o.yes]).toEqual(['off', 'both'])
})

test('setup: offersOf skips answered, locked, non-choice and question-less rows, and rows with no yes value', () => {
  expect(offersOf([
    row({ key: 'clawpit.answered', value: 'off' }),
    row({ key: 'clawpit.locked', isLocked: true }),
    row({ key: 'clawpit.toggle', kind: 'boolean', value: false, options: undefined }),
    row({ key: 'clawpit.text', kind: 'text' }),
    row({ key: 'clawpit.blank', description: undefined }),
    row({ key: 'clawpit.short', options: ['unasked', 'off'] }),
  ])).toEqual([])
})

test('setup: a field without unasked (an older savvy) and a list with no savvy rows yield nothing', () => {
  expect(offersOf([row({ key: 'savvy-progress.sessionNeed', value: 'off', options: ['off', 'both', 'ask', 'tool'] })])).toEqual([])
  expect(offersOf([row({ key: 'savvy-progress.odd', value: 'unasked', options: ['off', 'unasked', 'on'] })])).toEqual([])
  expect(offersOf([row({ key: 'theme', provider: { plugin: 'engine', tier: 'core' } })])).toEqual([])
  expect(offersOf([])).toEqual([])
})
