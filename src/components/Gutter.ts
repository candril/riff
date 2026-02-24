/**
 * Gutter component - sits to the left of the diff view.
 * Provides space for cursor and comment indicators.
 * 
 * Layout (5 chars wide):
 * Col 0: Space
 * Col 1: Cursor indicator (▶)
 * Col 2: Space  
 * Col 3: Comment indicator (●)
 * Col 4: Space
 */

import { Box } from "@opentui/core"
import { theme } from "../theme"

export const GUTTER_WIDTH = 5
export const CURSOR_COL = 1
export const COMMENT_COL = 3

export interface GutterProps {
  height?: number | `${number}%` | "auto"
}

/**
 * Empty gutter box - indicators are positioned absolutely on top
 */
export function Gutter({ height = "100%" }: GutterProps = {}) {
  return Box({
    id: "gutter",
    width: GUTTER_WIDTH,
    height,
    backgroundColor: theme.mantle,
  })
}
