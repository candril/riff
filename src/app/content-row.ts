import { Box, type VChild } from "@opentui/core"

/**
 * The row under the header: the view, and the thread panel docked as a
 * column at its right, the way the tree is one at its left, so the view
 * gives up the panel's width rather than being drawn under it.
 *
 * The view grows from no width at all: from its own full width it would
 * take the panel's shrink in proportion, and the panel gives up columns
 * only when it and the tree cannot both fit on the screen.
 *
 * Only the diff, overview and feed rows carry the id render.ts inserts the
 * tree by; the error and an empty diff are drawn without the tree.
 */
export function mainContentRow(view: VChild, commentPanel: VChild, { withTree }: { withTree: boolean }) {
  return Box(
    { id: withTree ? "main-content-row" : undefined, width: "100%", height: "100%", flexDirection: "row" },
    Box({ flexGrow: 1, flexBasis: 0, minWidth: 0, height: "100%" }, view),
    commentPanel
  )
}
