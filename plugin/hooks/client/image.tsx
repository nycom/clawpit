import type { ClientModule, RenderElement } from 'claude-code'
import type { ImageProps } from '../../types'

// The one surface module of both surfaces (design §9). A Svg has no events and a Button holds only
// text, so a pressable or looping image is a Client: its instance, and its animation, outlive a redraw.
// The element table has no Svg, but the desktop draws one a module returns. No timers.
type Local = { isHover: boolean }

const Image: ClientModule<ImageProps, Local> = (p, surface) => {
  const press = () => { if (p.press) surface.post({ press: p.press }) }
  surface.onPointer(e => {
    if (e.type === 'down' && (e.button ?? 'left') === 'left') press()
    const isOver = e.type !== 'leave'
    if (p.hover && isOver !== (surface.state?.isHover ?? false)) surface.setState({ isHover: isOver })
  })
  surface.onKey(e => { if (e.key === 'return' || e.key === ' ') press() })
  const svg = h('Svg', { source: p.source, alt: p.alt, width: p.width, height: p.height }) as RenderElement
  if (!p.hover) return svg
  const { Box } = surface.elements
  return <Box backgroundColor={surface.state?.isHover ? '#80808014' : undefined}>{svg}</Box>
}

export default Image
