import type { Comment } from "../types"

/**
 * A thread is a root comment plus all its replies
 */
export interface Thread {
  id: string                    // Root comment's ID
  githubThreadId?: string       // GitHub's node_id for GraphQL API (resolve/unresolve)
  filename: string
  line: number
  comments: Comment[]           // Root + replies, chronological order
  resolved: boolean
  outdated: boolean             // GitHub flagged this thread as outdated (line moved)
}

/**
 * Whether GitHub holds this root's thread open. A local thread has no
 * resolution of its own on GitHub, so it never counts as unresolved, however
 * it is drawn.
 */
export function heldOpen(root: Comment): boolean {
  return !root.inReplyTo && root.isThreadResolved === false
}

/**
 * Whether a thread renders collapsed (header only) in the inline comment
 * overlay. `toggledThreadIds` holds the threads the user has flipped away
 * from their default fold state with `za`: resolved threads default to
 * collapsed (keeps long-since-resolved discussions scannable), every other
 * thread defaults to expanded. Navigation (display order) and rendering
 * both key off this so j/k only lands on drawn comments.
 */
export function isThreadCollapsed(
  thread: Thread,
  toggledThreadIds: ReadonlySet<string>
): boolean {
  return thread.resolved !== toggledThreadIds.has(thread.id)
}

/**
 * Group comments into threads by file and line.
 * Returns threads sorted by filename, then line number.
 */
export function groupIntoThreads(comments: Comment[]): Thread[] {
  if (comments.length === 0) return []
  
  // Find root comments (no inReplyTo, or inReplyTo points to unknown comment)
  const commentIds = new Set(comments.map(c => c.id))
  const roots = comments.filter(c => !c.inReplyTo || !commentIds.has(c.inReplyTo))
  
  // Build reply map: parentId -> replies
  const replyMap = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.inReplyTo && commentIds.has(c.inReplyTo)) {
      const replies = replyMap.get(c.inReplyTo) || []
      replies.push(c)
      replyMap.set(c.inReplyTo, replies)
    }
  }
  
  // Build threads from roots
  const threads: Thread[] = roots.map(root => {
    const threadComments = collectReplies(root, replyMap)
    return {
      id: root.id,
      githubThreadId: root.githubThreadId, // For GraphQL resolve/unresolve
      filename: root.filename,
      line: root.line,
      comments: threadComments,
      resolved: root.isThreadResolved ?? false, // Use resolved state from root comment
      outdated: root.outdated ?? false, // Outdated state from root comment
    }
  })
  
  // Sort by filename, then line
  threads.sort((a, b) => {
    const fileCompare = a.filename.localeCompare(b.filename)
    if (fileCompare !== 0) return fileCompare
    return a.line - b.line
  })
  
  return threads
}

/**
 * Recursively collect a root comment and all its replies in chronological order
 */
function collectReplies(root: Comment, replyMap: Map<string, Comment[]>): Comment[] {
  const result = [root]
  const queue = [root.id]
  
  while (queue.length > 0) {
    const id = queue.shift()!
    const replies = replyMap.get(id) || []
    // Sort replies by creation time
    const sortedReplies = replies.sort((a, b) => 
      a.createdAt.localeCompare(b.createdAt)
    )
    for (const reply of sortedReplies) {
      result.push(reply)
      queue.push(reply.id)
    }
  }
  
  return result
}

/**
 * Count threads per file
 */
export function countThreadsPerFile(threads: Thread[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const thread of threads) {
    counts.set(thread.filename, (counts.get(thread.filename) || 0) + 1)
  }
  return counts
}

/**
 * Get total comment count
 */
export function countComments(threads: Thread[]): number {
  return threads.reduce((sum, t) => sum + t.comments.length, 0)
}
