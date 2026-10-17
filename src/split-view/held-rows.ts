import type { CliRenderer } from "@opentui/core"
import { createSignal } from "solid-js"

/** Visual rows, `bottom` exclusive. */
export interface RowSpan {
  top: number
  bottom: number
}

const union = (a: RowSpan, b: RowSpan): RowSpan => ({ top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom) })

/** The rows to mount: the window's, and any held past it. */
export function mountedRows(scrollTop: number, height: number, held: RowSpan | null): RowSpan {
  const window = { top: scrollTop, bottom: scrollTop + height }
  return held ? union(held, window) : window
}

/**
 * The rows wheel ticks have scrolled out of unified's window, kept mounted
 * and hidden until a frame has been drawn without them.
 *
 * OpenTUI hands a wheel tick to whatever the hit grid names under the
 * pointer, and only a drawn frame rebuilds that grid. A row the previous
 * tick scrolled away and that was then destroyed leaves its cell naming
 * nothing, so every tick after it in the same frame would be dropped; a
 * row still mounted takes the tick and bubbles it up to the island.
 *
 * A hold is tagged with the frames begun so far. One made before a frame
 * began is out of the hit grid once that frame is drawn, so it is let go
 * at the start of the frame after; one made while a frame was being drawn
 * may still be in its grid, and waits a frame longer.
 */
export function createHeldRows(renderer: CliRenderer) {
  const [span, setSpan] = createSignal<RowSpan | null>(null)
  let holds: { span: RowSpan; frame: number }[] = []
  let framesBegun = 0

  const onFrame = async () => {
    framesBegun++
    holds = holds.filter((hold) => hold.frame >= framesBegun - 1)
    setSpan(holds.length === 0 ? null : holds.map((hold) => hold.span).reduce(union))
    if (holds.length > 0) renderer.requestRender()
    else renderer.removeFrameCallback(onFrame)
  }

  return {
    /** The rows to keep mounted beyond the window, null while nothing is held. */
    span,
    /** Keeps the rows of `window`, as it stands before a wheel tick moves it, until the hit grid has moved on. */
    hold(window: { scrollTop: number; height: number }) {
      if (holds.length === 0) renderer.setFrameCallback(onFrame)
      const held = { top: window.scrollTop, bottom: window.scrollTop + window.height }
      holds.push({ span: held, frame: framesBegun })
      const current = span()
      setSpan(current ? union(current, held) : held)
    },
  }
}

export type HeldRows = ReturnType<typeof createHeldRows>
