import { TextAttributes } from "@opentui/core"
import { Show, createMemo, type JSX } from "solid-js"
import { cursorLineBg } from "../diff-rows/line-colors"
import { buildSegments, fade } from "../diff-rows/segments"
import { theme } from "../theme"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { DiffLine } from "../vim-diff/types"
import type { RowEnv } from "./env"
import { SegmentTexts } from "./Half"
import { ENTER_HINT, dividerLabel } from "./layout"
import { inLineSelection } from "./overlays"

/** `index` is the line's in the mapping, `at` the row's in the view. */
type RowProps = { env: RowEnv; line: DiffLine; index: number; at: number; atCursor: boolean }

function Bar(props: {
  env: RowEnv
  bg: string | undefined
  paddingX?: number
  gap?: number
  children?: JSX.Element
}) {
  return (
    <box
      flexDirection="row"
      width={props.env.rowWidth()}
      height={1}
      flexShrink={0}
      overflow="hidden"
      backgroundColor={props.bg}
      paddingX={props.paddingX}
      gap={props.gap}
    >
      {props.children}
    </box>
  )
}

const Cell = (props: { fg: string; attributes?: number; children: string }) => (
  <text wrapMode="none" flexShrink={0} fg={props.fg} attributes={props.attributes ?? 0}>
    {props.children}
  </text>
)

/** Text faded as flash's backdrop fades the code, while flash is up. */
const dimmed = (env: RowEnv, fg: string, bg: string | undefined) => (env.flashHits() ? fade(fg, bg ?? theme.base) : fg)

const LABEL_PADDING_X = 1
const LABEL_GAP = 1
/** The cell FileLabel starts the path at: past the fold mark and the viewed mark, a cell each, and a gap after each. */
export const FILE_LABEL_PATH_X = LABEL_PADDING_X + 2 * (1 + LABEL_GAP)

/**
 * What a file's header row draws, and the sticky header for the file
 * scrolled into: one source, so the two label a file alike.
 * `cursor` is a column of the path to draw a block on; `flash` the matches
 * on the path, while flash is up.
 */
export function FileLabel(props: {
  env: RowEnv
  filename: string
  collapsed: boolean
  cursor?: number
  flash?: readonly FlashMatch[]
}) {
  const viewed = () => props.env.props.fileStatuses.get(props.filename)?.viewed ?? false
  const file = () => props.env.files().get(props.filename)
  // Unified's backdrop starts at the path: the fold and viewed markers left of it stay lit.
  const path = () =>
    buildSegments(props.filename, {
      wordSide: "added",
      baseFg: viewed() ? theme.overlay1 : theme.blue,
      rowBg: theme.surface0,
      flash: props.env.flashHits() && { matches: props.flash ?? [] },
      cursor: props.cursor,
    })
  return (
    <Bar env={props.env} bg={theme.surface0} paddingX={LABEL_PADDING_X} gap={LABEL_GAP}>
      <Cell fg={props.collapsed ? theme.overlay1 : theme.overlay0}>{props.collapsed ? "▶" : "▼"}</Cell>
      <Cell fg={viewed() ? theme.green : theme.overlay0}>{viewed() ? "✓" : " "}</Cell>
      {/* Its own box, or the bar's gap would open between the path's segments. */}
      <box flexDirection="row" flexShrink={0}>
        <SegmentTexts segments={path()} />
      </box>
      <Cell fg={dimmed(props.env, theme.green, theme.surface0)}>{`+${file()?.additions ?? 0}`}</Cell>
      <Cell fg={dimmed(props.env, theme.red, theme.surface0)}>{`-${file()?.deletions ?? 0}`}</Cell>
    </Bar>
  )
}

function FileHeader(props: RowProps) {
  const filename = props.line.filename ?? ""
  // Clamped to the path, so a column past it never pushes the stats right.
  const cursor = () => {
    const col = props.atCursor && filename ? props.env.headerCursor() : undefined
    return col === undefined ? undefined : Math.min(col, filename.length - 1)
  }
  return (
    <FileLabel
      env={props.env}
      filename={filename}
      collapsed={props.line.isCollapsed ?? false}
      cursor={cursor()}
      flash={props.env.flashHits()?.get(props.index)}
    />
  )
}

/**
 * A row of riff's own whose text starts where the code does, in split the
 * left pane's.
 * A linewise selection over it colours it as unified's lineColors colour
 * the same line, gutter and all.
 */
function ChromeRow(
  props: RowProps & {
    bg: string | undefined
    gutterTint?: string
    children?: (bg: () => string | undefined) => JSX.Element
  }
) {
  // Memoised to a boolean, so a selection moving elsewhere asks once and leaves this row's colours alone.
  const selected = createMemo(() => inLineSelection(props.env.props.selection, props.at))
  const bg = () => (props.atCursor ? cursorLineBg(props.line.type) : selected() ? theme.surface0 : props.bg)
  return (
    <Bar env={props.env} bg={bg()}>
      <box
        width={props.env.originOf(props.index)}
        height={1}
        flexShrink={0}
        backgroundColor={selected() ? theme.surface1 : props.env.chromeGutterBg(props.gutterTint, props.atCursor)}
      />
      {props.children?.(bg)}
    </Bar>
  )
}

// Chrome rather than code: it never scrolls sideways.
function Divider(props: RowProps) {
  const expanding = () => !!props.line.dividerKey && props.line.dividerKey === props.env.props.expandingDivider
  const tint = () => (expanding() ? theme.surface0 : theme.mantle)
  const label = () => dividerLabel(props.line, props.env.props.expandingDivider)
  // The `↵` is the key to press, not part of what the row says, so it is drawn as a marker.
  const hinted = () => label().endsWith(ENTER_HINT)
  return (
    <ChromeRow {...props} bg={tint()} gutterTint={tint()}>
      {(bg) => (
        <>
          <Cell fg={dimmed(props.env, theme.overlay0, bg())} attributes={TextAttributes.ITALIC}>
            {hinted() ? label().slice(0, -ENTER_HINT.length) : label()}
          </Cell>
          <Show when={hinted()}>
            <Cell fg={dimmed(props.env, theme.surface2, bg())} attributes={TextAttributes.ITALIC}>
              {ENTER_HINT}
            </Cell>
          </Show>
        </>
      )}
    </ChromeRow>
  )
}

/** A row that spans both panes. <For> keeps the row for its life, so its kind is read once. */
export function FullRow(props: RowProps) {
  switch (props.line.type) {
    case "file-header":
      return <FileHeader {...props} />
    case "divider":
      return <Divider {...props} />
    case "spacing":
      return <ChromeRow {...props} bg={undefined} />
    default: {
      const hunkHeader = props.line.type === "hunk-header"
      return (
        <ChromeRow {...props} bg={hunkHeader ? theme.surface0 : undefined}>
          {(bg) => (
            <Cell fg={dimmed(props.env, hunkHeader ? theme.overlay0 : theme.text, bg())}>{props.line.content}</Cell>
          )}
        </ChromeRow>
      )
    }
  }
}
