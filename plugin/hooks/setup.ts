// One-time setup: the `/config` rows worth asking about once. Pure: no host imports.
import type { ConfigRow, ConfigValue } from 'claude-code'
import type { Offer } from '../types'

// clawpit offers its own settings and savvy-progress's, never another plugin's.
export const OFFER_FROM = ['clawpit', 'savvy-progress']
// What a Yes costs beyond the setting's own words, by key: said in the Yes alt and the toast that confirms it.
export const OFFER_NOTE: Record<string, string> = {
  'savvy-progress.sessionNeed': 'This opts into about 40 schema tokens; the progress field takes effect from the next session.',
}

// A choice row still at `unasked` whose options read ["unasked", <no>, <yes>, …]; its description is the question.
export const offersOf = (rows: readonly ConfigRow[]): Offer[] => {
  const asked = rows.filter(r => OFFER_FROM.includes(r.provider.plugin) && r.kind === 'choice' && r.value === 'unasked' && !r.isLocked
    && r.options?.[0] === 'unasked' && r.options.length >= 3 && !!r.description)
  return asked.map((r, i) => ({ key: r.key, label: r.label, question: r.description!, yes: r.options![2], no: r.options![1], more: asked.length - 1 - i }))
}

// Developer settings /clawpit-setup does not ask about.
const SKIP = ['clawpit.bench']
// The most option buttons the engine's dialog takes.
const MAX_BUTTONS = 4

export type Question = { key: string; header: string; question: string; labels: string[]; values: ConfigValue[]; was: ConfigValue }
export type Answer = { key: string; value: ConfigValue; was: ConfigValue }

// The boolean and choice rows to ask, in menu order, with the current value first (unasked reads as the off value that follows it).
// `skipped` counts text, number and list rows; `more` names the rows with values the buttons cannot hold.
export const questionsOf = (rows: readonly ConfigRow[]): { asks: Question[]; skipped: number; more: string[] } => {
  const asks: Question[] = [], more: string[] = []
  let skipped = 0
  for (const r of rows) {
    if (!OFFER_FROM.includes(r.provider.plugin) || r.isLocked || SKIP.includes(r.key)) continue
    if (r.kind !== 'boolean' && r.kind !== 'choice') { skipped += 1; continue }
    const all: ConfigValue[] = r.kind === 'boolean' ? [true, false] : (r.options ?? []).filter(o => o !== 'unasked')
    if (all.length < 2) continue
    const i = Math.max(0, all.indexOf(r.value))
    const values = [...all.slice(i), ...all.slice(0, i)].slice(0, MAX_BUTTONS)
    if (all.length > MAX_BUTTONS) more.push(r.label)
    const name = (v: ConfigValue) => typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v)
    asks.push({ key: r.key, header: r.label.slice(0, 12), question: r.description ?? r.label, was: r.value, values,
      labels: values.map((v, n) => n ? name(v) : `${name(v)} (current)`) })
  }
  return { asks, skipped, more }
}

// The answers that change a value, savvy-progress's first and clawpit's own last (writing one of clawpit's reloads it).
export const writesOf = (answers: readonly Answer[]): { key: string; value: ConfigValue }[] => {
  const own = (a: Answer) => a.key.startsWith('clawpit.') ? 1 : 0
  return answers.filter(a => a.value !== a.was).sort((a, b) => own(a) - own(b)).map(({ key, value }) => ({ key, value }))
}
