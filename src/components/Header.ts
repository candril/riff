import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo } from "../providers/github"

export interface HeaderProps {
  title?: string
  selectedFile?: DiffFile | null  // null = all files
  totalFiles?: number
  prInfo?: PrInfo | null
  reviewProgress?: { reviewed: number; total: number; outdated?: number }
  branchInfo?: string | null
}

export function Header({
  title = "riff",
  selectedFile,
  totalFiles,
  prInfo,
  reviewProgress,
  branchInfo,
}: HeaderProps = {}) {
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
      // Left side: PR status, number, author, title
      Box(
        { flexDirection: "row", gap: 1, flexShrink: 1, overflow: "hidden" },
        Text({ content: statusText, fg: statusColor }),
        Text({ content: `#${prInfo.number}`, fg: theme.sapphire }),
        Text({ content: `@${prInfo.author}`, fg: theme.subtext0 }),
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
  // Build branch info elements
  const branchElements: ReturnType<typeof Text>[] = []
  if (branchInfo) {
    const parts = branchInfo.split(" → ")
    if (parts.length === 2) {
      branchElements.push(
        Text({ content: parts[0], fg: theme.sapphire }),
        Text({ content: " → ", fg: theme.subtext0 }),
        Text({ content: parts[1], fg: theme.sapphire }),
      )
    } else {
      branchElements.push(Text({ content: branchInfo, fg: theme.sapphire }))
    }
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
    // Left side: title, branch info, scope
    Box(
      { flexDirection: "row", gap: 2, flexShrink: 1, overflow: "hidden" },
      Text({ content: title, fg: colors.headerFg }),
      ...branchElements,
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
