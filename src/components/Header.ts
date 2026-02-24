import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"

export interface HeaderProps {
  title?: string
  subtitle?: string
  currentFile?: DiffFile
  fileIndex?: number
  totalFiles?: number
}

export function Header({
  title = "neoriff",
  subtitle,
  currentFile,
  fileIndex,
  totalFiles,
}: HeaderProps = {}) {
  // Build file info string
  let fileInfo = ""
  if (currentFile && typeof fileIndex === "number" && totalFiles) {
    fileInfo = `${currentFile.filename} (${fileIndex + 1}/${totalFiles})`
  }

  // Build stats string
  let stats = ""
  if (currentFile) {
    const addColor = theme.green
    const delColor = theme.red
    stats = `+${currentFile.additions} -${currentFile.deletions}`
  }

  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: colors.headerBg,
      paddingLeft: 1,
      paddingRight: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    // Left side: title and file info
    Box(
      { flexDirection: "row", gap: 2, flexShrink: 1, overflow: "hidden" },
      Text({ content: title, fg: colors.headerFg }),
      fileInfo
        ? Text({ content: fileInfo, fg: colors.text })
        : subtitle
          ? Text({ content: subtitle, fg: colors.statusBarFg })
          : null
    ),
    // Right side: stats (fixed width, won't shrink)
    currentFile
      ? Box(
          { flexDirection: "row", flexShrink: 0 },
          Text({ content: `+${currentFile.additions}`, fg: theme.green }),
          Text({ content: " ", fg: colors.text }),
          Text({ content: `-${currentFile.deletions}`, fg: theme.red })
        )
      : null
  )
}
