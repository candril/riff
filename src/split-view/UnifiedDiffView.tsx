import { Renderable } from "@opentui/core"
import { For, Show, createMemo, createRenderEffect, type JSX } from "solid-js"
import type { Row } from "../diff-rows/rows"
import { commentSigns } from "../diff-rows/signs"
import { theme } from "../theme"
import type { DiffLineType } from "../vim-diff/types"
import { FileLabel, FullRow } from "./FullRow"
import { flashByLine, searchByLine } from "./overlays"
import { mountedRows } from "./held-rows"
import "./scroll-bar"
import { createTerminalCursor, unifiedCursorCell } from "./terminal-cursor"
import type { UnifiedDiffViewProps, UnifiedEnv } from "./unified-env"
import { createUnifiedLayout } from "./unified-layout"
import { UnifiedLine } from "./UnifiedLine"
import { wordsOf } from "./words"

export type { UnifiedDiffViewProps } from "./unified-env"

// Drawn by riff beside the code rather than as code, so never wrapped.
const CHROME_TYPES = new Set<DiffLineType>(["file-header", "divider", "spacing"])

// FullRow draws a row as one box, so hiding that box hides the row and takes it out of the column.
// Anything else would leave held chrome drawn over the window, so it fails loudly rather than quietly.
function hiddenUnless(row: JSX.Element, shown: () => boolean) {
  if (!(row instanceof Renderable)) throw new Error("FullRow must render a single Renderable for held chrome to be hidden")
  createRenderEffect(() => (row.visible = shown()))
  return row
}

/**
 * The diff as one column of rows, old and new lines interleaved, each line
 * with its own gutter. Windowed like split: only the rows that overlap the
 * screen are laid out, and a wrapped line takes a row per slice.
 */
export function UnifiedDiffView(props: UnifiedDiffViewProps) {
  // The island passes its own, so that it and the view share one wrap and agree on every row.
  const layout = props.layout ?? createUnifiedLayout(props)
  const { originOf, rows, visual, sticky } = layout
  const env: UnifiedEnv = {
    props,
    rowWidth: layout.rowWidth,
    originOf,
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
    mounted: createMemo(() => mountedRows(props.scrollTop, props.height, layout.held.span())),
    inWindow: (row) => row >= props.scrollTop && row < props.scrollTop + props.height,
  }
  const placeCursor = createTerminalCursor(
    () => props.focused,
    () =>
      unifiedCursorCell({
        line: props.mapping.getLine(props.cursor.line),
        lineIndex: props.cursor.line,
        col: props.cursor.col,
        scrollTop: props.scrollTop,
        height: props.height,
        column: props.column,
        origin: env.originOf(props.cursor.line),
        rowWidth: env.rowWidth(),
        visual: visual(),
      })
  )
  // The stable Row objects themselves, so a scroll keeps every row still on screen as it was.
  const mounted = createMemo((): readonly Row[] => {
    const shown = visual()
    if (props.scrollTop >= shown.total || props.height <= 0) return []
    const { top, bottom } = env.mounted()
    return rows().slice(shown.at(top).row, shown.at(bottom - 1).row + 1)
  })

  return (
    <box
      flexDirection="row"
      width={props.width}
      height={props.height}
      overflow="hidden"
      renderAfter={placeCursor}
    >
      <box flexDirection="column" width={env.rowWidth()} height={props.height} flexShrink={0} overflow="hidden">
        <For each={mounted()}>
          {(row) => {
            if (row.kind !== "line") return null
            const line = props.mapping.getLine(row.index)
            if (!line) return null
            // A memo, so the cursor moving elsewhere reaches nothing under the row.
            const atCursor = createMemo(() => props.cursor.line === row.index)
            // Unified has a row per line, so the row's index in the view is the line's.
            if (CHROME_TYPES.has(line.type)) {
              return hiddenUnless(
                <FullRow env={env} line={line} index={row.index} at={row.index} atCursor={atCursor()} />,
                () => env.inWindow(visual().firstOf(row.index))
              )
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
      <Show when={layout.scrollBarShows()}>
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
