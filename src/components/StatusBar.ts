import { Box, Text } from "@opentui/core"

export interface StatusBarProps {
  hints?: string[]
}

const defaultHints = ["q: quit", "?: help"]

export function StatusBar({ hints = defaultHints }: StatusBarProps = {}) {
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: "#1a1b26",
      paddingLeft: 1,
      paddingRight: 1,
    },
    Text({ content: hints.join("  "), fg: "#565f89" })
  )
}
