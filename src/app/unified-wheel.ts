import type { UnifiedLayout } from "../split-view/unified-layout"
import type { ScrollWindow } from "./split-scroll"
import { wheelDragRow } from "./wheel-drag"

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
