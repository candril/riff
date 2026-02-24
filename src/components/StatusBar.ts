import { Box, Text } from "@opentui/core"
import { colors } from "../theme"

export interface StatusBarProps {
  hints?: string[]
}

const defaultHints = ["q: quit", "?: help"]

export function StatusBar({ hints = defaultHints }: StatusBarProps = {}) {
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.statusBarBg,
      paddingLeft: 1,
      paddingRight: 1,
    },
    Text({ content: hints.join("  "), fg: colors.statusBarFg })
  )
}
