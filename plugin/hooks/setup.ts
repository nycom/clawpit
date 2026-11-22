// One-time setup: the `/config` rows worth asking about once. Pure: no host imports.
import type { ConfigRow } from 'claude-code'
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
