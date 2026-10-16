import { For, createMemo } from "solid-js"
import { commentSigns } from "../diff-rows/signs"
import type { SplitDiffViewProps, SplitEnv } from "./env"
import { FullRow } from "./FullRow"
import { contentOrigin, gutterWidth, paneWidths } from "./layout"
import { flashByLine, searchByLine } from "./overlays"
import { PairRow } from "./PairRow"
import { wordsOf } from "./words"

export type { SplitDiffViewProps } from "./env"

/**
 * A diff drawn as one-cell rows, old file on the left and new on the right,
 * each pane with its own column window. Only the rows on screen are laid
 * out: a scrollbox lays out every child, which a long diff cannot afford.
 */
export function SplitDiffView(props: SplitDiffViewProps) {
  const gutter = createMemo(() => gutterWidth(props.mapping))
  const env: SplitEnv = {
    props,
    gutter,
    originOf: () => contentOrigin(gutter()),
    chromeGutterBg: () => undefined,
    panes: createMemo(() => paneWidths(props.width)),
    signs: createMemo(() => commentSigns(props.mapping, props.comments)),
    words: createMemo(() => wordsOf(props.mapping)),
    files: createMemo(() => new Map(props.files.map((file) => [file.filename, file]))),
    searchHits: createMemo(() => searchByLine(props.search)),
    flashHits: createMemo(() => flashByLine(props.flash)),
  }
  const visible = () => props.source.rows.slice(props.scrollTop, props.scrollTop + props.height)

  return (
    <box flexDirection="column" width={props.width} height={props.height} overflow="hidden">
      <For each={visible()}>
        {(row, i) => {
          // Memos, so a scroll that moves scrollTop and i() in step, or a cursor elsewhere, reaches nothing under the row.
          const at = createMemo(() => props.scrollTop + i())
          const atCursor = createMemo(() => props.cursor.row === at())
          // <For> hands a row object to one child for its whole life, so branching once is enough.
          if (row.kind === "pair") return <PairRow env={env} row={row} at={at()} atCursor={atCursor()} />
          const line = props.mapping.getLine(row.index)
          return line ? <FullRow env={env} line={line} index={row.index} at={at()} atCursor={atCursor()} /> : null
        }}
      </For>
    </box>
  )
}
