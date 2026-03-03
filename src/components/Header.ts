import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo } from "../providers/github"
import type { ViewMode } from "../state"

export interface HeaderProps {
  title?: string
  viewMode?: ViewMode
  selectedFile?: DiffFile | null  // null = all files
  totalFiles?: number
  prInfo?: PrInfo | null
  reviewProgress?: { reviewed: number; total: number; outdated?: number }
}

export function Header({
  title = "riff",
  viewMode = "diff",
  selectedFile,
  totalFiles,
  prInfo,
  reviewProgress,
}: HeaderProps = {}) {
  // View mode badge
  const viewBadge = viewMode === "diff" ? "Diff" : "Comments"
  const viewBadgeColor = viewMode === "diff" ? theme.blue : theme.mauve
  
  // Scope text
  const scopeText = selectedFile 
    ? selectedFile.filename 
    : totalFiles 
      ? `All files (${totalFiles})`
      : "All files"

  // Review progress text (e.g., "3/5 reviewed" or "3/5 reviewed (1 outdated)")
  const hasOutdated = reviewProgress && (reviewProgress.outdated ?? 0) > 0
  const progressText = reviewProgress && reviewProgress.total > 0
    ? hasOutdated
      ? `${reviewProgress.reviewed}/${reviewProgress.total} reviewed (${reviewProgress.outdated} outdated)`
      : `${reviewProgress.reviewed}/${reviewProgress.total} reviewed`
    : null
  const progressColor = hasOutdated
    ? theme.peach  // Has outdated files
    : reviewProgress && reviewProgress.reviewed === reviewProgress.total
      ? theme.green  // All done!
      : theme.subtext0

  // PR mode header
  if (prInfo) {
    // PR status badge
    const statusText = prInfo.isDraft 
      ? "Draft" 
      : prInfo.state === "merged" 
        ? "Merged" 
        : prInfo.state === "closed" 
          ? "Closed" 
          : "Open"
    const statusColor = prInfo.isDraft
      ? theme.overlay1      // Gray for draft
      : prInfo.state === "merged"
        ? theme.mauve       // Purple for merged
        : prInfo.state === "closed"
          ? theme.red       // Red for closed
          : theme.green     // Green for open

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
      // Left side: view mode, PR status, number, title
      Box(
        { flexDirection: "row", gap: 1, flexShrink: 1, overflow: "hidden" },
        Text({ content: `[${viewBadge}]`, fg: viewBadgeColor }),
        Text({ content: statusText, fg: statusColor }),
        Text({ content: `#${prInfo.number}`, fg: theme.sapphire }),
        Text({ content: prInfo.title, fg: colors.text })
      ),
      // Right side: progress + stats for selected file
      Box(
        { flexDirection: "row", gap: 2, flexShrink: 0 },
        progressText ? Text({ content: progressText, fg: progressColor }) : null,
        selectedFile
          ? Box(
              { flexDirection: "row" },
              Text({ content: `+${selectedFile.additions}`, fg: theme.green }),
              Text({ content: " ", fg: colors.text }),
              Text({ content: `-${selectedFile.deletions}`, fg: theme.red })
            )
          : null
      )
    )
  }

  // Local mode header
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
    // Left side: view mode, title, scope
    Box(
      { flexDirection: "row", gap: 2, flexShrink: 1, overflow: "hidden" },
      Text({ content: `[${viewBadge}]`, fg: viewBadgeColor }),
      Text({ content: title, fg: colors.headerFg }),
      Text({ content: scopeText, fg: colors.text })
    ),
    // Right side: progress + stats for selected file
    Box(
      { flexDirection: "row", gap: 2, flexShrink: 0 },
      progressText ? Text({ content: progressText, fg: progressColor }) : null,
      selectedFile
        ? Box(
            { flexDirection: "row" },
            Text({ content: `+${selectedFile.additions}`, fg: theme.green }),
            Text({ content: " ", fg: colors.text }),
            Text({ content: `-${selectedFile.deletions}`, fg: theme.red })
          )
        : null
    )
  )
}
