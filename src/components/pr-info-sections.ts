import type { PrInfo } from "../providers/github/types"
import type { PRInfoPanelSection } from "../state"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewSet } from "../utils/previews"
import type { SummarySpan } from "./fit-spans"
import type { MergeStatus } from "./merge-status-model"
import { mergeHeaderSummary, openMergeSummary } from "./merge-status-summary"
import { visibleRows, type ConversationItem } from "./pr-info-items"
import {
  descriptionSummary,
  filesSummary,
  lastCommitSummary,
  previewsSummary,
  unresolvedSummary,
} from "./pr-info-summaries"

export interface SectionConfig {
  id: PRInfoPanelSection
  title: string
  /** Null for a section whose header carries no count. */
  count: number | null
  /** Appended inside the header's brackets, e.g. `(2 · 1 hidden)`. */
  countSuffix?: string
  /** What the folded header says at a glance, right after the title. */
  summary: SummarySpan[]
  /** What the open header says; only the merge verdict stays up once the section opens (spec 108). */
  openSummary?: SummarySpan[]
  hasItems: boolean
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

export function sectionConfigs(input: SectionConfigsInput): SectionConfig[] {
  const { prInfo, conversationItems, hiddenConversationIds, filter } = input
  const { commits, files, previews } = visibleRows(input, filter)
  const bodyLines = (prInfo.body || "").split("\n").filter(l => l.trim()).length

  return [
    {
      id: 'checks',
      title: 'Merge status',
      count: null,
      summary: mergeHeaderSummary(input.mergeStatus, prInfo),
      openSummary: openMergeSummary(input.mergeStatus),
      hasItems: true,
    },
    {
      id: 'description',
      title: 'Description',
      count: bodyLines,
      summary: descriptionSummary(bodyLines),
      hasItems: false,
    },
    {
      id: 'previews',
      title: 'Previews',
      count: previews.length,
      summary: previewsSummary(input.previews, previews),
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
      summary: unresolvedSummary(conversationItems),
      hasItems: conversationItems.length > 0,
    },
    {
      id: 'files',
      title: 'Files',
      count: files.length,
      summary: filesSummary(prInfo.additions, prInfo.deletions),
      hasItems: files.length > 0,
    },
    {
      id: 'commits',
      title: 'Commits',
      count: commits.length,
      summary: lastCommitSummary(commits, input.now),
      hasItems: commits.length > 0,
    },
  ]
}
