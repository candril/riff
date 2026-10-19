import { Box, Text, RGBA, type OptimizedBuffer, type Renderable } from "@opentui/core"
import { theme } from "../theme"
import { edgeHints, threadsHiddenBelow } from "./overflow-hints"

/** The thread rows' own inset inside the viewport, so a hint reads in their column. */
const TEXT_INSET = 2

/**
 * The thread viewport's top edge row, "↑ N" for the threads above the
 * window. Laid over the viewport's top padding row, so it covers nothing.
 */
export function topThreadHint(before: number) {
  const text = edgeHints(before, 0).above
  if (text === null) return null
  return Box(
    {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 1,
      paddingLeft: TEXT_INSET,
      backgroundColor: theme.mantle,
    },
    Text({ content: text, fg: theme.overlay0 })
  )
}

/**
 * The thread viewport's bottom edge row, "↓ N more". Which of the window's
 * threads run into that row is known only once the stack is laid out, and
 * render.ts builds the panel afresh on every pass with no tick to settle
 * in, so the count is taken while painting rather than when building. It
 * reads only layout, never the frame buffer.
 *
 * `threadSizes` is how many of the stack's children each window thread
 * takes, in order; the stack is the viewport's first child.
 */
export function bottomThreadHint(threadSizes: readonly number[], after: number) {
  return Box({
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 1,
    renderAfter(this: Renderable, buffer: OptimizedBuffer) {
      const stack = this.parent?.getChildren()[0]
      const rows = stack ? threadLastRows(stack.getChildren(), threadSizes) : []
      const text = edgeHints(0, threadsHiddenBelow(rows, this.y, after)).below
      if (text === null) return
      const background = RGBA.fromHex(theme.mantle)
      buffer.fillRect(this.x, this.y, this.width, 1, background)
      buffer.drawText(text, this.x + TEXT_INSET, this.y, RGBA.fromHex(theme.overlay0), background)
    },
  })
}

function threadLastRows(children: readonly Renderable[], threadSizes: readonly number[]): number[] {
  const rows: number[] = []
  let end = 0
  for (const size of threadSizes) {
    end += size
    const last = children[end - 1]
    if (last) rows.push(last.y + last.height - 1)
  }
  return rows
}
