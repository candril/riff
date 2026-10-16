import type { MouseEvent } from "@opentui/core"
import type { UnifiedLayout } from "../split-view/unified-layout"
import type { ScrollWindow } from "./split-scroll"
import { wheelDragRow } from "./wheel-drag"

export interface WheelSteps {
  rows(delta: number): void
  columns(delta: number): void
}

/**
 * A wheel handler that moves unified's window the way VimDiffView's
 * ScrollBox does: a tick is a row or a column, as OpenTUI's default linear
 * acceleration counts it, and shift turns the vertical wheel sideways.
 */
export function unifiedWheel(steps: WheelSteps) {
  return (event: MouseEvent) => {
    const delta = Math.trunc(event.scroll?.delta ?? 0)
    if (delta === 0) return
    switch (wheelDirection(event)) {
      case "up":
        return steps.rows(-delta)
      case "down":
        return steps.rows(delta)
      case "left":
        return steps.columns(-delta)
      case "right":
        return steps.columns(delta)
    }
  }
}

function wheelDirection(event: MouseEvent) {
  const direction = event.scroll?.direction
  if (!event.modifiers.shift) return direction
  return direction === "up" ? "left" : direction === "down" ? "right" : direction === "right" ? "down" : "up"
}

/**
 * The mapping line the cursor is dragged to once the wheel has moved
 * `window`, null when it may stay. Every unified row is a mapping line, so
 * the row under the target visual row is the line to hand over.
 */
export function draggedLine(
  layout: Pick<UnifiedLayout, "rows" | "visual">,
  window: ScrollWindow,
  cursor: { line: number; row: number },
  scrollOff: number
): number | null {
  const visual = layout.visual()
  const target = wheelDragRow({ ...window, total: visual.total, cursorRow: cursor.row, scrollOff })
  if (target === null) return null
  const row = layout.rows()[visual.at(target).row]
  return row?.kind === "line" && row.index !== cursor.line ? row.index : null
}
