import { For, createMemo } from "solid-js"
import { columnOfCell } from "../diff-rows/cells"
import { ADDITION_BG, DELETION_BG, cursorLineBg } from "../diff-rows/line-colors"
import { buildSegments, fade, sliceSegments, type Segment } from "../diff-rows/segments"
import type { WrapSlice } from "../diff-rows/wrap"
import { theme } from "../theme"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { DiffLine, DiffLineType } from "../vim-diff/types"
import { SegmentTexts, sameSpan } from "./Half"
import { SIGN_CELLS } from "./layout"
import { charSelectionOn, inLineSelection, type SearchHit } from "./overlays"
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

const NO_HITS: readonly SearchHit[] = []
const sameHits = (a: readonly SearchHit[], b: readonly SearchHit[]) =>
  a.length === b.length &&
  a.every((hit, i) => hit.startCol === b[i]!.startCol && hit.endCol === b[i]!.endCol && hit.current === b[i]!.current)

const NO_FLASH: readonly FlashMatch[] = []
const sameFlash = (a: readonly FlashMatch[] | null, b: readonly FlashMatch[] | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.length === b.length &&
    a.every(
      (match, i) => match.startCol === b[i]!.startCol && match.endCol === b[i]!.endCol && match.label === b[i]!.label
    ))

/**
 * `›` over the line's last cell on screen, under the overlays: the cell's
 * background shows through, flash's backdrop fades the glyph, a flash match
 * recolours it and a label replaces it.
 */
function rightMarker(under: Segment & { bg: string }, column: number, flash: readonly FlashMatch[] | null): Segment {
  // A label starting here replaces the › whichever match lists first; `under` already layers any match after it.
  if (flash?.some((match) => match.label && match.startCol === column)) return under
  const hit = flash?.find((match) => column >= match.startCol && column < match.endCol)
  const fg = hit ? under.fg : flash ? fade(theme.surface2, under.bg) : theme.surface2
  return { text: "›", fg, bg: under.bg, attributes: 0 }
}

/** A line of code: one row, or a row per slice of it that is on screen when wrapped. */
export function UnifiedLine(props: { env: UnifiedEnv; line: DiffLine; index: number; atCursor: boolean }) {
  const { env } = props
  const view = env.props
  // Memoised to a boolean, so a selection moving elsewhere leaves this line's colours alone.
  const selected = createMemo(() => inLineSelection(view.selection, props.index))
  const colors = createMemo(() => unifiedLineColors(props.line.type, selected(), props.atCursor))
  const origin = () => env.originOf(props.index)
  const sign = () => env.signs().get(props.index)
  const codeWidth = () => env.rowWidth() - origin()
  const lineCells = createMemo(() => markedCells(props.line))
  // Each memoised to what this line shows, so a search, selection or flash changing elsewhere leaves its segments alone.
  const hits = createMemo(() => env.searchHits().get(props.index) ?? NO_HITS, NO_HITS, { equals: sameHits })
  const charSelection = createMemo(() => charSelectionOn(view.selection, props.index, props.line), undefined, {
    equals: sameSpan,
  })
  const flash = createMemo(
    () => {
      const byLine = env.flashHits()
      return byLine && (byLine.get(props.index) ?? NO_FLASH)
    },
    null,
    { equals: sameFlash }
  )

  // Overlaid whole and sliced after, so a wrapped slice or a sideways window shows its own part of each overlay.
  const full = createMemo(() => {
    void view.highlightVersion
    const flashed = flash()
    return buildSegments(props.line.content, {
      spans: view.lineSpans.spans(view.mapping.allLines, props.index),
      words: env.words().get(props.index),
      wordSide: props.line.type === "deletion" ? "removed" : "added",
      baseFg: theme.text,
      rowBg: colors().content ?? theme.base,
      search: { matches: hits() },
      selection: charSelection(),
      flash: flashed && { matches: flashed },
    })
  })

  // Only the slices mounted, so a line cut off at the top starts on the slice that is showing.
  const shown = createMemo(
    () => {
      const slices = env.visual().slicesOf(props.index)
      if (!slices) return NOT_WRAPPED
      const first = env.visual().firstOf(props.index)
      const { top, bottom } = env.mounted()
      return slices.slice(Math.max(0, top - first), Math.max(0, bottom - first))
    },
    NOT_WRAPPED,
    { equals: sameItems }
  )

  return (
    <box flexDirection="column" width={env.rowWidth()} flexShrink={0}>
      <For each={shown()}>
        {(slice) => {
          const continuation = slice !== null && slice.startCol > 0
          const row = createMemo(() => {
            const offset = slice ? (env.visual().slicesOf(props.index)?.indexOf(slice) ?? 0) : 0
            return env.visual().firstOf(props.index) + offset
          })
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
            const last = view.column + width - 1
            // The line runs past `last`, so a segment is always there.
            const cell = sliceSegments(full(), last, 1)[0]!
            const under = { ...cell, bg: cell.bg ?? colors().content ?? theme.base }
            const column = columnOfCell(props.line.content, last)
            return [...sliceSegments(full(), view.column, width - 1), rightMarker(under, column, flash())]
          }
          const gutterMark = () => (continuation ? "↳" : markers().left ? "‹" : null)
          return (
            <box
              flexDirection="row"
              width={env.rowWidth()}
              height={1}
              flexShrink={0}
              overflow="hidden"
              backgroundColor={colors().content}
              visible={env.inWindow(row())}
            >
              <text wrapMode="none" flexShrink={0} fg={sign()?.color ?? theme.overlay0} bg={colors().gutter}>
                {!continuation && sign() ? "●" : " "}
              </text>
              <text wrapMode="none" flexShrink={0} fg={theme.overlay0} bg={colors().gutter}>
                {" "}
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
