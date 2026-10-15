import { For, createMemo } from "solid-js"
import { commentSigns } from "../diff-rows/signs"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import { computeWordDiff, type WordSpan } from "../vim-diff/word-diff"
import type { SplitDiffViewProps, SplitEnv } from "./env"
import { FullRow } from "./FullRow"
import { gutterWidth, paneWidths } from "./layout"
import { PairRow } from "./PairRow"

export type { SplitDiffViewProps } from "./env"

// A mapping is rebuilt on every fold and expansion, never mutated, so it is its own cache key.
const wordDiffs = new WeakMap<DiffLineMapping, Map<number, WordSpan[]>>()
function wordsOf(mapping: DiffLineMapping): Map<number, WordSpan[]> {
  const known = wordDiffs.get(mapping)
  if (known) return known
  const words = computeWordDiff(mapping)
  wordDiffs.set(mapping, words)
  return words
}

/**
 * A diff drawn as one-cell rows, old file on the left and new on the right,
 * each pane with its own column window. Only the rows on screen are laid
 * out: a scrollbox lays out every child, which a long diff cannot afford.
 */
export function SplitDiffView(props: SplitDiffViewProps) {
  const env: SplitEnv = {
    props,
    gutter: createMemo(() => gutterWidth(props.mapping)),
    panes: createMemo(() => paneWidths(props.width)),
    signs: createMemo(() => commentSigns(props.mapping, props.comments)),
    words: createMemo(() => wordsOf(props.mapping)),
    files: createMemo(() => new Map(props.files.map((file) => [file.filename, file]))),
  }
  const visible = () => props.source.rows.slice(props.scrollTop, props.scrollTop + props.height)

  return (
    <box flexDirection="column" width={props.width} height={props.height} overflow="hidden">
      <For each={visible()}>
        {(row, i) => {
          const atCursor = () => props.cursor.row === props.scrollTop + i()
          // <For> hands a row object to one child for its whole life, so branching once is enough.
          if (row.kind === "pair") return <PairRow env={env} row={row} atCursor={atCursor()} />
          const line = props.mapping.getLine(row.index)
          return line ? <FullRow env={env} line={line} atCursor={atCursor()} /> : null
        }}
      </For>
    </box>
  )
}
