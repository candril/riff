import type { PrCommit, PrConversationComment, PrCheck, PrCheckAnnotation, PrInfo } from "../providers/github/types"
import type { DiffFile } from "../utils/diff-parser"
import type { PreviewRow, PreviewSet } from "../utils/previews"
import type { PRInfoPanelSection } from "../state"
import type { Comment } from "../types"
import type { MergePoint } from "./merge-status-model"
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
 * A row of the Merge status section: a gate, under the checks gate a check
 * and its annotations, or under the conversations gate an unresolved thread
 * (specs 043, 108). Mirrors how the conversation section
 * flattens reviews+threads for single-axis cursor nav.
 */
export type FlatCheckItem =
  | { kind: 'point'; point: MergePoint }
  | { kind: 'check'; check: PrCheck }
  | { kind: 'annotation'; check: PrCheck; annotation: PrCheckAnnotation }
  | { kind: 'placeholder'; check: PrCheck; placeholder: 'loading' | 'empty' | 'error' }
  | { kind: 'thread'; thread: Comment }

export const ALL_SECTIONS: readonly PRInfoPanelSection[] = [
  'checks',
  'description',
  'previews',
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

export const POINT_LABELS: Record<MergePoint["id"], string> = {
  checks: "Checks",
  reviews: "Reviews",
  conversations: "Conversations",
  conflicts: "Conflicts",
  base: "Base",
  blockers: "Blockers",
}

/** What the merge status lines open onto. */
export interface MergeRows {
  checks: PrCheck[] | undefined
  threads: readonly Comment[]
}

/** The gates that open onto rows of their own, and only once there is something under them. */
export function isExpandablePoint(point: MergePoint, { checks, threads }: MergeRows): boolean {
  if (point.id === 'checks') return (checks ?? []).length > 0
  return point.id === 'conversations' && threads.length > 0
}

/**
 * One row per gate, and while a line is open or a filter is set, the rows
 * under it: under the checks gate each check plus any inline annotation /
 * placeholder rows for currently-expanded failing checks, under the
 * conversations gate each unresolved thread (specs 043, 108).
 */
export function flatCheckItems(
  points: readonly MergePoint[],
  source: MergeRows,
  { expandedCheckIds, expandedPoints, filter }: {
    expandedCheckIds: ReadonlySet<number>
    expandedPoints: ReadonlySet<MergePoint["id"]>
    filter: string
  },
): FlatCheckItem[] {
  const flat: FlatCheckItem[] = []
  const under: Partial<Record<MergePoint["id"], FlatCheckItem[]>> = {
    checks: checkRowsOf(
      (source.checks ?? []).filter((check) => matchesFilter(filter, check.name, check.conclusion ?? undefined)),
      expandedCheckIds,
    ),
    conversations: source.threads
      .filter((thread) => matchesFilter(filter, thread.author, thread.body, thread.filename))
      .map((thread) => ({ kind: 'thread', thread })),
  }
  for (const point of points) {
    const rows = isExpandablePoint(point, source) ? (under[point.id] ?? []) : []
    // A line matches on any row under it too, the way a review matches on
    // its threads.
    const holdsMatch = filter !== "" && rows.length > 0
    if (!matchesFilter(filter, POINT_LABELS[point.id], point.text) && !holdsMatch) continue
    flat.push({ kind: 'point', point })
    if (expandedPoints.has(point.id) || filter) flat.push(...rows)
  }
  return flat
}

function checkRowsOf(visible: PrCheck[], expandedCheckIds: ReadonlySet<number>): FlatCheckItem[] {
  const flat: FlatCheckItem[] = []
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

/** The rows of the filterable lists the panel draws and counts. */
export interface VisibleRows {
  files: DiffFile[]
  previews: PreviewRow[]
  commits: PrCommit[]
}

/**
 * What a filter leaves of the files, previews and commits. Every reader —
 * the headers' counts, the cursor's bounds, the rows drawn and what a row
 * under the cursor is — asks here, so they cannot disagree about a row.
 */
export function visibleRows(
  source: { prInfo: Pick<PrInfo, "commits">; files: DiffFile[]; previews: PreviewSet | null },
  filter: string
): VisibleRows {
  return {
    files: visibleFiles(source.files, filter),
    previews: visiblePreviews(source.previews?.rows ?? [], filter),
    commits: visibleCommits(source.prInfo.commits ?? [], filter),
  }
}
