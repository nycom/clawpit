// The pixel crab, rect for rect as drawn in design/mockups-all.html. Pure: returns a whole <svg> string.
import type { CrabSize, Prop, Role } from '../types'
import { svg } from './tokens'

const K = { S: 0.75, M: 1, L: 1.5 } as const
const rect = (x: number, y: number, w: number, h: number, c: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${c}"/>`
const fixed = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`

const costume = (role: Role): string => {
  const R = `role-${role}`
  switch (role) {
    case 'implement': return rect(7, 7, 16, 3, R) + rect(9, 6, 12, 1, R)
    case 'review': return `<rect x="8.5" y="11.5" width="4" height="3" fill="none" class="s-${R}"/><rect x="17.5" y="11.5" width="4" height="3" fill="none" class="s-${R}"/>` + rect(12, 12, 6, 1, R)
    case 'design': return rect(6, 8, 14, 2, R) + rect(9, 7, 8, 1, R) + rect(19, 6, 1, 2, R)
    case 'explore': return rect(7, 8, 16, 2, R) + rect(4, 9, 3, 1, R) + rect(3, 10, 2, 1, R)
    case 'test': return rect(7, 8, 16, 2, R)
  }
}

const propArt = (prop: Prop, onRed: boolean): string => {
  switch (prop) {
    case 'search': return '<circle cx="29" cy="9" r="3" fill="#a8cbff" stroke="#2b4fa8" stroke-width="1.4"/>' + fixed(25, 12, 2, 2, '#6b4a2e')
    case 'read': return fixed(26, 4, 6, 8, '#fffdf5') + fixed(27, 6, 4, 1, '#f3c33f') + fixed(27, 8, 3, 1, '#cfc6ae') + fixed(27, 10, 4, 1, '#cfc6ae')
    case 'write': return fixed(26, 3, 7, 9, '#2b4aa8') + fixed(27, 5, 4, 1, '#4ade80') + fixed(28, 7, 4, 1, '#4ade80') + fixed(27, 9, 2, 1, '#4ade80')
    case 'think': return fixed(26, 3, 6, 1, '#3b6fd8') + fixed(27, 4, 4, 2, '#f3c33f') + fixed(28, 6, 2, 2, '#f3c33f') + fixed(27, 8, 4, 2, '#a8cbff') + fixed(26, 10, 6, 1, '#3b6fd8')
    case 'wait': return `<rect x="24" y="0" width="10" height="8" rx="2"${onRed ? ' fill="#fff"' : ' class="red"'}/><text x="29" y="6.6" font-size="7" font-weight="700" text-anchor="middle" font-family="system-ui"${onRed ? ' class="red"' : ' fill="#fff"'}>?</text>`
    default: return ''
  }
}

// `still` drops the flag's one-shot wave (the animations setting off).
const flag = (still: boolean) => `<rect x="24" y="5" width="1" height="10" class="crab"/><g${still ? '' : ' class="flag"'}><rect x="25" y="5" width="8" height="5" fill="#fff"/>`
  + [[25, 5], [29, 5], [27, 6], [31, 6], [25, 7], [29, 7]].map(([x, y]) => fixed(x, y, 2, 1, '#111')).join('') + '</g>'

export const crab = (o: { role: Role; prop: Prop; walk: boolean; size: CrabSize; onRed?: boolean; move?: 'hop' | 'sway'; still?: boolean }): string => {
  const { role, prop, walk, size, onRed = false, move, still = false } = o, k = K[size]
  let body = rect(7, 10, 16, 12, 'crab') + rect(3, 14, 4, 4, 'crab') + rect(23, prop === 'wait' ? 8 : 14, 4, 4, 'crab') + (prop === 'wait' ? rect(24, 12, 2, 2, 'crab') : '')
  body += prop === 'fail'
    ? rect(9, 12, 2, 1, 'crabInk') + rect(10, 13, 1, 1, 'crabInk') + rect(19, 12, 2, 1, 'crabInk') + rect(20, 13, 1, 1, 'crabInk')
    : rect(9, 12, 2, 2, 'crabInk') + rect(19, 12, 2, 2, 'crabInk')
  body += costume(role)
  const leg = (c: string, xs: number[]) => `<g${walk ? ` class="${c}"` : ''}>${xs.map(x => rect(x, 22, 2, 4, 'crab')).join('')}</g>`
  const inner = `<g${walk ? ' class="bd"' : ''}>${body}</g>${leg('la', [7, 17])}${leg('lb', [11, 21])}<g${walk ? ' class="pr"' : ''}>${propArt(prop, onRed)}</g>${prop === 'done' ? flag(still) : ''}`
  const pad = move ? 3 : 0
  const art = `<g shape-rendering="crispEdges" transform="translate(${pad} ${pad}) scale(${k})">${inner}</g>`
  return svg(34 * k + 2 * pad, 28 * k + 2 * pad, move ? `<g class="${move}">${art}</g>` : art, walk || !!move || (prop === 'done' && !still))
}
