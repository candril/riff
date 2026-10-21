/**
 * The buffers riff hands $EDITOR for a comment, and how it reads them back.
 * Pure, so a round trip can be tested without spawning anything.
 */

import type { Comment } from "../../types"
import { extractContextHunk } from "./diff-context"

export interface EditorOptions {
  /** The diff content to show as context */
  diffContent: string
  /** File path being commented on */
  filePath: string
  /** Line number being commented on */
  line: number
  /** Which side of the diff the anchor sits on. */
  side?: "LEFT" | "RIGHT"
  /** Thread of comments on this line */
  thread?: Comment[]
  /** Current username (GitHub username or "@you" for local) */
  username?: string
  /** Diff rows around the anchor. Falls back to slicing `diffContent`
   *  when the caller has no line mapping to slice with. */
  contextHunk?: string
  /** Whole-file diff. Defaults to `diffContent`, which is only the
   *  selection when the comment came from a visual-line range. */
  fullDiff?: string
  /** The anchored row itself, `+`/`-` marker intact. */
  anchorLine?: string
  /** File status ("modified", "added", …) for the anchor header. */
  changeStatus?: string
}

/**
 * Context handed to `openTextInEditor` so the composer's Ctrl-g
 * hand-off shows the same thread and diff the `C` route builds.
 */
export interface DraftEditorContext {
  filePath: string
  line: number
  side: "LEFT" | "RIGHT"
  contextHunk?: string
  fullDiff?: string
  anchorLine?: string
  /** Comments already on this anchor. Read-only in this buffer — only
   *  the text above the marker is read back. */
  thread?: Comment[]
  username?: string
  changeStatus?: string
}

export interface EditorResult {
  /** New reply text (empty string if none) */
  newReply: string
  /** Map of comment ID -> updated body for edited comments */
  editedComments: Map<string, string>
}

export const MARKER_COMMENT_END = "<!-- Write your comment above this line -->"
const MARKER_ANCHOR = "## Commenting on"
const MARKER_THREAD = "## Thread"
const MARKER_CONTEXT = "## Context"
const MARKER_FULL_CHANGE = "## Full Change"

/**
 * Wrap `text` as markdown inline code, widening the fence past any
 * backtick run inside it — diff rows carry template literals.
 */
function inlineCode(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const fence = "`".repeat(longest + 1)
  const pad = longest > 0 ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}

/**
 * Get short ID for display (first 8 chars or gh-id)
 */
function shortId(id: string): string {
  if (id.startsWith("gh-")) return id
  return id.slice(0, 8)
}

/**
 * Format relative time (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Get status label for HTML comment (without brackets)
 */
function getStatusText(comment: Comment): string {
  if (comment.status === "synced" && comment.localEdit !== undefined) {
    return "edited"
  }
  return comment.status || "local"
}

/**
 * Build a thread comment for display using HTML comments for metadata.
 * Own comments are wrapped in edit markers.
 */
function buildThreadComment(
  comment: Comment, 
  username: string, 
  isEditable: boolean,
  indent: string = ""
): string[] {
  const lines: string[] = []
  const author = (comment.author || (isEditable ? username : "unknown")).replace(/^@/, "")
  const time = formatRelativeTime(comment.createdAt)
  const status = getStatusText(comment)
  const displayBody = comment.localEdit ?? comment.body

  if (isEditable) {
    // Format: <!-- @author · time · status · edit:id -->, closed by <!-- /edit -->.
    // parseEditorOutput reads the id back to know which comment was edited.
    lines.push(`${indent}<!-- @${author} · ${time} · ${status} · edit:${shortId(comment.id)} -->`)
    for (const bodyLine of displayBody.split("\n")) {
      lines.push(`${indent}${bodyLine}`)
    }
    lines.push(`${indent}<!-- /edit -->`)
  } else {
    // Format: <!-- @author · time · status --> — no edit id, so it is never read back.
    lines.push(`${indent}<!-- @${author} · ${time} · ${status} -->`)
    for (const bodyLine of displayBody.split("\n")) {
      lines.push(`${indent}${bodyLine}`)
    }
  }
  
  lines.push("")
  return lines
}

/**
 * Build the comment file content in markdown format.
 * 
 * Structure:
 *   [new reply - cursor starts here]
 *   
 *   <!-- Write your comment above this line -->
 *   
 *   ## Thread
 *   <!-- @author · time · status -->
 *   comment text...
 *   
 *   <!-- @you · time · status · edit:id -->
 *   editable comment...
 *   <!-- /edit -->
 *   
 *   ## Context
 *   ```diff
 *   context lines
 *   ```
 *   
 *   ## Full Change
 *   ```diff
 *   full diff
 *   ```
 */
export function buildCommentFileContent(options: EditorOptions): string {
  const lines: string[] = []

  // Empty first line so the editor opens with the cursor where the reply goes.
  lines.push("")
  lines.push("")
  lines.push(MARKER_COMMENT_END)
  lines.push("")
  
  lines.push(...buildContextSections(options, true))

  return lines.join("\n")
}

/**
 * The sections below the write-your-comment marker: the anchor header,
 * the existing thread, a few diff rows around the anchor, and the whole
 * file diff. Shared by the `C`/`E` buffer and the composer's Ctrl-g
 * hand-off so both routes carry the same context.
 *
 * `editableThread` gates the `edit:<id>` markers — only the `C` route
 * reads thread edits back, so the Ctrl-g buffer renders every comment
 * read-only rather than silently dropping edits made there.
 */
function buildContextSections(options: EditorOptions, editableThread: boolean): string[] {
  const lines: string[] = []
  const username = options.username || "@you"
  const thread = options.thread || []

  lines.push(MARKER_ANCHOR)
  lines.push("")
  lines.push(`- **File:** \`${options.filePath}\`` +
    (options.changeStatus ? ` (${options.changeStatus})` : ""))
  lines.push(`- **Line:** ${options.line}` + (options.side ? ` (${options.side})` : ""))
  if (options.anchorLine) {
    lines.push(`- **Code:** ${inlineCode(options.anchorLine)}`)
  }
  lines.push("")

  if (thread.length > 0) {
    lines.push(MARKER_THREAD)
    lines.push("")

    for (const comment of thread) {
      // Your own comments are editable (local, pending, or synced with local edits)
      const isYours = comment.author === username || !comment.author
      const isEditable = editableThread && isYours
      const isReply = comment.inReplyTo !== undefined
      const indent = isReply ? "    " : ""

      lines.push(...buildThreadComment(comment, username, isEditable, indent))
    }
  }

  const contextHunk =
    options.contextHunk ?? extractContextHunk(options.diffContent, options.line, 3)
  if (contextHunk.trim()) {
    lines.push(MARKER_CONTEXT)
    lines.push("")
    lines.push("```diff")
    lines.push(contextHunk.trimEnd())
    lines.push("```")
    lines.push("")
  }

  const fullDiff = options.fullDiff ?? options.diffContent
  if (fullDiff.trim()) {
    lines.push(MARKER_FULL_CHANGE)
    lines.push("")
    lines.push("```diff")
    lines.push(fullDiff.trimEnd())
    lines.push("```")
  }

  return lines
}

/**
 * Buffer for the composer's Ctrl-g hand-off: the in-progress draft on
 * top, everything riff knows about the anchor below it. Only the text
 * above the marker flows back into the composer.
 */
export function buildDraftFileContent(initial: string, context: DraftEditorContext): string {
  const lines: string[] = []

  lines.push(initial)
  lines.push("")
  lines.push(MARKER_COMMENT_END)
  lines.push("<!-- Everything below is context from riff and is discarded on save. -->")
  lines.push("")

  lines.push(
    ...buildContextSections(
      {
        diffContent: context.fullDiff ?? "",
        filePath: context.filePath,
        line: context.line,
        side: context.side,
        thread: context.thread,
        username: context.username,
        contextHunk: context.contextHunk,
        fullDiff: context.fullDiff,
        anchorLine: context.anchorLine,
        changeStatus: context.changeStatus,
      },
      false,
    ),
  )

  return lines.join("\n")
}

/**
 * Parse the full editor output including edited comments.
 * Returns new reply and map of edited comment IDs to new bodies.
 * 
 * Expected format (markdown with HTML comments):
 *   new comment text here
 *   
 *   <!-- Write your comment above this line -->
 *   
 *   ## Thread
 *   <!-- @author · time · status · edit:id -->
 *   editable comment body
 *   <!-- /edit -->
 */
export function parseEditorOutput(content: string): EditorResult {
  const result: EditorResult = {
    newReply: "",
    editedComments: new Map(),
  }
  
  const commentEndIdx = content.indexOf(MARKER_COMMENT_END)

  const anchorIdx = content.indexOf(MARKER_ANCHOR)
  const threadIdx = content.indexOf(MARKER_THREAD)
  const contextIdx = content.indexOf(MARKER_CONTEXT)
  const fullChangeIdx = content.indexOf(MARKER_FULL_CHANGE)

  // A user who deletes the end marker still keeps riff's sections out of
  // the reply: it then ends at the earliest section heading left.
  let replyEndIdx: number
  if (commentEndIdx !== -1) {
    replyEndIdx = commentEndIdx
  } else {
    const markers = [anchorIdx, threadIdx, contextIdx, fullChangeIdx].filter(i => i !== -1)
    replyEndIdx = markers.length > 0 ? Math.min(...markers) : content.length
  }

  result.newReply = content.slice(0, replyEndIdx).trim()

  if (threadIdx !== -1) {
    const threadEnd = contextIdx !== -1 ? contextIdx :
                      fullChangeIdx !== -1 ? fullChangeIdx : content.length
    const threadSection = content.slice(threadIdx + MARKER_THREAD.length, threadEnd)

    // <!-- @author · time · status · edit:ID -->\n<body>\n<!-- /edit -->
    const editRegex = /<!--\s*@\S+\s*·[^·]+·[^·]+·\s*edit:(\S+)\s*-->\n([\s\S]*?)<!--\s*\/edit\s*-->/g
    let match
    
    while ((match = editRegex.exec(threadSection)) !== null) {
      const commentId = match[1]!
      const body = match[2]!.trim()
      result.editedComments.set(commentId, body)
    }
  }
  
  return result
}

/** The PR conversation comment buffer: write above the marker, nothing else is read. */
export function prCommentFileContent(): string {
  return [
    "",
    MARKER_COMMENT_END,
    "",
    "<!-- PR conversation comment — write above the line, save and quit to post -->",
    "",
  ].join("\n")
}

/** The comment written above the marker, or null when nothing was. */
export function parsePrCommentOutput(text: string): string | null {
  const markerIdx = text.indexOf(MARKER_COMMENT_END)
  const body = markerIdx >= 0
    ? text.slice(0, markerIdx).trim()
    : text.trim()

  return body || null
}
