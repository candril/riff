import { Box, Text } from "@opentui/core"
import { colors } from "../theme"

export interface HeaderProps {
  title?: string
  subtitle?: string
}

export function Header({ title = "neoriff", subtitle }: HeaderProps = {}) {
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.headerBg,
      paddingLeft: 1,
      paddingRight: 1,
      justifyContent: "space-between",
    },
    Text({ content: title, fg: colors.headerFg }),
    subtitle ? Text({ content: subtitle, fg: colors.statusBarFg }) : null
  )
}
