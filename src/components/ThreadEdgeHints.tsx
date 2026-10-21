import { RGBA, type OptimizedBuffer, type Renderable } from "@opentui/core"
import { Show } from "solid-js"
import { theme } from "../theme"
import { edgeHints, threadsHiddenBelow } from "./overflow-hints"

/** The thread rows' own inset inside the viewport, so a hint reads in their column. */
const TEXT_INSET = 2

/**
 * The thread viewport's top edge row, "↑ N" for the threads above the
 * window. Laid over the viewport's top padding row, so it covers nothing.
 */
export function TopThreadHint(props: { before: number }) {
  return (
    <Show when={edgeHints(props.before, 0).above}>
      {(text: () => string) => (
        <box
          position="absolute"
          top={0}
          left={0}
          right={0}
          height={1}
          paddingLeft={TEXT_INSET}
          backgroundColor={theme.mantle}
        >
          <text fg={theme.overlay0}>{text()}</text>
        </box>
      )}
    </Show>
  )
}

/**
 * The thread viewport's bottom edge row, "↓ N more". Which of the window's
 * threads run into that row is known only once the stack is laid out, and
 * OpenTUI has no hook that runs between layout and paint, so the count is
 * taken while painting. It reads only layout, never the frame buffer.
 *
 * `threadSizes` is how many of the stack's children each window thread
 * takes, in order; the stack is the viewport's first child.
 */
export function BottomThreadHint(props: { threadSizes: readonly number[]; after: number }) {
  function paint(this: Renderable, buffer: OptimizedBuffer) {
    const stack = this.parent?.getChildren()[0]
    const rows = stack ? threadLastRows(stack.getChildren(), props.threadSizes) : []
    const text = edgeHints(0, threadsHiddenBelow(rows, this.y, props.after)).below
    if (text === null) return
    const background = RGBA.fromHex(theme.mantle)
    buffer.fillRect(this.x, this.y, this.width, 1, background)
    buffer.drawText(text, this.x + TEXT_INSET, this.y, RGBA.fromHex(theme.overlay0), background)
  }
  return <box position="absolute" bottom={0} left={0} right={0} height={1} renderAfter={paint} />
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
