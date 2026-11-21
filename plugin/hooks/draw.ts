// The one image builder both surfaces draw with. Pure: a plain RenderElement object, no host imports.
import type { ImageProps } from '../types'

export type El = { type: string; props?: Record<string, unknown>; children?: (El | string)[] }

const PROPS_MAX = 60_000
// A looping or pressable image is a Client, so it keeps its instance across redraws; anything else is a plain Svg.
export const image = (key: string, p: ImageProps, loop: boolean): El => {
  const size = JSON.stringify(p).length
  if (size > PROPS_MAX) throw new Error(`clawpit: image ${key} has ${size} characters of props, over ${PROPS_MAX}`)
  return loop || p.press ? { type: 'Client', props: { key, module: './client/image.tsx', props: p } } : { type: 'Svg', props: { key, ...p } }
}
