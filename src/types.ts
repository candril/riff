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
  isThreadResolved?: boolean // Thread resolution state (only on root comments)
  author?: string // GitHub username (for others' comments)
  inReplyTo?: string // Parent comment ID for threads
  
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
