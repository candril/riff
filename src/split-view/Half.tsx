import { For, Show, createMemo } from "solid-js"
import { ADDITION_BG, DELETION_BG, cursorLineBg } from "../diff-rows/line-colors"
import type { Side } from "../diff-rows/rows"
import { buildSegments, type Segment } from "../diff-rows/segments"
import { theme } from "../theme"
import type { DiffLine } from "../vim-diff/types"
import type { SplitEnv } from "./env"
import { contentOrigin, halfContent } from "./layout"

const tintOf = (line: DiffLine | undefined) =>
  line?.type === "addition" ? ADDITION_BG : line?.type === "deletion" ? DELETION_BG : undefined

function lineNumber(line: DiffLine, side: Side): string {
  if (line.type === "no-newline") return ""
  return String((side === "left" ? line.oldLineNum : line.newLineNum) ?? "")
}

/** One segment per text, as tenor's LineText draws them: a text's runs cannot each carry a colour. */
export function SegmentTexts(props: { segments: readonly Segment[] }) {
  return (
    <For each={props.segments}>
      {(segment) => (
        <text wrapMode="none" flexShrink={0} fg={segment.fg} bg={segment.bg} attributes={segment.attributes}>
          {segment.text}
        </text>
      )}
    </For>
  )
}

// A half's line never changes for the half's life; only the cursor and the column do.
export function Half(props: { env: SplitEnv; index: number | undefined; side: Side; active: boolean }) {
  const { env } = props
  const view = env.props
  const line = () => (props.index === undefined ? undefined : view.mapping.getLine(props.index))
  // An empty half is shaded, so it reads as the absence of a line rather than a blank one.
  const background = () => (props.active ? cursorLineBg(line()?.type) : (tintOf(line()) ?? (line() ? undefined : theme.mantle)))
  const width = () => env.panes()[props.side]
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
      cursor: props.active && view.focused ? view.cursor.col : undefined,
    })
    return halfContent(full, view.columns[props.side], width() - contentOrigin(env.gutter())).segments
  })

  return (
    <box flexDirection="row" width={width()} height={1} flexShrink={0} overflow="hidden" backgroundColor={background()}>
      <Show when={line()}>
        <text wrapMode="none" flexShrink={0} fg={sign()?.color ?? theme.overlay0}>
          {sign() ? "●" : " "}
        </text>
        <text wrapMode="none" flexShrink={0} fg={theme.overlay0}>
          {`${lineNumber(line()!, props.side).padStart(env.gutter())} `}
        </text>
        <SegmentTexts segments={segments()} />
      </Show>
    </box>
  )
}
