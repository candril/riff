import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"

export interface StatusBarProps {
  /** Search match info, e.g., "1/5" or "No matches" */
  searchInfo?: {
    current: number
    total: number
    pattern: string
    wrapped?: boolean
  } | null
}

export function StatusBar({ searchInfo }: StatusBarProps = {}) {
  // Build right side content
  const rightContent: ReturnType<typeof Text>[] = []
  
  // Add search info if present
  if (searchInfo) {
    if (searchInfo.total > 0) {
      const matchText = `${searchInfo.current}/${searchInfo.total}`
      rightContent.push(Text({ content: matchText, fg: theme.yellow }))
      
      if (searchInfo.wrapped) {
        rightContent.push(Text({ content: " ↺", fg: theme.overlay1 }))
      }
    } else if (searchInfo.pattern) {
      rightContent.push(Text({ content: "No matches", fg: theme.red }))
    }
  }
  
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
    Text({ content: "Ctrl+p: commands", fg: colors.statusBarFg }),
    rightContent.length > 0 
      ? Box({ flexDirection: "row" }, ...rightContent)
      : null
  )
}
