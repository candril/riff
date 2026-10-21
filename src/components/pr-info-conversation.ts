import type { PrInfo, PrReview, PrConversationComment } from "../providers/github/types"
import type { Comment, ReactionSummary } from "../types"

/**
 * Unified conversation item for display
 */
export type ConversationItem =
  | { type: 'pr-comment'; data: PrConversationComment }
  | { type: 'review'; data: ReviewWithThreads }
  | { type: 'pending-reviewer'; data: string[] }

/**
 * A review with its code comment threads
 */
export interface ReviewWithThreads {
  id: string
  /** Numeric REST id — needed to build a `{kind:"review"}` reaction target (spec 042) */
  databaseId?: number
  author: string
  state: PrReview["state"]
  body?: string
  submittedAt?: string
  threads: ReviewThread[]
  reactions?: ReactionSummary[]
}

/**
 * A code comment thread (root comment with replies)
 */
export interface ReviewThread {
  id: string
  /** Root comment's numeric GitHub id — needed to build a
   *  `{kind:"review-comment"}` reaction target (spec 042). Undefined for
   *  local (not-yet-synced) threads. */
  githubId?: number
  filename: string
  line: number
  author: string
  body: string
  createdAt: string
  url?: string
  isResolved: boolean
  diffHunk?: string
  replies: Comment[]
  reactions?: ReactionSummary[]
}

/**
 * Build conversation items from PR comments, reviews, and code comments
 */
export function conversationItems(
  prInfo: PrInfo,
  comments: Comment[],
  hiddenIds: ReadonlySet<string>,
): ConversationItem[] {
  const items: ConversationItem[] = []

  for (const comment of prInfo.conversationComments ?? []) {
    if (hiddenIds.has(String(comment.id))) continue
    items.push({ type: 'pr-comment', data: comment })
  }

  // Build thread map from code comments (root comments only)
  const threadMap = new Map<string, ReviewThread>()
  for (const comment of comments) {
    if (comment.inReplyTo) continue

    const thread: ReviewThread = {
      id: comment.id,
      githubId: comment.githubId,
      filename: comment.filename,
      line: comment.line,
      author: comment.author ?? 'you',
      body: comment.body,
      createdAt: comment.createdAt,
      url: comment.githubUrl,
      isResolved: comment.isThreadResolved ?? false,
      diffHunk: comment.diffHunk,
      replies: [],
      reactions: comment.reactions,
    }
    threadMap.set(comment.id, thread)
  }

  for (const comment of comments) {
    if (comment.inReplyTo) {
      const parentThread = threadMap.get(comment.inReplyTo)
      if (parentThread) {
        parentThread.replies.push(comment)
      }
    }
  }

  for (const thread of threadMap.values()) {
    thread.replies.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  const reviewThreadsMap = new Map<number, ReviewThread[]>()
  const orphanThreads: ReviewThread[] = [] // Threads not linked to a review

  for (const comment of comments) {
    if (comment.inReplyTo) continue
    const thread = threadMap.get(comment.id)
    if (!thread) continue

    if (comment.githubReviewId) {
      const existing = reviewThreadsMap.get(comment.githubReviewId) ?? []
      existing.push(thread)
      reviewThreadsMap.set(comment.githubReviewId, existing)
    } else {
      orphanThreads.push(thread)
    }
  }

  const reviews = prInfo.reviews ?? []
  for (const review of reviews) {
    if (review.state === "PENDING") continue

    const reviewWithThreads: ReviewWithThreads = {
      id: review.id,
      databaseId: review.databaseId,
      author: review.author,
      state: review.state,
      body: review.body,
      submittedAt: review.submittedAt,
      threads: [],
      reactions: review.reactions,
    }

    // Match using databaseId (numeric REST API ID) which matches comment.githubReviewId
    if (review.databaseId) {
      const threads = reviewThreadsMap.get(review.databaseId)
      if (threads) {
        reviewWithThreads.threads.push(...threads)
        reviewThreadsMap.delete(review.databaseId)
      }
    }

    // Skip empty COMMENTED reviews (auto-generated when posting inline comments without a body)
    if (review.state === "COMMENTED" && !review.body && reviewWithThreads.threads.length === 0) {
      continue
    }

    items.push({ type: 'review', data: reviewWithThreads })
  }

  // Add unmatched threads from reviewThreadsMap (review ID didn't match any known review)
  for (const [, threads] of reviewThreadsMap) {
    orphanThreads.push(...threads)
  }

  // Add orphan threads as standalone reviews (shouldn't happen normally)
  for (const thread of orphanThreads) {
    items.push({
      type: 'review',
      data: {
        id: `orphan-${thread.id}`,
        author: thread.author,
        state: "COMMENTED",
        threads: [thread],
      }
    })
  }

  // Collapse all pending reviewers into a single item at the end.
  // Listing each as its own row bloats the section (spec 041 polish).
  const requestedReviewers = prInfo.requestedReviewers ?? []
  const submittedReviews = prInfo.reviews ?? []
  const pendingReviewers = requestedReviewers.filter(
    r => !submittedReviews.some(rev => rev.author === r)
  )
  if (pendingReviewers.length > 0) {
    items.push({ type: 'pending-reviewer', data: pendingReviewers })
  }

  // Pending reviewers go at the end since they have no date
  items.sort((a, b) => {
    if (a.type === 'pending-reviewer') return 1
    if (b.type === 'pending-reviewer') return -1
    const dateA = a.type === 'pr-comment'
      ? a.data.createdAt
      : a.data.submittedAt ?? a.data.threads[0]?.createdAt ?? ''
    const dateB = b.type === 'pr-comment'
      ? b.data.createdAt
      : b.data.submittedAt ?? b.data.threads[0]?.createdAt ?? ''
    return new Date(dateA).getTime() - new Date(dateB).getTime()
  })

  return items
}

export function conversationItemId(item: ConversationItem): string {
  switch (item.type) {
    case 'pr-comment':
      return String(item.data.id)
    case 'review':
      return item.data.id
    case 'pending-reviewer':
      return `pending-${item.data.join(",")}`
  }
}
