import { For, Show, createMemo } from "solid-js"
import { buildRows, type Row } from "../diff-rows/rows"
import { commentSigns } from "../diff-rows/signs"
import { buildVisualRows, lineWrapper } from "../diff-rows/visual-rows"
import { theme } from "../theme"
import type { DiffLineType } from "../vim-diff/types"
import { scrollBarFits, unifiedContentWidth } from "./content-width"
import { FileLabel, FullRow } from "./FullRow"
import { unifiedOrigins, unifiedWrapWidth } from "./layout"
import { flashByLine, searchByLine } from "./overlays"
import "./scroll-bar"
import { stickyHeaderLine } from "./sticky"
import type { UnifiedDiffViewProps, UnifiedEnv } from "./unified-env"
import { UnifiedLine } from "./UnifiedLine"
import { wordsOf } from "./words"

export type { UnifiedDiffViewProps } from "./unified-env"

// Drawn by riff beside the code rather than as code, so never wrapped.
const CHROME_TYPES = new Set<DiffLineType>(["file-header", "divider", "spacing"])

/**
 * The diff as one column of rows, old and new lines interleaved, each line
 * with its own gutter. Windowed like split: only the rows that overlap the
 * screen are laid out, and a wrapped line takes a row per slice.
 */
export function UnifiedDiffView(props: UnifiedDiffViewProps) {
  // Per width as well as per mapping, so a run of resizes cannot pile up slices for widths long gone.
  // Unwrapped, nothing is sliced, so a resize keeps the wrapper and skips the gutter's row count.
  const wrapper = createMemo(() => {
    void (props.wrap ? props.width : undefined)
    return lineWrapper(props.mapping.allLines)
  })
  const origins = createMemo(() => unifiedOrigins(props.mapping, props.wrap ? props.width : undefined, wrapper()))
  const rows = createMemo(() => buildRows(props.mapping.allLines, "unified"))
  const visual = createMemo(() => {
    const originOf = origins()
    return buildVisualRows(rows(), props.mapping.allLines, {
      wrap: props.wrap,
      widthOf: (lineIndex) => unifiedWrapWidth(props.width, originOf(lineIndex)),
      wrapper: wrapper(),
    })
  })
  // Wrapped, the content is clamped to the pane, so VimDiffView's bar always has its cell.
  const contentWidth = createMemo(() => (props.wrap ? 0 : unifiedContentWidth(props.mapping.allLines, origins())))
  // Wrap already leaves the scrollbar its cell, so whether it shows cannot change what wraps.
  const scrollBarShows = createMemo(
    () => visual().total > props.height && scrollBarFits(props.width, contentWidth())
  )
  const env: UnifiedEnv = {
    props,
    rowWidth: () => (scrollBarShows() ? props.width - 1 : props.width),
    originOf: (lineIndex) => origins()(lineIndex),
    // Unified's gutter runs down the whole file section, past the rows of riff's own in it,
    // coloured by the rule unifiedLineColors follows for a line of code.
    chromeGutterBg: (tint, atCursor) => tint ?? (atCursor ? theme.base : theme.mantle),
    headerCursor: () => undefined,
    files: createMemo(() => new Map(props.files.map((file) => [file.filename, file]))),
    flashHits: createMemo(() => flashByLine(props.flash)),
    signs: createMemo(() => commentSigns(props.mapping, props.comments)),
    words: createMemo(() => wordsOf(props.mapping)),
    searchHits: createMemo(() => searchByLine(props.search)),
    visual,
  }
  // Single-file mode has no header lines, so it never pins one.
  const headerLines = createMemo(() =>
    props.mapping.allLines.flatMap((line, index) => (line.type === "file-header" ? [index] : []))
  )
  // Unified has a row per line, so a header's line index is its row's.
  const sticky = createMemo(() => stickyHeaderLine(headerLines(), visual().firstOf, props.scrollTop))
  // The stable Row objects themselves, so a scroll keeps every row still on screen as it was.
  const visible = createMemo((): readonly Row[] => {
    const shown = visual()
    if (props.scrollTop >= shown.total || props.height <= 0) return []
    const first = shown.at(props.scrollTop).row
    const last = shown.at(props.scrollTop + props.height - 1).row
    return rows().slice(first, last + 1)
  })

  return (
    <box flexDirection="row" width={props.width} height={props.height} overflow="hidden">
      <box flexDirection="column" width={env.rowWidth()} height={props.height} flexShrink={0} overflow="hidden">
        <For each={visible()}>
          {(row) => {
            if (row.kind !== "line") return null
            const line = props.mapping.getLine(row.index)
            if (!line) return null
            // A memo, so the cursor moving elsewhere reaches nothing under the row.
            const atCursor = createMemo(() => props.cursor.line === row.index)
            // Unified has a row per line, so the row's index in the view is the line's.
            if (CHROME_TYPES.has(line.type)) {
              return <FullRow env={env} line={line} index={row.index} at={row.index} atCursor={atCursor()} />
            }
            return <UnifiedLine env={env} line={line} index={row.index} atCursor={atCursor()} />
          }}
        </For>
        {/* Narrower than the pane under a scrollbar, so the thumb stays visible on the top row. */}
        <Show when={sticky() !== undefined}>
          <box id="sticky-file-header" position="absolute" top={0} left={0} width={env.rowWidth()} height={1} zIndex={10}>
            <FileLabel
              env={env}
              filename={props.mapping.getLine(sticky()!)?.filename ?? ""}
              collapsed={props.mapping.getLine(sticky()!)?.isCollapsed ?? false}
            />
          </box>
        </Show>
      </box>
      <Show when={scrollBarShows()}>
        <scroll_bar
          width={1}
          flexShrink={0}
          viewportSize={props.height}
          scrollSize={visual().total}
          scrollPosition={props.scrollTop}
        />
      </Show>
    </box>
  )
}
