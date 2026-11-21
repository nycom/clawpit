import { test, expect } from 'claude-code/testing'
import type { ClientPointerEvent, ClientKeyEvent, RenderElement } from 'claude-code'
import Image from '../hooks/client/image'
import type { ImageProps } from '../types'

// The module is driven as the desktop drives it: one surface whose listeners, posts and state are recorded.
// A Client only loads from a hooks module that draws it, and clawpit draws nothing yet, so the module is called directly.
const surfaceFor = () => {
  const s = {
    posts: [] as unknown[], state: undefined as { isHover: boolean } | undefined,
    pointer: (_e: ClientPointerEvent) => {}, key: (_e: ClientKeyEvent) => {},
  }
  const surface = {
    elements: { Box: (p: Record<string, unknown>) => ({ type: 'Box', props: p }) },
    get state() { return s.state },
    setState: (next: { isHover: boolean }) => { s.state = next },
    columns: 0, rows: 0,
    every: () => { throw new Error('the image module starts no timer') },
    onPointer: (fn: (e: ClientPointerEvent) => void) => { s.pointer = fn; return () => {} },
    onKey: (fn: (e: ClientKeyEvent) => void) => { s.key = fn; return () => {} },
    post: (d: unknown) => { s.posts.push(d) },
  }
  return { s, draw: (p: ImageProps) => Image(p, surface as never) as RenderElement & { props: Record<string, unknown>; children?: unknown[] } }
}
const P: ImageProps = { source: '<svg xmlns="http://www.w3.org/2000/svg"/>', alt: 'Agents', width: 24, height: 24 }

test('image: a left press posts its press; hover toggles state; no press prop posts nothing', () => {
  const { s, draw } = surfaceFor()
  expect(draw({ ...P, press: 'size' })).toMatchObject({ type: 'Svg', props: P })
  s.pointer({ type: 'down', x: 0, y: 0, button: 'right' })
  s.pointer({ type: 'down', x: 0, y: 0, button: 'left' })
  s.key({ key: 'return' }); s.key({ key: ' ' }); s.key({ key: 'a' })
  expect(s.posts).toEqual([{ press: 'size' }, { press: 'size' }, { press: 'size' }])

  draw({ ...P, press: 'row:w1', hover: true })
  s.pointer({ type: 'enter', x: 0, y: 0 })
  expect(s.state).toEqual({ isHover: true })
  expect(draw({ ...P, press: 'row:w1', hover: true })).toMatchObject({ type: 'Box', props: { backgroundColor: '#80808014' } })
  s.pointer({ type: 'leave', x: 0, y: 0 })
  expect(s.state).toEqual({ isHover: false })
  expect(draw({ ...P, press: 'row:w1', hover: true }).props.backgroundColor).toBeUndefined()

  const quiet = surfaceFor()
  quiet.draw(P)
  quiet.s.pointer({ type: 'down', x: 0, y: 0, button: 'left' }); quiet.s.key({ key: 'return' }); quiet.s.pointer({ type: 'enter', x: 0, y: 0 })
  expect(quiet.s.posts).toEqual([])
  expect(quiet.s.state).toBeUndefined()
})
