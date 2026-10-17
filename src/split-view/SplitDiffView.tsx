import { For, createMemo } from "solid-js"
import { commentSigns } from "../diff-rows/signs"
import type { SplitDiffViewProps, SplitEnv } from "./env"
import { FullRow } from "./FullRow"
import { mountedRows } from "./held-rows"
import { hiddenUnless } from "./hidden-unless"
import { contentOrigin, gutterWidth, paneWidths } from "./layout"
import { flashByLine, searchByLine } from "./overlays"
import { PairRow } from "./PairRow"
import { wordsOf } from "./words"

export type { SplitDiffViewProps } from "./env"

/**
 * A diff drawn as one-cell rows, old file on the left and new on the right,
 * each pane with its own column window. Only the rows on screen are laid
 * out: a scrollbox lays out every child, which a long diff cannot afford.
 * Rows the wheel holds stay mounted past the window, hidden.
 */
export function SplitDiffView(props: SplitDiffViewProps) {
  const gutter = createMemo(() => gutterWidth(props.mapping))
  const env: SplitEnv = {
    props,
    gutter,
    rowWidth: () => props.width,
    originOf: () => contentOrigin(gutter()),
    chromeGutterBg: () => undefined,
    // The terminal's cursor is hidden here, so the block stands in for it, and a composer or prompt suspends it.
    headerCursor: () => (props.focused ? props.cursor.col : undefined),
    panes: createMemo(() => paneWidths(props.width)),
    signs: createMemo(() => commentSigns(props.mapping, props.comments)),
    words: createMemo(() => wordsOf(props.mapping)),
    files: createMemo(() => new Map(props.files.map((file) => [file.filename, file]))),
    searchHits: createMemo(() => searchByLine(props.search)),
    flashHits: createMemo(() => flashByLine(props.flash)),
  }
  const span = createMemo(() => {
    const { top, bottom } = mountedRows(props.scrollTop, props.height, props.held ?? null)
    return { top: Math.max(0, top), bottom: Math.min(props.source.rows.length, bottom) }
  })
  // The stable Row objects themselves, so a scroll keeps every row still on screen as it was.
  const mounted = () => props.source.rows.slice(span().top, span().bottom)
  const inWindow = (row: number) => row >= props.scrollTop && row < props.scrollTop + props.height

  return (
    <box flexDirection="column" width={props.width} height={props.height} overflow="hidden">
      <For each={mounted()}>
        {(row, i) => {
          // Memos, so a scroll that moves the span's top and i() in step, or a cursor elsewhere, reaches nothing under the row.
          const at = createMemo(() => span().top + i())
          const atCursor = createMemo(() => props.cursor.row === at())
          const shown = () => inWindow(at())
          // <For> hands a row object to one child for its whole life, so branching once is enough.
          if (row.kind === "pair") return hiddenUnless(<PairRow env={env} row={row} at={at()} atCursor={atCursor()} />, shown)
          const line = props.mapping.getLine(row.index)
          if (!line) return null
          return hiddenUnless(<FullRow env={env} line={line} index={row.index} at={at()} atCursor={atCursor()} />, shown)
        }}
      </For>
    </box>
  )
}
