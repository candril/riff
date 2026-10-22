import type { PrCommit, PrInfo } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow, PreviewSet } from "../utils/previews"
import { pointStyle, type MergeStatus } from "./merge-status-model"
import { formatTimeAgo } from "./pr-info-format"
import { visibleRows, type ConversationItem } from "./pr-info-items"

export interface SectionConfig {
  id: PRInfoPanelSection
  title: string
  /** Null for a section whose header carries no count. */
  count: number | null
  /** Appended inside the header's brackets, e.g. `(2 · 1 hidden)`. */
  countSuffix?: string
  preview: string
  hasItems: boolean
  /** Drawn at the header's right end, folded or not: the merge verdict (spec 108). */
  trailing?: { text: string; fg: string }
}

export interface SectionConfigsInput {
  prInfo: PrInfo
  files: DiffFile[]
  previews: PreviewSet | null
  conversationItems: ConversationItem[]
  hiddenConversationIds: ReadonlySet<string>
  mergeStatus: MergeStatus
  filter: string
  now?: number
}

/**
 * A collapsed Previews header says who posted them and when — the rows
 * themselves are one line per app (spec 068).
 */
export function previewsSummary(previews: PreviewSet | null, visible: PreviewRow[]): string {
  if (!previews) return ""
  const live = visible.filter((row) => row.links.length > 0).length
  const other = visible.length - live
  const counts = [live > 0 ? `${live} live` : null, other > 0 ? `${other} on demand` : null]
    .filter(Boolean)
    .join(" · ")
  return `${counts}${counts ? "  ·  " : ""}from ${previews.author}`
}

/**
 * What a collapsed Conversation header says at a glance (spec 067): what
 * is still open, since a resolved thread is not something to come back to.
 */
export function unresolvedSummary(conversationItems: ConversationItem[]): string {
  let unresolved = 0
  for (const item of conversationItems) {
    if (item.type !== 'review') continue
    unresolved += item.data.threads.filter((thread) => !thread.isResolved).length
  }
  return unresolved > 0 ? `${unresolved} unresolved` : ""
}

/** And what a collapsed Commits header says: when the last one landed. */
export function lastCommitSummary(commits: PrCommit[], now: number = Date.now()): string {
  const last = commits[commits.length - 1]
  return last ? `last ${formatTimeAgo(last.date, now)}` : ""
}

const VERDICT_STATES = { ready: "ok", warnings: "warn", blocked: "fail" } as const

export function sectionConfigs(input: SectionConfigsInput): SectionConfig[] {
  const { prInfo, conversationItems, hiddenConversationIds, filter } = input
  const { commits, files, previews } = visibleRows(input, filter)
  const bodyLines = (prInfo.body || "").split("\n").filter(l => l.trim()).length
  const { verdict, verdictText } = input.mergeStatus

  return [
    {
      id: 'checks',
      title: 'Merge status',
      count: null,
      preview: "",
      hasItems: true,
      trailing: { text: verdictText, fg: pointStyle(VERDICT_STATES[verdict]).fg },
    },
    {
      id: 'description',
      title: 'Description',
      count: bodyLines,
      preview: bodyLines > 0 ? `${bodyLines} lines` : "empty",
      hasItems: false,
    },
    {
      id: 'previews',
      title: 'Previews',
      count: previews.length,
      preview: previewsSummary(input.previews, previews),
      hasItems: previews.length > 0,
    },
    {
      id: 'conversation',
      title: 'Conversation',
      count: conversationItems.length,
      // A comment whose content has been lifted into a section of its own
      // is folded away here rather than dropped, and the header says so
      // (spec 067).
      countSuffix: hiddenConversationIds.size > 0
        ? ` · ${hiddenConversationIds.size} hidden`
        : undefined,
      preview: unresolvedSummary(conversationItems),
      hasItems: conversationItems.length > 0,
    },
    {
      id: 'files',
      title: 'Files',
      count: files.length,
      preview: `+${prInfo.additions} -${prInfo.deletions}`,
      hasItems: files.length > 0,
    },
    {
      id: 'commits',
      title: 'Commits',
      count: commits.length,
      preview: lastCommitSummary(commits, input.now),
      hasItems: commits.length > 0,
    },
  ]
}
