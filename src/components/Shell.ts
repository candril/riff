import { Box, Text } from "@opentui/core"
import type { VChild } from "@opentui/core"
import { Header, type HeaderProps } from "./Header"
import { StatusBar, type StatusBarProps } from "./StatusBar"
import { colors } from "../theme"

export interface ShellProps {
  header?: HeaderProps
  statusBar?: StatusBarProps
  children?: VChild
}

export function Shell({ header, statusBar, children }: ShellProps = {}) {
  return Box(
    {
      width: "100%",
      height: "100%",
      flexDirection: "column",
    },
    // Header
    Header(header),
    // Main content area
    Box(
      {
        flexGrow: 1,
        width: "100%",
        flexDirection: "column",
      },
      children ?? Text({ content: "No content", fg: colors.textDim })
    ),
    // Status bar
    StatusBar(statusBar)
  )
}
