import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"

export interface StatusBarProps {
  hints?: string[]
  /** Current line info, e.g., "L:42" */
  lineInfo?: string
}

const defaultHints = ["q: quit", "?: help"]

export function StatusBar({ hints = defaultHints, lineInfo }: StatusBarProps = {}) {
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.statusBarBg,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
    },
    Text({ content: hints.join("  "), fg: colors.statusBarFg }),
    lineInfo 
      ? Text({ content: lineInfo, fg: theme.blue })
      : null
  )
}
