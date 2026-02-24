import { Box, Text } from "@opentui/core"

export interface HeaderProps {
  title?: string
  subtitle?: string
}

export function Header({ title = "neoriff", subtitle }: HeaderProps = {}) {
  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: "#1a1b26",
      paddingLeft: 1,
      paddingRight: 1,
      justifyContent: "space-between",
    },
    Text({ content: title, fg: "#7aa2f7" }),
    subtitle ? Text({ content: subtitle, fg: "#565f89" }) : null
  )
}
