import type { Comment } from "../types"

const CONTEXT_MARKER = "<!-- context -->"

/** Reads only flat `key: value` lines, the one shape `toMarkdown` writes. */
export function parseFrontmatter(content: string): { meta: Record<string, string>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { meta: {}, body: content }
  }

  const frontmatter = match[1] ?? ""
  const bodyContent = match[2] ?? ""

  const meta: Record<string, string> = {}
  for (const line of frontmatter.split("\n")) {
    const colonIndex = line.indexOf(": ")
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const value = line.slice(colonIndex + 2).trim()
      if (key && value) {
        meta[key] = value
      }
    }
  }

  return { meta, body: bodyContent.trim() }
}

/**
 * Format:
 *   ---
 *   frontmatter...
 *   ---
 *
 *   comment body
 *
 *   <!-- context -->
 *   ```diff
 *   diff hunk...
 *   ```
 */
export function toMarkdown(comment: Comment): string {
  const lines = [
    "---",
    `id: ${comment.id}`,
    `filename: ${comment.filename}`,
    `line: ${comment.line ?? 0}`,
    `side: ${comment.side}`,
    `createdAt: ${comment.createdAt}`,
    `status: ${comment.status}`,
  ]

  if (comment.kind) lines.push(`kind: ${comment.kind}`)
  if (comment.anchorHash) lines.push(`anchorHash: ${comment.anchorHash}`)
  if (comment.startLine) lines.push(`startLine: ${comment.startLine}`)
  if (comment.commit) lines.push(`commit: ${comment.commit}`)
  if (comment.githubId) lines.push(`githubId: ${comment.githubId}`)
  if (comment.githubUrl) lines.push(`githubUrl: ${comment.githubUrl}`)
  if (comment.githubThreadId) lines.push(`githubThreadId: ${comment.githubThreadId}`)
  if (comment.isThreadResolved !== undefined) lines.push(`isThreadResolved: ${comment.isThreadResolved}`)
  if (comment.outdated !== undefined) lines.push(`outdated: ${comment.outdated}`)
  if (comment.author) lines.push(`author: ${comment.author}`)
  if (comment.inReplyTo) lines.push(`inReplyTo: ${comment.inReplyTo}`)

  lines.push("---", "", comment.body)

  if (comment.diffHunk) {
    lines.push("", CONTEXT_MARKER, "```diff", comment.diffHunk, "```")
  }

  return lines.join("\n")
}

export function parseComment(meta: Record<string, string>, body: string): Comment {
  let commentBody = body
  let diffHunk: string | undefined

  const contextIndex = body.indexOf(CONTEXT_MARKER)
  if (contextIndex !== -1) {
    commentBody = body.slice(0, contextIndex).trim()
    const contextSection = body.slice(contextIndex + CONTEXT_MARKER.length)
    const diffMatch = contextSection.match(/```diff\n([\s\S]*?)\n```/)
    if (diffMatch) {
      diffHunk = diffMatch[1]
    }
  }

  return {
    id: meta.id || "",
    filename: meta.filename || "",
    line: parseInt(meta.line || "0", 10),
    startLine: meta.startLine ? parseInt(meta.startLine, 10) : undefined,
    side: (meta.side as "LEFT" | "RIGHT") || "RIGHT",
    body: commentBody,
    createdAt: meta.createdAt || new Date().toISOString(),
    status: (meta.status as "local" | "pending" | "synced") || "local",
    kind: meta.kind === "note" ? "note" : undefined,
    anchorHash: meta.anchorHash || undefined,
    commit: meta.commit || undefined,
    diffHunk,
    githubId: meta.githubId ? parseInt(meta.githubId, 10) : undefined,
    githubUrl: meta.githubUrl || undefined,
    githubThreadId: meta.githubThreadId || undefined,
    isThreadResolved: meta.isThreadResolved === "true" ? true : meta.isThreadResolved === "false" ? false : undefined,
    outdated: meta.outdated === "true" ? true : meta.outdated === "false" ? false : undefined,
    author: meta.author || undefined,
    inReplyTo: meta.inReplyTo || undefined,
  }
}
