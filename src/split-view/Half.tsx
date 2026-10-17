import { Index, Show, createMemo } from "solid-js"
import { ADDITION_BG, DELETION_BG, cursorLineBg } from "../diff-rows/line-colors"
import type { Side } from "../diff-rows/rows"
import { buildSegments, type Segment } from "../diff-rows/segments"
import { colors, theme } from "../theme"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { DiffLine } from "../vim-diff/types"
import type { SplitEnv } from "./env"
import { contentOrigin, halfContent } from "./layout"
import { charSelectionOn, inLineSelection } from "./overlays"

const tintOf = (line: DiffLine | undefined) =>
  line?.type === "addition" ? ADDITION_BG : line?.type === "deletion" ? DELETION_BG : undefined

function lineNumber(line: DiffLine, side: Side): string {
  if (line.type === "no-newline") return ""
  return String((side === "left" ? line.oldLineNum : line.newLineNum) ?? "")
}

/**
 * One segment per text, as tenor's LineText draws them: a text's runs cannot each carry a colour.
 * By position, so a recolour (the cursor arriving on the line) restyles the texts in place: the hit
 * grid names the text under the pointer until the next frame, and a text replaced before then would
 * swallow every wheel tick of a burst that lands on it.
 */
export function SegmentTexts(props: { segments: readonly Segment[] }) {
  return (
    <Index each={props.segments}>
      {(segment) => (
        <text wrapMode="none" flexShrink={0} fg={segment().fg} bg={segment().bg} attributes={segment().attributes}>
          {segment().text}
        </text>
      )}
    </Index>
  )
}

// Flash names a pane only where a line is in both halves; a match without one belongs to whichever half shows its line.
const flashMatchesOn = (matches: readonly FlashMatch[] | undefined, side: Side) =>
  matches?.filter((match) => match.pane === undefined || match.pane === side) ?? []

export const sameSpan = (a: { from: number; to: number } | undefined, b: { from: number; to: number } | undefined) =>
  a?.from === b?.from && a?.to === b?.to

// A half's line never changes for the half's life; only the cursor, the row it sits on and the column do.
export function Half(props: {
  env: SplitEnv
  index: number | undefined
  at: number
  side: Side
  active: boolean
}) {
  const { env } = props
  const view = env.props
  const line = () => (props.index === undefined ? undefined : view.mapping.getLine(props.index))
  // A selection is a span of rows in the active pane; the other half of those rows is not in it.
  const inActivePane = () => props.side === view.side && line() !== undefined
  // Memoised to a boolean, so a linewise selection moving elsewhere leaves this half's colours and segments alone.
  const lineSelected = createMemo(() => inActivePane() && inLineSelection(view.selection, props.at))
  // Memoised to its span, so a selection growing elsewhere leaves this half's segments alone.
  const charSelection = createMemo(
    () => (inActivePane() ? charSelectionOn(view.selection, props.at, line()!) : undefined),
    undefined,
    { equals: sameSpan }
  )
  const background = () => {
    if (props.active) return cursorLineBg(line()?.type)
    if (lineSelected()) return theme.surface0
    // An empty half is shaded, so it reads as the absence of a line rather than a blank one.
    return tintOf(line()) ?? (line() ? undefined : theme.mantle)
  }
  const gutterBg = () => (lineSelected() ? theme.surface1 : undefined)
  const width = () => env.panes()[props.side]
  const mark = () =>
    props.index === undefined ? undefined : env.marks().get(props.index)?.find((found) => found.side === props.side)?.letter
  const sign = () => {
    const found = props.index === undefined ? undefined : env.signs().get(props.index)
    return found?.side === props.side ? found : undefined
  }

  const segments = createMemo(() => {
    const shown = line()
    if (!shown || props.index === undefined) return []
    void view.highlightVersion
    const full = buildSegments(shown.content, {
      spans: view.lineSpans.spans(view.mapping.allLines, props.index),
      words: env.words().get(props.index),
      wordSide: shown.type === "deletion" ? "removed" : "added",
      baseFg: theme.text,
      rowBg: background() ?? theme.base,
      search: { matches: env.searchHits().get(props.index) ?? [] },
      selection: charSelection(),
      flash: env.flashHits() && { matches: flashMatchesOn(env.flashHits()!.get(props.index), props.side) },
      cursor: props.active && view.focused ? view.cursor.col : undefined,
    })
    return halfContent(full, view.columns[props.side], width() - contentOrigin(env.gutter())).segments
  })

  return (
    <box flexDirection="row" width={width()} height={1} flexShrink={0} overflow="hidden" backgroundColor={background()}>
      <Show when={line()}>
        <text wrapMode="none" flexShrink={0} fg={sign()?.color ?? theme.overlay0} bg={gutterBg()}>
          {sign() ? "●" : " "}
        </text>
        <text wrapMode="none" flexShrink={0} fg={mark() ? colors.markLetter : theme.overlay0} bg={gutterBg()}>
          {mark() ?? " "}
        </text>
        <text wrapMode="none" flexShrink={0} fg={theme.overlay0} bg={gutterBg()}>
          {`${lineNumber(line()!, props.side).padStart(env.gutter())} `}
        </text>
        <SegmentTexts segments={segments()} />
      </Show>
    </box>
  )
}
