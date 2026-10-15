import { TextAttributes } from "@opentui/core"
import { Show, type JSX } from "solid-js"
import { cursorLineBg } from "../diff-rows/line-colors"
import { theme } from "../theme"
import type { DiffLine } from "../vim-diff/types"
import type { SplitEnv } from "./env"
import { ENTER_HINT, contentOrigin, dividerLabel } from "./layout"

type RowProps = { env: SplitEnv; line: DiffLine; atCursor: boolean }

function Bar(props: {
  env: SplitEnv
  bg: string | undefined
  paddingX?: number
  paddingLeft?: number
  gap?: number
  children?: JSX.Element
}) {
  return (
    <box
      flexDirection="row"
      width={props.env.props.width}
      height={1}
      flexShrink={0}
      overflow="hidden"
      backgroundColor={props.bg}
      paddingX={props.paddingX}
      paddingLeft={props.paddingLeft}
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

// The same row VimDiffView's FileHeader builds, so the two views label a file alike.
function FileHeader(props: RowProps) {
  const filename = props.line.filename ?? ""
  const collapsed = props.line.isCollapsed ?? false
  const viewed = () => props.env.props.fileStatuses.get(filename)?.viewed ?? false
  const file = () => props.env.files().get(filename)
  return (
    <Bar env={props.env} bg={theme.surface0} paddingX={1} gap={1}>
      <Cell fg={collapsed ? theme.overlay1 : theme.overlay0}>{collapsed ? "▶" : "▼"}</Cell>
      <Cell fg={viewed() ? theme.green : theme.overlay0}>{viewed() ? "✓" : " "}</Cell>
      <Cell fg={viewed() ? theme.overlay1 : theme.blue}>{filename}</Cell>
      <Cell fg={theme.green}>{`+${file()?.additions ?? 0}`}</Cell>
      <Cell fg={theme.red}>{`-${file()?.deletions ?? 0}`}</Cell>
    </Bar>
  )
}

// Chrome rather than code: it starts where the left pane's code does and never scrolls sideways.
function Divider(props: RowProps) {
  const expanding = () => !!props.line.dividerKey && props.line.dividerKey === props.env.props.expandingDivider
  const label = () => dividerLabel(props.line, props.env.props.expandingDivider)
  // The `↵` is the key to press, not part of what the row says, so it is drawn as a marker.
  const hinted = () => label().endsWith(ENTER_HINT)
  const bg = () => (props.atCursor ? cursorLineBg("divider") : expanding() ? theme.surface0 : theme.mantle)
  return (
    <Bar env={props.env} bg={bg()} paddingLeft={contentOrigin(props.env.gutter())}>
      <Cell fg={theme.overlay0} attributes={TextAttributes.ITALIC}>
        {hinted() ? label().slice(0, -ENTER_HINT.length) : label()}
      </Cell>
      <Show when={hinted()}>
        <Cell fg={theme.surface2} attributes={TextAttributes.ITALIC}>
          {ENTER_HINT}
        </Cell>
      </Show>
    </Bar>
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
      return <Bar env={props.env} bg={props.atCursor ? cursorLineBg("spacing") : undefined} />
    default:
      return (
        <Bar
          env={props.env}
          bg={props.atCursor ? cursorLineBg(props.line.type) : props.line.type === "hunk-header" ? theme.surface0 : undefined}
          paddingLeft={contentOrigin(props.env.gutter())}
        >
          <Cell fg={props.line.type === "hunk-header" ? theme.overlay0 : theme.text}>{props.line.content}</Cell>
        </Bar>
      )
  }
}
