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

// /clawpit-setup: one dialog per boolean or choice row.
import { questionsOf, writesOf } from '../hooks/setup'

const lead = (r: ConfigRow) => questionsOf([r]).asks[0]

test('setup: questionsOf puts the current value first, marked, and never offers unasked', () => {
  const q = lead(row({ key: 'savvy-progress.mode', value: 'ask', options: ['unasked', 'off', 'both', 'ask'] }))
  expect(q.labels).toEqual(['ask (current)', 'off', 'both'])
  expect(q.values).toEqual(['ask', 'off', 'both'])
  expect([q.header, q.question]).toEqual(['A setting', 'Turn this on?'])
})

test('setup: while unasked is current the off value leads', () => {
  const q = lead(row({ key: 'savvy-progress.sessionNeed', options: ['unasked', 'off', 'both', 'ask', 'tool'] }))
  expect(q.labels).toEqual(['off (current)', 'both', 'ask', 'tool'])
})

test('setup: a boolean reads On and Off, current first', () => {
  expect(lead(row({ key: 'clawpit.animations', kind: 'boolean', value: true, options: undefined })).labels).toEqual(['On (current)', 'Off'])
  const q = lead(row({ key: 'clawpit.animations', kind: 'boolean', value: false, options: undefined }))
  expect([q.labels, q.values]).toEqual([['Off (current)', 'On'], [false, true]])
})

test('setup: more than 4 values show the current and the next three, and name the row for /config', () => {
  const r = row({ key: 'clawpit.long', label: 'Long one', value: 'c', options: ['a', 'b', 'c', 'd', 'e', 'f'] })
  const { asks, more } = questionsOf([r])
  expect(asks[0].values).toEqual(['c', 'd', 'e', 'f'])
  expect(more).toEqual(['Long one'])
})

test('setup: text, number and list rows are skipped and counted; locked, developer and foreign rows are not', () => {
  const r = questionsOf([
    row({ key: 'savvy-progress.stages', kind: 'text', value: ['a=b'] }), row({ key: 'clawpit.n', kind: 'number', value: 3 }),
    row({ key: 'clawpit.bench', kind: 'boolean', value: false }), row({ key: 'clawpit.locked', isLocked: true }),
    row({ key: 'other.x', kind: 'text' }), row({ key: 'clawpit.one', options: ['unasked', 'off'] }),
    row({ key: 'clawpit.ok', kind: 'boolean', value: true }),
  ])
  expect([r.asks.map(a => a.key), r.skipped]).toEqual([['clawpit.ok'], 2])
})

test('setup: writesOf drops unchanged answers and puts savvy keys before clawpit keys', () => {
  expect(writesOf([
    { key: 'clawpit.a', value: 'x', was: 'y' }, { key: 'savvy-progress.b', value: 'x', was: 'x' },
    { key: 'savvy-progress.c', value: true, was: false }, { key: 'clawpit.d', value: 1, was: 2 }, { key: 'savvy-progress.e', value: 'q', was: 'unasked' },
  ])).toEqual([{ key: 'savvy-progress.c', value: true }, { key: 'savvy-progress.e', value: 'q' }, { key: 'clawpit.a', value: 'x' }, { key: 'clawpit.d', value: 1 }])
})
