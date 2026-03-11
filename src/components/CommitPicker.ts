import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import type { PrCommit } from "../providers/github"

export interface CommitPickerProps {
  query: string
  commits: FilteredCommit[]
  selectedIndex: number
  viewingCommit: string | null
}

export interface FilteredCommit {
  commit: PrCommit
  index: number  // Original index in commits array
}

/**
 * Format a relative time string
 */
function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return "now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
  return date.toLocaleDateString()
}

/**
 * Commit picker overlay for selecting a commit to filter the diff
 */
export function CommitPicker({ query, commits, selectedIndex, viewingCommit }: CommitPickerProps) {
  // Total items = 1 ("All commits") + filtered commits
  const totalItems = 1 + commits.length

  return Box(
    {
      id: "commit-picker-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
    },
    // Dim background overlay
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    // Commit picker centered
    Box(
      {
        position: "absolute",
        top: 2,
        left: "20%",
        width: "60%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      // Header row
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Select Commit", fg: theme.subtext0 }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),
      // Search input
      Box(
        {
          id: "commit-picker-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
        },
        query
          ? Text({ content: query, fg: theme.text })
          : Text({ content: "Type to search commits...", fg: theme.overlay0 })
      ),
      // Items list
      Box(
        {
          flexDirection: "column",
          paddingBottom: 1,
          maxHeight: 15,
        },
        // "All commits" option (always first)
        AllCommitsRow({
          selected: selectedIndex === 0,
          active: viewingCommit === null,
          totalCommits: commits.length,
        }),
        // Commit rows
        ...commits.slice(0, 14).map((item, i) =>
          CommitRow({
            commit: item.commit,
            selected: i + 1 === selectedIndex,
            active: viewingCommit === item.commit.sha,
          })
        ),
        // Show count if more
        totalItems > 15
          ? Box(
              { paddingX: 2 },
              Text({
                content: `... and ${totalItems - 15} more`,
                fg: theme.overlay0,
              })
            )
          : null
      ),
      // Footer hints
      Box(
        {
          flexDirection: "row",
          paddingX: 2,
          paddingTop: 1,
        },
        Text({ content: "Ctrl+n/p: navigate  Enter: select  ]g/[g: cycle", fg: theme.overlay0 })
      )
    )
  )
}

interface AllCommitsRowProps {
  selected: boolean
  active: boolean
  totalCommits: number
}

function AllCommitsRow({ selected, active, totalCommits }: AllCommitsRowProps) {
  const bg = selected ? "#585b70" : undefined
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
    },
    Box(
      { flexDirection: "row" },
      Text({ content: active ? "\u25cf " : "  ", fg: theme.green }),
      Text({ content: "All commits", fg: selected ? theme.text : theme.subtext1 })
    ),
    Text({ content: `${totalCommits} commits`, fg: theme.overlay0 })
  )
}

interface CommitRowProps {
  commit: PrCommit
  selected: boolean
  active: boolean
}

function CommitRow({ commit, selected, active }: CommitRowProps) {
  const bg = selected ? "#585b70" : undefined
  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
    },
    Box(
      { flexDirection: "row", flexShrink: 1, overflow: "hidden" },
      Text({ content: active ? "\u25cf " : "  ", fg: theme.green }),
      Text({ content: commit.sha, fg: selected ? theme.peach : theme.yellow }),
      Text({ content: "  ", fg: theme.overlay0 }),
      Text({ content: commit.message, fg: selected ? theme.text : theme.subtext1 }),
    ),
    Box(
      { flexDirection: "row", flexShrink: 0 },
      Text({ content: `@${commit.author}`, fg: theme.overlay0 }),
      Text({ content: `  ${formatTimeAgo(commit.date)}`, fg: theme.overlay0 }),
    )
  )
}
