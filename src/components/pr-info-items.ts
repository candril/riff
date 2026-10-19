import type { PrCommit, PrConversationComment, PrCheck, PrCheckAnnotation } from "../providers/github"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow } from "../utils/previews"
import type { PRInfoPanelSection } from "../state"
import { conversationItemId, type ConversationItem, type ReviewThread, type ReviewWithThreads } from "./pr-info-conversation"

export {
  conversationItems,
  conversationItemId,
  type ConversationItem,
  type ReviewThread,
  type ReviewWithThreads,
} from "./pr-info-conversation"

/**
 * Flattened conversation item (for navigation when reviews are expanded)
 */
export type FlatConversationItem =
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review-header'; data: ReviewWithThreads }
  | { type: 'review-thread'; data: ReviewThread; parentReview: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string[] }

/**
 * Flattened check item (spec 043). Mirrors how the conversation section
 * flattens reviews+threads for single-axis cursor nav.
 */
export type FlatCheckItem =
  | { kind: 'check'; check: PrCheck }
  | { kind: 'annotation'; check: PrCheck; annotation: PrCheckAnnotation }
  | { kind: 'placeholder'; check: PrCheck; placeholder: 'loading' | 'empty' | 'error' }

export const ALL_SECTIONS: readonly PRInfoPanelSection[] = [
  'description',
  'previews',
  'checks',
  'conversation',
  'files',
  'commits',
]

/**
 * What the filter leaves. Rows are matched on the text the reader can
 * see — a filename, a commit subject, who said what.
 */
export function matchesFilter(filter: string, ...text: (string | undefined)[]): boolean {
  if (!filter) return true
  const needle = filter.toLowerCase()
  return text.some((part) => part?.toLowerCase().includes(needle))
}

export function flatConversationItemId(item: FlatConversationItem): string {
  switch (item.type) {
    case 'pr-comment':
      return String(item.data.id)
    case 'review-header':
      return item.data.id
    case 'review-thread':
      return item.data.id
    case 'pending-reviewer':
      return `pending-${item.data.join(",")}`
  }
}

/**
 * The conversation as the cursor walks it: a review's threads become rows
 * of their own under its header while its content is expanded.
 */
export function flatConversationItems(
  items: ConversationItem[],
  filter: string,
  expandedContent: ReadonlySet<string>,
): FlatConversationItem[] {
  const flat: FlatConversationItem[] = []
  const matches = (...text: (string | undefined)[]) => matchesFilter(filter, ...text)

  for (const item of items) {
    if (item.type === 'pr-comment') {
      if (matches(item.data.author, item.data.body)) flat.push(item)
    } else if (item.type === 'pending-reviewer') {
      if (matches(item.data.join(" "))) flat.push(item)
    } else if (
      // A review matches on its own text or on any thread under it —
      // otherwise filtering for a filename would hide the review that
      // holds the comment on it.
      matches(item.data.author, item.data.body, item.data.state) ||
      item.data.threads.some((thread) =>
        matches(thread.author, thread.body, thread.filename)
      )
    ) {
      flat.push({ type: 'review-header', data: item.data })

      if (expandedContent.has(conversationItemId(item)) || filter) {
        for (const thread of item.data.threads) {
          if (matches(thread.author, thread.body, thread.filename)) {
            flat.push({ type: 'review-thread', data: thread, parentReview: item.data })
          }
        }
      }
    }
  }

  return flat
}

/**
 * A check is "failing" in the sense that expanding it to view annotations
 * makes sense (spec 043). `neutral` and `skipped` don't qualify even
 * though they're technically non-success.
 */
export function isFailingCheck(check: PrCheck): boolean {
  if (check.status !== "completed") return false
  return (
    check.conclusion === "failure" ||
    check.conclusion === "timed_out" ||
    check.conclusion === "action_required"
  )
}

/**
 * Checks plus any inline annotation / placeholder rows for currently-expanded
 * failing checks (spec 043).
 */
export function flatCheckItems(
  checks: PrCheck[] | undefined,
  expandedCheckIds: ReadonlySet<number>,
  filter: string,
): FlatCheckItem[] {
  const flat: FlatCheckItem[] = []
  const visible = (checks ?? []).filter((check) =>
    matchesFilter(filter, check.name, check.conclusion ?? undefined)
  )
  for (const check of visible) {
    flat.push({ kind: 'check', check })
    if (!expandedCheckIds.has(check.id)) continue
    if (!isFailingCheck(check)) continue

    const status = check.annotationsStatus ?? 'idle'
    if (status === 'loading') {
      flat.push({ kind: 'placeholder', check, placeholder: 'loading' })
    } else if (status === 'error') {
      flat.push({ kind: 'placeholder', check, placeholder: 'error' })
    } else if (check.annotations && check.annotations.length > 0) {
      for (const annotation of check.annotations) {
        flat.push({ kind: 'annotation', check, annotation })
      }
    } else if (status === 'loaded') {
      flat.push({ kind: 'placeholder', check, placeholder: 'empty' })
    }
  }
  return flat
}

export function visibleFiles(files: DiffFile[], filter: string): DiffFile[] {
  return filter ? files.filter((file) => matchesFilter(filter, file.filename)) : files
}

export function visiblePreviews(previews: PreviewRow[], filter: string): PreviewRow[] {
  return filter
    ? previews.filter((row) =>
        matchesFilter(filter, row.app, row.status, ...row.links.map((link) => link.label))
      )
    : previews
}

export function visibleCommits(commits: PrCommit[], filter: string): PrCommit[] {
  return filter
    ? commits.filter((commit) => matchesFilter(filter, commit.message, commit.sha, commit.author))
    : commits
}
