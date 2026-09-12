/**
 * Which comments the view riff opened is actually about (spec 085).
 *
 * A note is anchored to a line of a file, not to a line of a diff, so the
 * same `.riff/` store holds notes about code the current diff has never
 * heard of. Listing those beside a pull request's comments would make the
 * panel a pile of remarks about elsewhere.
 *
 * Ordinary review comments are never filtered: they were written against
 * this diff, and one that has drifted out of it is information, not noise.
 */

import type { Comment } from "../types"
import type { DiffFile } from "./diff-parser"
import { isNote } from "./publishable"

/** The line ranges a file's diff covers, per side. */
function covered(content: string, side: "LEFT" | "RIGHT"): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  for (const line of content.split("\n")) {
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (!hunk) continue
    const start = parseInt((side === "LEFT" ? hunk[1] : hunk[3])!, 10)
    const count = parseInt((side === "LEFT" ? hunk[2] : hunk[4]) ?? "1", 10)
    if (count > 0) ranges.push([start, start + count - 1])
  }
  return ranges
}

/**
 * Whether riff has a row for this comment — read off the hunks rather than
 * off a built mapping, so folding a file, filtering the tree or collapsing a
 * block does not make a comment disappear from the panel.
 */
function hasRow(comment: Comment, files: DiffFile[], fileMode: boolean): boolean {
  const file = files.find((f) => f.filename === comment.filename)
  if (!file) return false
  // File mode shows whole files, and reads one only when it is opened — so
  // being listed is the whole of the question there (spec 084).
  if (fileMode) return true
  return covered(file.content, comment.side).some(
    ([start, end]) => comment.line >= start && comment.line <= end,
  )
}

/** The comments this view should show. */
export function commentsInView(
  comments: Comment[],
  files: DiffFile[],
  fileMode: boolean,
): Comment[] {
  const kept = comments.filter((c) => !isNote(c) || hasRow(c, files, fileMode))
  const ids = new Set(kept.map((c) => c.id))
  // A reply to a note riff is not showing has nowhere to be either.
  return kept.filter((c) => !c.inReplyTo || ids.has(c.inReplyTo))
}
