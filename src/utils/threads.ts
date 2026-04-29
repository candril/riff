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
 * Flattened item for navigation in comments view
 */
export interface ThreadNavItem {
  type: "file-header" | "comment"
  filename?: string             // For file-header
  comment?: Comment             // For comment
  thread?: Thread               // Parent thread
  isRoot?: boolean              // Is this the root comment of a thread?
  isLastInThread?: boolean      // Is this the last comment in the thread?
  indent: number                // Indentation level (0 for root, 1 for replies)
  isCollapsed?: boolean         // Is this thread currently collapsed?
  replyCount?: number           // Number of hidden replies (when collapsed)
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
 * Flatten threads into navigable items for the comments view.
 * When showFileHeaders is true, includes file separator headers.
 * When collapsedThreadIds is provided, collapsed threads only show the root comment.
 */
export function flattenThreadsForNav(
  threads: Thread[], 
  showFileHeaders: boolean,
  collapsedThreadIds?: Set<string>
): ThreadNavItem[] {
  const items: ThreadNavItem[] = []
  let currentFile = ""
  
  for (const thread of threads) {
    // Add file header if showing all files and file changed
    if (showFileHeaders && thread.filename !== currentFile) {
      currentFile = thread.filename
      items.push({
        type: "file-header",
        filename: currentFile,
        indent: 0,
      })
    }
    
    const isCollapsed = collapsedThreadIds?.has(thread.id) ?? false
    const replyCount = thread.comments.length - 1
    
    if (isCollapsed) {
      // Only show root comment when collapsed
      const rootComment = thread.comments[0]
      if (rootComment) {
        items.push({
          type: "comment",
          comment: rootComment,
          thread,
          isRoot: true,
          isLastInThread: true,
          indent: 0,
          isCollapsed: true,
          replyCount,
        })
      }
    } else {
      // Show all comments when expanded
      for (let i = 0; i < thread.comments.length; i++) {
        const comment = thread.comments[i]!
        const isRoot = i === 0
        const isLastInThread = i === thread.comments.length - 1
        items.push({
          type: "comment",
          comment,
          thread,
          isRoot,
          isLastInThread,
          indent: isRoot ? 0 : 1,
          isCollapsed: false,
        })
      }
    }
  }
  
  return items
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
