// Test-only: draws a plain RenderElement tree as an HTML page, approximating the desktop host (design §12).
import type { Page } from '@playwright/test'

export type Node = string | { type: string; props?: Record<string, unknown>; children?: Node[] }
type Opts = { surface: 'panel' | 'pane'; widthCells: number }

export const CELL_W = 9.2
export const ROW_H = 18.4

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function boxStyle(p: Record<string, unknown>): string {
  const css: string[] = ['display:flex', `flex-direction:${typeof p.flexDirection === 'string' ? p.flexDirection : 'row'}`, 'box-sizing:border-box', `position:${p.position === 'absolute' ? 'absolute' : 'relative'}`]
  const px = (prop: string, v: unknown, unit: number) => { const n = num(v); if (n !== undefined) css.push(`${prop}:${n * unit}px`) }
  px('left', p.left, CELL_W); px('right', p.right, CELL_W); px('top', p.top, ROW_H); px('bottom', p.bottom, ROW_H)
  px('width', p.width, CELL_W); px('height', p.height, ROW_H)
  px('min-width', p.minWidth, CELL_W)
  px('column-gap', p.gap ?? p.columnGap, CELL_W); px('row-gap', p.gap ?? p.rowGap, ROW_H / 2)
  px('padding-left', p.paddingLeft ?? p.paddingX ?? p.padding, CELL_W); px('padding-right', p.paddingRight ?? p.paddingX ?? p.padding, CELL_W)
  px('padding-top', p.paddingTop ?? p.paddingY ?? p.padding, ROW_H / 2); px('padding-bottom', p.paddingBottom ?? p.paddingY ?? p.padding, ROW_H / 2)
  px('margin-left', p.marginLeft, CELL_W); px('margin-top', p.marginTop, ROW_H / 2)
  if (num(p.flexGrow) !== undefined) css.push(`flex-grow:${p.flexGrow}`)
  if (num(p.flexShrink) !== undefined) css.push(`flex-shrink:${p.flexShrink}`)
  if (typeof p.alignItems === 'string') css.push(`align-items:${p.alignItems}`)
  if (typeof p.justifyContent === 'string') css.push(`justify-content:${p.justifyContent}`)
  if (typeof p.flexWrap === 'string') css.push(`flex-wrap:${p.flexWrap}`)
  if (typeof p.backgroundColor === 'string') css.push(`background-color:${p.backgroundColor}`)
  return css.join(';')
}

function image(p: Record<string, unknown>): string {
  const w = num(p.width) ?? 0, h = num(p.height) ?? 0
  const key = typeof p.key === 'string' ? ` data-key="${esc(p.key)}"` : ''
  return `<div data-svg${key} style="width:${w}px;height:${h}px;flex:none" aria-label="${esc(String(p.alt ?? ''))}"><template>${String(p.source ?? '')}</template></div>`
}

function html(n: Node): string {
  if (typeof n === 'string') return esc(n)
  if (!n || typeof n !== 'object') return ''
  const p = n.props ?? {}, kids = (n.children ?? []).map(html).join('')
  const key = typeof p.key === 'string' ? ` data-key="${esc(p.key)}"` : ''
  switch (n.type) {
    case 'Box': return `<div${key} style="${boxStyle(p)}">${kids}</div>`
    case 'Text': return `<span${key}>${kids}</span>`
    case 'Button': return `<button${key}>${esc(String(p.label ?? ''))}${kids}</button>`
    case 'Svg': return image(p)
    case 'Client': return image({ ...(p.props as Record<string, unknown> ?? {}), key: p.key })
    default: return kids
  }
}

export function pageOf(tree: Node, opts: Opts): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0}
body{background:#faf9f5;color:#1f1e1d;width:${opts.widthCells * CELL_W}px;font:12px -apple-system,BlinkMacSystemFont,system-ui,sans-serif}
@media (prefers-color-scheme: dark){body{background:#252424;color:#ecebe6}}
</style></head><body data-surface="${opts.surface}">${html(tree)}
<script>for (const d of document.querySelectorAll('[data-svg]')) { const t = d.querySelector('template'); d.attachShadow({ mode: 'open' }).append(t.content); t.remove() }</script>
</body></html>`
}

export async function show(page: Page, tree: Node, opts: Opts & { theme: 'dark' | 'light'; motion?: boolean }): Promise<void> {
  await page.emulateMedia({ colorScheme: opts.theme, reducedMotion: opts.motion ? 'no-preference' : 'reduce' })
  await page.setViewportSize({ width: Math.ceil(opts.widthCells * CELL_W), height: 200 })
  await page.setContent(pageOf(tree, opts))
}

// Shadow roots holding at least one infinite animation, and how many infinite animations are not stepped.
export async function loops(page: Page): Promise<{ drawings: number; eased: number }> {
  return page.evaluate(() => {
    let drawings = 0, eased = 0
    for (const d of document.querySelectorAll('[data-svg]')) {
      const live = (d.shadowRoot?.getAnimations() ?? []).filter(a => a.effect?.getTiming().iterations === Infinity)
      if (live.length) drawings++
      for (const a of live) {
        const fx = a.effect as KeyframeEffect, name = (a as CSSAnimation).animationName
        let fn = fx.getTiming().easing ?? 'linear'
        if (name && fx.target) {
          const cs = getComputedStyle(fx.target), names = cs.animationName.split(','), fns = cs.animationTimingFunction.split(/,(?![^(]*\))/)
          fn = (fns[Math.max(0, names.findIndex(n => n.trim() === name))] ?? fn).trim()
        }
        if (!fn.startsWith('step')) eased++
      }
    }
    return { drawings, eased }
  })
}

export function alts(tree: Node): string[] {
  if (typeof tree === 'string' || !tree) return []
  const p = tree.props ?? {}
  const own = tree.type === 'Svg' ? [String(p.alt ?? '')] : tree.type === 'Client' ? [String((p.props as Record<string, unknown> | undefined)?.alt ?? '')] : []
  return [...own, ...(tree.children ?? []).flatMap(alts)]
}
