import { useRenderer } from "@opentui/solid"
import { createMemo } from "solid-js"
import { BLAME_CELLS } from "../components/blame-column-model"
import { buildRows } from "../diff-rows/rows"
import { buildVisualRows, lineWrapper } from "../diff-rows/visual-rows"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { BlameColumns } from "./blame-cells"
import { scrollBarFits, unifiedContentWidth } from "./content-width"
import { unifiedOrigins, unifiedWrapWidth } from "./layout"
import { createHeldRows } from "./held-rows"
import { stickyHeaderLine } from "./sticky"

export interface UnifiedLayoutInput {
  readonly mapping: DiffLineMapping
  readonly wrap: boolean
  readonly width: number
  readonly height: number
  readonly scrollTop: number
  readonly blameColumns?: BlameColumns
}

const NO_COLUMNS: BlameColumns = new Map()

/**
 * Where unified's rows go: their wrap, gutters, scrollbar and pinned
 * header. The island and the view share one, so every row is worked out once.
 */
export function createUnifiedLayout(input: UnifiedLayoutInput) {
  // Per width as well as per mapping, so a run of resizes cannot pile up slices for widths long gone.
  // Unwrapped, nothing is sliced, so a resize keeps the wrapper and skips the gutter's row count.
  const wrapper = createMemo(() => {
    void (input.wrap ? input.width : undefined)
    return lineWrapper(input.mapping.allLines)
  })
  // Keyed by which files have a column, so blame settling into one leaves every row where it was.
  const blameFiles = createMemo(() => [...(input.blameColumns ?? NO_COLUMNS).keys()].sort().join("\0"))
  const blameWidthOf = createMemo(() => {
    const files = new Set(blameFiles() ? blameFiles().split("\0") : [])
    return (lineIndex: number) => {
      const filename = input.mapping.allLines[lineIndex]?.filename
      return filename !== undefined && files.has(filename) ? BLAME_CELLS : 0
    }
  })
  const origins = createMemo(() =>
    unifiedOrigins(input.mapping, input.wrap ? input.width : undefined, wrapper(), blameWidthOf())
  )
  const rows = createMemo(() => buildRows(input.mapping.allLines, "unified"))
  const visual = createMemo(() => {
    const originOf = origins()
    return buildVisualRows(rows(), input.mapping.allLines, {
      wrap: input.wrap,
      widthOf: (lineIndex) => unifiedWrapWidth(input.width, originOf(lineIndex)),
      wrapper: wrapper(),
    })
  })
  // Wrapped, the content is clamped to the pane, so the bar always has its cell.
  const contentWidth = createMemo(() => (input.wrap ? 0 : unifiedContentWidth(input.mapping.allLines, origins())))
  // Wrap already leaves the scrollbar its cell, so whether it shows cannot change what wraps.
  const scrollBarShows = createMemo(
    () => visual().total > input.height && scrollBarFits(input.width, contentWidth())
  )
  // Single-file mode has no header lines, so it never pins one.
  const headerLines = createMemo(() =>
    input.mapping.allLines.flatMap((line, index) => (line.type === "file-header" ? [index] : []))
  )
  // Unified has a row per line, so a header's line index is its row's.
  const sticky = createMemo(() => stickyHeaderLine(headerLines(), visual().firstOf, input.scrollTop))
  return {
    // Here, so the island holds the rows its wheel scrolls away and the view keeps them mounted.
    held: createHeldRows(useRenderer()),
    wrapper,
    originOf: (lineIndex: number) => origins()(lineIndex),
    blameWidthOf: (lineIndex: number) => blameWidthOf()(lineIndex),
    rows,
    visual,
    contentWidth,
    scrollBarShows,
    rowWidth: () => (scrollBarShows() ? input.width - 1 : input.width),
    headerLines,
    sticky,
  }
}

export type UnifiedLayout = ReturnType<typeof createUnifiedLayout>
