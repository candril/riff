import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { DiffFile } from "../utils/diff-parser"
import type { PrInfo, PrCommit, PrCheck } from "../providers/github"

/**
 * Compact summary of CI check status shown in the PR-mode header
 * (spec 041). Returns null when there are no checks so the indicator is
 * omitted entirely.
 */
function summarizeChecks(checks?: PrCheck[]): { text: string; color: string } | null {
  if (!checks?.length) return null
  let pass = 0
  let fail = 0
  let pending = 0
  for (const c of checks) {
    if (c.status !== "completed") {
      pending++
      continue
    }
    switch (c.conclusion) {
      case "success":
      case "skipped":
      case "neutral":
        pass++
        break
      case "failure":
      case "timed_out":
      case "cancelled":
      case "action_required":
        fail++
        break
      default:
        pending++
    }
  }
  if (fail > 0) return { text: `✗ ${fail}`, color: theme.red }
  if (pending > 0) return { text: `○ ${pending}`, color: theme.yellow }
  if (pass > 0) return { text: "✓", color: theme.green }
  return null
}

export interface HeaderProps {
  title?: string
  selectedFile?: DiffFile | null  // null = all files
  totalFiles?: number
  prInfo?: PrInfo | null
  reviewProgress?: { reviewed: number; total: number; outdated?: number }
  branchInfo?: string | null
  /** Currently viewing a specific commit (null = all commits) */
  viewingCommit?: string | null
  /** All available commits (for showing count) */
  commits?: PrCommit[]
}

export function Header({
  title = "riff",
  selectedFile,
  totalFiles,
  prInfo,
  reviewProgress,
  branchInfo,
  viewingCommit,
  commits,
}: HeaderProps = {}) {
  // Scope text
  const scopeText = selectedFile 
    ? selectedFile.filename 
    : totalFiles 
      ? `All files (${totalFiles})`
      : "All files"

  // Commit filter text
  const commitFilterText = (() => {
    if (!commits || commits.length === 0) return null
    if (viewingCommit === null || viewingCommit === undefined) return null
    const commit = commits.find(c => c.sha === viewingCommit)
    if (!commit) return viewingCommit.slice(0, 7)
    return `${commit.sha}: ${commit.message}`
  })()

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
      // Left side: PR status, number, author, title/commit
      Box(
        { flexDirection: "row", gap: 1, flexShrink: 1, overflow: "hidden" },
        Text({ content: statusText, fg: statusColor }),
        Text({ content: `#${prInfo.number}`, fg: theme.sapphire }),
        Text({ content: `@${prInfo.author}`, fg: theme.subtext0 }),
        commitFilterText
          ? Text({ content: commitFilterText, fg: theme.peach })
          : Text({ content: prInfo.title, fg: colors.text })
      ),
      // Right side: checks summary + progress + stats for selected file
      Box(
        { flexDirection: "row", gap: 2, flexShrink: 0 },
        (() => {
          const c = summarizeChecks(prInfo.checks)
          return c ? Text({ content: c.text, fg: c.color }) : null
        })(),
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
    // Left side: title, branch info, commit filter, scope
    Box(
      { flexDirection: "row", gap: 2, flexShrink: 1, overflow: "hidden" },
      Text({ content: title, fg: colors.headerFg }),
      ...branchElements,
      commitFilterText
        ? Text({ content: commitFilterText, fg: theme.peach })
        : null,
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
