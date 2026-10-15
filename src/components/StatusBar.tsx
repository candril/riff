import { Show } from "solid-js"
import { colors, theme } from "../theme"

export interface StatusBarProps {
  /** The live selection: which visual mode, and how much it covers. */
  selectionInfo?: {
    mode: "visual" | "visual-line"
    lines: number
  } | null
  /** Search match info, e.g., "1/5" or "No matches" */
  searchInfo?: {
    current: number
    total: number
    pattern: string
    wrapped?: boolean
  } | null
  /**
   * Cursor column and the line's full width, set only while the line is
   * wider than the window — how far a long line runs is invisible once
   * it leaves the screen.
   */
  columnInfo?: {
    col: number
    total: number
  } | null
}

export function StatusBar(props: StatusBarProps) {
  const hasMatches = () => (props.searchInfo?.total ?? 0) > 0
  const noMatches = () => !hasMatches() && !!props.searchInfo?.pattern
  const hasSearchText = () => hasMatches() || noMatches()
  const selectionText = () => {
    const selection = props.selectionInfo
    if (!selection) return ""
    const label = selection.mode === "visual-line" ? "-- VISUAL LINE --" : "-- VISUAL --"
    return `${label}  ${selection.lines} ${selection.lines === 1 ? "line" : "lines"}`
  }

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={colors.statusBarBg}
      paddingLeft={1}
      paddingRight={1}
      flexDirection="row"
      justifyContent="space-between"
    >
      {/* The empty box holds the left slot, so space-between keeps the counts on the right. */}
      <Show when={props.selectionInfo} fallback={<box />}>
        <text fg={theme.mauve}>{selectionText()}</text>
      </Show>
      <Show when={hasSearchText() || props.columnInfo}>
        <box flexDirection="row">
          <Show when={hasMatches()}>
            <text fg={theme.yellow}>{`${props.searchInfo?.current}/${props.searchInfo?.total}`}</text>
            <Show when={props.searchInfo?.wrapped}>
              <text fg={theme.overlay1}>{" ↺"}</text>
            </Show>
          </Show>
          <Show when={noMatches()}>
            <text fg={theme.red}>No matches</text>
          </Show>
          <Show when={props.columnInfo}>
            <Show when={hasSearchText()}>
              <text fg={colors.statusBarFg}>{"  "}</text>
            </Show>
            <text fg={theme.overlay1}>{`col ${props.columnInfo?.col}/${props.columnInfo?.total}`}</text>
          </Show>
        </box>
      </Show>
    </box>
  )
}
