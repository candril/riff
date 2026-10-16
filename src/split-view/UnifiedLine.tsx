import { For, createMemo } from "solid-js"
import { ADDITION_BG, DELETION_BG, cursorLineBg } from "../diff-rows/line-colors"
import { buildSegments, sliceSegments, type Segment } from "../diff-rows/segments"
import type { WrapSlice } from "../diff-rows/wrap"
import { theme } from "../theme"
import type { DiffLine, DiffLineType } from "../vim-diff/types"
import { SegmentTexts } from "./Half"
import { SIGN_CELLS } from "./layout"
import { inLineSelection } from "./overlays"
import type { UnifiedEnv } from "./unified-env"
import { markedCells, unifiedMarkers } from "./unified-markers"

interface LineColors {
  gutter: string
  content: string | undefined
}

const TINTS: Partial<Record<DiffLineType, LineColors>> = {
  addition: { gutter: theme.base, content: ADDITION_BG },
  deletion: { gutter: theme.base, content: DELETION_BG },
  "hunk-header": { gutter: theme.surface0, content: theme.surface0 },
}
const SELECTED: LineColors = { gutter: theme.surface1, content: theme.surface0 }
const PLAIN: LineColors = { gutter: theme.mantle, content: undefined }

/** Gutter and code backgrounds, layered as unified's lineColors layer them: tint, then selection, then cursor. */
export function unifiedLineColors(type: DiffLineType, selected: boolean, atCursor: boolean): LineColors {
  const below = selected ? SELECTED : TINTS[type]
  // The cursor line keeps any gutter it already had; an untinted one takes the code's background.
  if (atCursor) return { gutter: below?.gutter ?? theme.base, content: cursorLineBg(type) }
  return below ?? PLAIN
}

function lineNumber(line: DiffLine): string {
  if (line.type === "addition" || line.type === "context") return String(line.newLineNum ?? "")
  if (line.type === "deletion") return String(line.oldLineNum ?? "")
  return ""
}

// One constant, so an unwrapped line's <For> keeps its row across every update.
const NOT_WRAPPED: readonly (WrapSlice | null)[] = [null]

const sameItems = <T,>(a: readonly T[], b: readonly T[]) => a.length === b.length && a.every((item, i) => item === b[i])

type Markers = { left: boolean; right: boolean }
const NO_MARKERS: Markers = { left: false, right: false }
const sameMarkers = (a: Markers, b: Markers) => a.left === b.left && a.right === b.right

const marker = (text: string, bg: string): Segment => ({ text, fg: theme.surface2, bg, attributes: 0 })

/** A line of code: one row, or a row per slice of it that is on screen when wrapped. */
export function UnifiedLine(props: { env: UnifiedEnv; line: DiffLine; index: number; atCursor: boolean }) {
  const { env } = props
  const view = env.props
  // Memoised to a boolean, so a selection moving elsewhere leaves this line's colours alone.
  const selected = createMemo(() => inLineSelection(view.selection, props.index))
  const colors = createMemo(() => unifiedLineColors(props.line.type, selected(), props.atCursor))
  const origin = () => env.originOf(props.index)
  const sign = () => env.signs().get(props.index)
  const codeWidth = () => view.width - origin()
  const lineCells = createMemo(() => markedCells(props.line))

  const full = createMemo(() => {
    void view.highlightVersion
    return buildSegments(props.line.content, {
      spans: view.lineSpans.spans(view.mapping.allLines, props.index),
      words: env.words().get(props.index),
      wordSide: props.line.type === "deletion" ? "removed" : "added",
      baseFg: theme.text,
      rowBg: colors().content ?? theme.base,
    })
  })

  // Only the slices inside the window, so a line cut off at the top starts on the slice that is showing.
  const shown = createMemo(
    () => {
      const slices = env.visual().slicesOf(props.index)
      if (!slices) return NOT_WRAPPED
      const first = env.visual().firstOf(props.index)
      return slices.slice(Math.max(0, view.scrollTop - first), Math.max(0, view.scrollTop + view.height - first))
    },
    NOT_WRAPPED,
    { equals: sameItems }
  )

  return (
    <box flexDirection="column" width={view.width} flexShrink={0}>
      <For each={shown()}>
        {(slice) => {
          const continuation = slice !== null && slice.startCol > 0
          // Memoised, so a sideways scroll that leaves the markers as they were redraws no gutter.
          const markers = createMemo(
            () => (slice ? NO_MARKERS : unifiedMarkers(lineCells(), view.column, codeWidth())),
            NO_MARKERS,
            { equals: sameMarkers }
          )
          const segments = () => {
            if (slice) return sliceSegments(full(), slice.startCell, slice.cells)
            const width = codeWidth()
            if (!markers().right) return sliceSegments(full(), view.column, width)
            // `›` takes the last cell's glyph but keeps its background, so a word diff or tint under it shows through.
            const last = view.column + width - 1
            const under = sliceSegments(full(), last, 1)[0]?.bg ?? colors().content ?? theme.base
            return [...sliceSegments(full(), view.column, width - 1), marker("›", under)]
          }
          const gutterMark = () => (continuation ? "↳" : markers().left ? "‹" : null)
          return (
            <box
              flexDirection="row"
              width={view.width}
              height={1}
              flexShrink={0}
              overflow="hidden"
              backgroundColor={colors().content}
            >
              <text wrapMode="none" flexShrink={0} fg={sign()?.color ?? theme.overlay0} bg={colors().gutter}>
                {!continuation && sign() ? "●" : " "}
              </text>
              <text wrapMode="none" flexShrink={0} fg={theme.overlay0} bg={colors().gutter}>
                {(continuation ? "" : lineNumber(props.line)).padStart(origin() - SIGN_CELLS - 1)}
              </text>
              <text wrapMode="none" flexShrink={0} fg={gutterMark() ? theme.surface2 : theme.overlay0} bg={colors().gutter}>
                {gutterMark() ?? " "}
              </text>
              <SegmentTexts segments={segments()} />
            </box>
          )
        }}
      </For>
    </box>
  )
}
