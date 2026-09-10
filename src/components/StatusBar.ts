import { Box, Text } from "@opentui/core"
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
  /** The diff is scoped to one commit: the hints are the ones for leaving. */
  commitScoped?: boolean
}

export function StatusBar({ searchInfo, columnInfo, selectionInfo, commitScoped }: StatusBarProps = {}) {
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
  
  if (columnInfo) {
    if (rightContent.length > 0) {
      rightContent.push(Text({ content: "  ", fg: colors.statusBarFg }))
    }
    rightContent.push(
      Text({ content: `col ${columnInfo.col}/${columnInfo.total}`, fg: theme.overlay1 })
    )
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
    selectionInfo
      ? Text({
          content:
            selectionInfo.mode === "visual-line"
              ? `-- VISUAL LINE --  ${selectionInfo.lines} ${selectionInfo.lines === 1 ? "line" : "lines"}`
              : `-- VISUAL --  ${selectionInfo.lines} ${selectionInfo.lines === 1 ? "line" : "lines"}`,
          fg: theme.mauve,
        })
      : commitScoped
        ? Text({ content: "esc: all commits   ]g / [g: next / previous commit", fg: theme.peach })
        : Text({ content: "Ctrl+p: commands", fg: colors.statusBarFg }),
    rightContent.length > 0 
      ? Box({ flexDirection: "row" }, ...rightContent)
      : null
  )
}
