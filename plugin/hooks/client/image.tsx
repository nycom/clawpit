import type { ClientModule, ClientPointerEvent, RenderElement } from 'claude-code'
import type { ImageProps } from '../../types'

// The one surface module of both surfaces (design §9). A Svg has no events and a Button holds only
// text, so a pressable or looping image is a Client: its instance, and its animation, outlive a redraw.
// The element table has no Svg, but the desktop draws one a module returns. No timers.
type Local = { isHover: boolean }

const Image: ClientModule<ImageProps, Local> = (p, surface) => {
  const press = (what = p.press) => { if (what) surface.post({ press: what }) }
  // A zone is found by the pointer's column scaled to the image's pixels; with no layout yet, the image's own press.
  const pressAt = (e: ClientPointerEvent) => {
    const px = surface.columns ? ((e.fine?.x ?? e.x + 0.5) * p.width) / surface.columns : -1
    return (px >= 0 && p.zones?.find(z => px < z.to)?.press) || p.press
  }
  surface.onPointer(e => {
    if (e.type === 'down' && (e.button ?? 'left') === 'left') press(pressAt(e))
    const isOver = e.type !== 'leave'
    if (p.hover && isOver !== (surface.state?.isHover ?? false)) surface.setState({ isHover: isOver })
  })
  surface.onKey(e => { if (e.key === 'return' || e.key === ' ') press() })
  // Never isInteractive: the desktop draws that Svg in a frame, which takes the pointer from this Client and its press.
  const svg = h('Svg', { source: p.source, alt: p.alt, width: p.width, height: p.height }) as RenderElement
  if (!p.hover) return svg
  const { Box } = surface.elements
  return <Box backgroundColor={surface.state?.isHover ? '#80808014' : undefined}>{svg}</Box>
}

export default Image
