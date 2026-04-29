/**
 * GitHub reaction content values (spec 042).
 */
export const REACTION_CONTENT = [
  "+1", "-1", "laugh", "confused", "heart", "hooray", "rocket", "eyes",
] as const
export type ReactionContent = typeof REACTION_CONTENT[number]

/**
 * Display metadata for each reaction. The label is what the command-palette
 * submenu matches against for fuzzy search, so "rocket" matches 🚀,
 * "thumbs" matches 👍/👎, etc.
 */
export const REACTION_META: Record<ReactionContent, { emoji: string; label: string }> = {
  "+1":     { emoji: "👍", label: "Thumbs up" },
  "-1":     { emoji: "👎", label: "Thumbs down" },
  laugh:    { emoji: "😄", label: "Laugh" },
  confused: { emoji: "😕", label: "Confused" },
  heart:    { emoji: "❤️",  label: "Heart" },
  hooray:   { emoji: "🎉", label: "Hooray" },
  rocket:   { emoji: "🚀", label: "Rocket" },
  eyes:     { emoji: "👀", label: "Eyes" },
}

/**
 * Aggregated reaction state for a single content value on a single reactable
 * item. `viewerReactionId` is only populated after an add through riff —
 * GraphQL's `reactionGroups` gives us `viewerHasReacted` but not the
 * per-reaction REST id. Without it, the remove path has to do a lookup
 * (spec 042).
 */
export interface ReactionSummary {
  content: ReactionContent
  count: number
  viewerHasReacted: boolean
  viewerReactionId?: number
}

/**
 * Identifies which GitHub entity a reaction targets. The action menu's
 * "React…" submenu carries this so the toggle handler knows which REST
 * endpoint to hit.
 */
export type ReactionTarget =
  | { kind: "review-comment"; githubId: number }
  | { kind: "issue-comment"; githubId: number }
  | { kind: "review"; reviewId: number; prNumber: number }
  | { kind: "issue"; prNumber: number }

/**
 * A comment on a specific line in a diff.
 * Stored as individual markdown files with YAML frontmatter.
 */
export interface Comment {
  id: string
  filename: string
  line: number // Line number in the new file (right side)
  side: "LEFT" | "RIGHT" // Which side of the diff
  body: string
  createdAt: string
  status: "local" | "pending" | "synced"

  // Link to specific revision
  commit?: string // Git commit hash or jj change ID

  // Code context - the diff hunk or line the comment refers to
  diffHunk?: string // Diff context from GitHub (or extracted locally)

  // GitHub sync (populated after submission or fetch)
  githubId?: number
  githubUrl?: string
  githubThreadId?: string // GitHub's node_id for the review thread (for GraphQL API)
  githubReviewId?: number // The pull_request_review_id that this comment belongs to
  isThreadResolved?: boolean // Thread resolution state (only on root comments)
  // Thread is outdated on GitHub — its anchor lines no longer match the
  // current PR head. Only set on root comments; replies inherit via the
  // surrounding Thread.
  outdated?: boolean
  author?: string // GitHub username (for others' comments)
  inReplyTo?: string // Parent comment ID for threads

  // Reactions (spec 042). Populated from GraphQL `reactionGroups` on PR load
  // and updated optimistically during toggles. Undefined/empty = no reactions.
  reactions?: ReactionSummary[]

  // Local edits to synced comments (body differs from what's on GitHub)
  // When set, this is the edited version; body contains the original GitHub version
  localEdit?: string
}

/**
 * A review session - metadata only, comments stored as separate files.
 */
export interface ReviewSession {
  id: string
  source: string // "local", "branch:main", "gh:owner/repo#123"
  createdAt: string
  updatedAt: string

  // GitHub-specific (only for PR sessions)
  prNumber?: number
  owner?: string
  repo?: string
  reviewMode?: "single" | "review"
  pendingReviewId?: string
}

/**
 * Create a new comment
 */
export function createComment(
  filename: string,
  line: number,
  body: string,
  side: "LEFT" | "RIGHT" = "RIGHT",
  author?: string
): Comment {
  return {
    id: crypto.randomUUID(),
    filename,
    line,
    side,
    body,
    createdAt: new Date().toISOString(),
    status: "local",
    author,
  }
}

/**
 * Create a new review session
 */
export function createSession(source: string): ReviewSession {
  return {
    id: crypto.randomUUID(),
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

/**
 * App mode - local diff or PR review
 */
export type AppMode = "local" | "pr"

/**
 * File review status - tracks whether a file has been viewed/reviewed
 * Extended with GitHub sync and change detection capabilities
 */
export interface FileReviewStatus {
  filename: string
  viewed: boolean
  viewedAt?: string           // ISO timestamp when marked viewed
  viewedAtCommit?: string     // Commit SHA when marked viewed
  
  // Change detection (populated by refreshViewedStatuses)
  isStale?: boolean           // True if file changed since viewed
  staleCommits?: number       // Number of commits since viewed
  latestCommit?: string       // Current HEAD commit for this file
  
  // GitHub sync
  githubSynced?: boolean      // True if synced to GitHub
  syncedAt?: string           // When last synced to GitHub
}

/**
 * Viewed status statistics
 */
export interface ViewedStats {
  total: number
  viewed: number
  outdated: number            // Viewed but changed since
}
