import { createHash } from "node:crypto"
import type { Comment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"
import { threadRootId } from "../../utils/threads"

/** GitHub's `#diff-<hash>` anchor: the SHA-256 of the file's path, as hex. */
export function pathHash(path: string): string {
  return createHash("sha256").update(path).digest("hex")
}

/**
 * The file in the diff an anchor names. A rename is anchored by its new path;
 * the old one is checked too, since a link written against the base still
 * names it.
 */
export function fileForPathHash(files: readonly DiffFile[], hash: string): DiffFile | null {
  return (
    files.find((file) => pathHash(file.filename) === hash) ??
    files.find((file) => file.oldFilename !== undefined && pathHash(file.oldFilename) === hash) ??
    null
  )
}

/**
 * The review comment a GitHub id names, anchored where its thread is. A
 * reply is reached through its thread: the root holds the line, and the
 * reply keeps its own id so the thread panel lands on it rather than on the
 * root.
 */
export function reviewCommentForGithubId(comments: Comment[], githubId: number): Comment | null {
  const comment = comments.find((c) => c.githubId === githubId)
  if (!comment) return null
  const rootId = threadRootId(comments, comment.id)
  const root = comments.find((c) => c.id === rootId) ?? comment
  return { ...comment, filename: root.filename, line: root.line, side: root.side }
}
