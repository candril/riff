import { For, createMemo } from "solid-js"
import { buildRows, type Row } from "../diff-rows/rows"
import { commentSigns } from "../diff-rows/signs"
import { buildVisualRows } from "../diff-rows/visual-rows"
import { theme } from "../theme"
import type { DiffLineType } from "../vim-diff/types"
import { FullRow } from "./FullRow"
import { unifiedOrigins, unifiedWrapWidth } from "./layout"
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
  const origins = createMemo(() => unifiedOrigins(props.mapping, props.wrap ? props.width : undefined))
  const rows = createMemo(() => buildRows(props.mapping.allLines, "unified"))
  const visual = createMemo(() => {
    const originOf = origins()
    return buildVisualRows(rows(), props.mapping.allLines, {
      wrap: props.wrap,
      widthOf: (lineIndex) => unifiedWrapWidth(props.width, originOf(lineIndex)),
    })
  })
  const env: UnifiedEnv = {
    props,
    originOf: (lineIndex) => origins()(lineIndex),
    // Unified's gutter runs down the whole file section, past the rows of riff's own in it,
    // coloured by the rule unifiedLineColors follows for a line of code.
    chromeGutterBg: (tint, atCursor) => tint ?? (atCursor ? theme.base : theme.mantle),
    files: createMemo(() => new Map(props.files.map((file) => [file.filename, file]))),
    flashHits: () => null,
    signs: createMemo(() => commentSigns(props.mapping, props.comments)),
    words: createMemo(() => wordsOf(props.mapping)),
    visual,
  }
  // The stable Row objects themselves, so a scroll keeps every row still on screen as it was.
  const visible = createMemo((): readonly Row[] => {
    const shown = visual()
    if (props.scrollTop >= shown.total || props.height <= 0) return []
    const first = shown.at(props.scrollTop).row
    const last = shown.at(props.scrollTop + props.height - 1).row
    return rows().slice(first, last + 1)
  })

  return (
    <box flexDirection="column" width={props.width} height={props.height} overflow="hidden">
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
    </box>
  )
}
