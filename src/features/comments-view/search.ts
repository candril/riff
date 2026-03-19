/**
 * Comment search/filter logic.
 *
 * Filters comments by matching against body text, author, and filename.
 * Uses case-insensitive substring matching for simplicity and speed.
 */

import type { Comment } from "../../types"

/**
 * Filter comments by search query.
 * Matches against body, author, and filename (case-insensitive substring).
 * 
 * If a reply matches, its root is included too (to preserve thread context).
 * If a root matches, all its replies are included.
 */
export function filterCommentsBySearch(comments: Comment[], query: string): Comment[] {
  if (!query) return comments

  const q = query.toLowerCase()

  // First pass: find which comments directly match
  const directMatches = new Set<string>()
  for (const c of comments) {
    if (
      c.body.toLowerCase().includes(q) ||
      (c.author && c.author.toLowerCase().includes(q)) ||
      c.filename.toLowerCase().includes(q)
    ) {
      directMatches.add(c.id)
    }
  }

  // Second pass: include thread context
  // If a reply matches, include the root; if a root matches, include its replies
  const included = new Set<string>(directMatches)

  // Build parent/child maps
  const byId = new Map<string, Comment>()
  for (const c of comments) byId.set(c.id, c)

  for (const id of directMatches) {
    const c = byId.get(id)!
    if (c.inReplyTo) {
      // Reply matched — walk up to include root
      let parent = c.inReplyTo ? byId.get(c.inReplyTo) : undefined
      while (parent) {
        included.add(parent.id)
        parent = parent.inReplyTo ? byId.get(parent.inReplyTo) : undefined
      }
    }
    // Root (or any comment) matched — include direct replies
    for (const other of comments) {
      if (other.inReplyTo === id) {
        included.add(other.id)
      }
    }
  }

  return comments.filter(c => included.has(c.id))
}
