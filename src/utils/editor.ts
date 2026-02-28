/**
 * Open $EDITOR with diff context for writing a comment.
 * Supports thread view and inline editing of own comments.
 */

import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import type { Comment } from "../types"

export interface EditorOptions {
  /** The diff content to show as context */
  diffContent: string
  /** File path being commented on */
  filePath: string
  /** Line number being commented on */
  line: number
  /** Existing comment to edit (optional) - DEPRECATED, use thread instead */
  existingComment?: string
  /** Thread of comments on this line */
  thread?: Comment[]
  /** Current username (GitHub username or "@you" for local) */
  username?: string
}

export interface EditorResult {
  /** New reply text (empty string if none) */
  newReply: string
  /** Map of comment ID -> updated body for edited comments */
  editedComments: Map<string, string>
}

// Markers for parsing
const MARKER_THREAD = "--- THREAD (edit your comments below, other comments are read-only) ---"
const MARKER_CONTEXT = "--- CONTEXT ---"
const MARKER_FULL_CHANGE = "--- FULL CHANGE ---"

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
 * Get status label for a comment
 */
function getStatusLabel(comment: Comment): string {
  if (comment.status === "synced") return ""
  if (comment.status === "pending") return " (pending)"
  return " (local)"
}

/**
 * Extract a few lines of context around the target line from the diff.
 * Returns lines as an array (internal helper).
 */
function extractContextLines(diffContent: string, targetLine: number, contextLines: number = 5): string[] {
  const lines = diffContent.split("\n")
  
  // Find content lines (skip diff headers)
  let contentStart = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line && !line.startsWith("diff ") && !line.startsWith("---") && 
        !line.startsWith("+++") && !line.startsWith("@@") && 
        !line.startsWith("index ") && !line.startsWith("new file") &&
        !line.startsWith("deleted file")) {
      contentStart = i
      break
    }
  }
  
  // Get lines around target (accounting for header offset)
  const start = Math.max(0, targetLine - contextLines - 1)
  const end = Math.min(lines.length, targetLine + contextLines)
  
  return lines.slice(start, end)
}

/**
 * Extract a diff hunk (context lines) around the target line.
 * Returns a string suitable for storing as diffHunk on a Comment.
 * Shows up to `contextLines` lines before the target line.
 * 
 * @param diffContent - Raw diff content including headers
 * @param targetLine - 1-indexed visible line number (as shown in diff view)
 * @param contextLines - Number of context lines to include
 */
export function extractDiffHunk(diffContent: string, targetLine: number, contextLines: number = 5): string {
  const lines = diffContent.split("\n")
  
  // Map visible line number to raw line index
  // Visible lines start after the @@ marker and only include actual diff content
  let visibleLineCount = 0
  let rawTargetIdx = -1
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    
    // Skip header lines - these aren't visible in diff view
    if (line.startsWith("diff ")) continue
    if (line.startsWith("index ")) continue
    if (line.startsWith("---") && line.includes("/")) continue
    if (line.startsWith("+++") && line.includes("/")) continue
    if (line.startsWith("new file")) continue
    if (line.startsWith("deleted file")) continue
    if (line.startsWith("old mode")) continue
    if (line.startsWith("new mode")) continue
    if (line.startsWith("similarity index")) continue
    if (line.startsWith("rename from")) continue
    if (line.startsWith("rename to")) continue
    if (line.startsWith("Binary files")) continue
    
    // This is a visible line (@@, +, -, space, or \ no newline)
    visibleLineCount++
    
    if (visibleLineCount === targetLine) {
      rawTargetIdx = i
      break
    }
  }
  
  if (rawTargetIdx === -1) {
    // Fallback: couldn't map, use last few lines
    const visibleLines = lines.filter(line => {
      if (line.startsWith("diff ")) return false
      if (line.startsWith("index ")) return false
      if (line.startsWith("---") && line.includes("/")) return false
      if (line.startsWith("+++") && line.includes("/")) return false
      if (line.startsWith("new file")) return false
      if (line.startsWith("deleted file")) return false
      return true
    })
    return visibleLines.slice(-contextLines).join("\n")
  }
  
  // Collect context lines ending at target, skipping headers
  const result: string[] = []
  for (let i = rawTargetIdx; i >= 0 && result.length < contextLines; i--) {
    const line = lines[i] ?? ""
    
    // Skip header lines
    if (line.startsWith("diff ")) continue
    if (line.startsWith("index ")) continue
    if (line.startsWith("---") && line.includes("/")) continue
    if (line.startsWith("+++") && line.includes("/")) continue
    if (line.startsWith("new file")) continue
    if (line.startsWith("deleted file")) continue
    if (line.startsWith("old mode")) continue
    if (line.startsWith("new mode")) continue
    if (line.startsWith("similarity index")) continue
    if (line.startsWith("rename from")) continue
    if (line.startsWith("rename to")) continue
    if (line.startsWith("Binary files")) continue
    
    result.unshift(line)
  }
  
  return result.join("\n")
}

/**
 * Extract context hunk around target line (+/- contextLines).
 * Returns visible diff lines centered on the target.
 */
function extractContextHunk(diffContent: string, targetLine: number, contextLines: number = 5): string {
  const lines = diffContent.split("\n")
  
  // Build list of visible lines with their raw indices
  const visibleLines: { raw: number; content: string }[] = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    
    // Skip header lines - these aren't visible in diff view
    if (line.startsWith("diff ")) continue
    if (line.startsWith("index ")) continue
    if (line.startsWith("---") && line.includes("/")) continue
    if (line.startsWith("+++") && line.includes("/")) continue
    if (line.startsWith("new file")) continue
    if (line.startsWith("deleted file")) continue
    if (line.startsWith("old mode")) continue
    if (line.startsWith("new mode")) continue
    if (line.startsWith("similarity index")) continue
    if (line.startsWith("rename from")) continue
    if (line.startsWith("rename to")) continue
    if (line.startsWith("Binary files")) continue
    
    visibleLines.push({ raw: i, content: line })
  }
  
  // targetLine is 1-indexed, convert to 0-indexed in visibleLines
  const targetIdx = targetLine - 1
  
  // Get range centered on target
  const start = Math.max(0, targetIdx - contextLines)
  const end = Math.min(visibleLines.length, targetIdx + contextLines + 1)
  
  return visibleLines.slice(start, end).map(v => v.content).join("\n")
}

/**
 * Build a thread comment for display.
 * Own comments are wrapped in edit markers.
 */
function buildThreadComment(
  comment: Comment, 
  username: string, 
  isOwn: boolean,
  indent: string = ""
): string[] {
  const lines: string[] = []
  const author = comment.author || (isOwn ? username : "unknown")
  const time = formatRelativeTime(comment.createdAt)
  const status = getStatusLabel(comment)
  
  if (isOwn) {
    // Editable comment with markers
    lines.push(`${indent}<!-- @${author}${status} [edit:${shortId(comment.id)}] -->`)
    for (const bodyLine of comment.body.split("\n")) {
      lines.push(`${indent}${bodyLine}`)
    }
    lines.push(`${indent}<!-- /edit -->`)
  } else {
    // Read-only comment (no markers)
    lines.push(`${indent}@${author} (${time}):`)
    for (const bodyLine of comment.body.split("\n")) {
      lines.push(`${indent}${bodyLine}`)
    }
  }
  
  lines.push("")
  return lines
}

/**
 * Build the comment file content with thread context.
 * 
 * Structure:
 *   [new reply - cursor starts here]
 *   
 *   --- THREAD ---
 *   @user (time): comment
 *   <!-- @you [edit:id] --> editable own comment <!-- /edit -->
 *   
 *   --- CONTEXT ---
 *   diff context (3 lines)
 *   
 *   --- FULL CHANGE ---
 *   full diff hunk
 */
function buildCommentFileContent(options: EditorOptions): string {
  const lines: string[] = []
  const username = options.username || "@you"
  const thread = options.thread || []
  
  // New reply area at top (cursor starts here, always empty)
  lines.push("")
  lines.push("")
  
  // Thread section (if there are existing comments)
  if (thread.length > 0) {
    lines.push(MARKER_THREAD)
    lines.push("")
    
    for (const comment of thread) {
      const isOwn = comment.author === username || 
                    (!comment.author && comment.status !== "synced")
      const isReply = comment.inReplyTo !== undefined
      const indent = isReply ? "  " : ""
      
      lines.push(...buildThreadComment(comment, username, isOwn, indent))
    }
  }
  
  // Context section (3 lines around target)
  const contextHunk = extractContextHunk(options.diffContent, options.line, 3)
  if (contextHunk.trim()) {
    lines.push(MARKER_CONTEXT)
    lines.push("")
    lines.push(contextHunk)
    lines.push("")
  }
  
  // Full change section
  lines.push(MARKER_FULL_CHANGE)
  lines.push("")
  lines.push(options.diffContent)

  return lines.join("\n")
}

/**
 * Parse the comment from editor output (legacy - returns just the new comment).
 * Takes everything before the markers.
 */
export function parseCommentOutput(content: string): string {
  const result = parseEditorOutput(content)
  return result.newReply
}

/**
 * Parse the full editor output including edited comments.
 * Returns new reply and map of edited comment IDs to new bodies.
 */
export function parseEditorOutput(content: string): EditorResult {
  const result: EditorResult = {
    newReply: "",
    editedComments: new Map(),
  }
  
  // Find the first marker to determine where new reply ends
  const threadIdx = content.indexOf(MARKER_THREAD)
  const contextIdx = content.indexOf(MARKER_CONTEXT)
  const fullChangeIdx = content.indexOf(MARKER_FULL_CHANGE)
  
  // Find the earliest marker
  const markers = [threadIdx, contextIdx, fullChangeIdx].filter(i => i !== -1)
  const firstMarkerIdx = markers.length > 0 ? Math.min(...markers) : content.length
  
  // Extract new reply (everything before first marker)
  result.newReply = content.slice(0, firstMarkerIdx).trim()
  
  // Parse edited comments from thread section
  if (threadIdx !== -1) {
    const threadEnd = contextIdx !== -1 ? contextIdx : 
                      fullChangeIdx !== -1 ? fullChangeIdx : content.length
    const threadSection = content.slice(threadIdx + MARKER_THREAD.length, threadEnd)
    
    // Find all edit blocks: <!-- @user (status) [edit:ID] --> ... <!-- /edit -->
    // Pattern: <!-- @username (optional status) [edit:SHORT_ID] -->
    const editRegex = /<!-- @\S+(?:\s+\([^)]*\))?\s+\[edit:([^\]]+)\]\s*-->\n([\s\S]*?)<!-- \/edit -->/g
    let match
    
    while ((match = editRegex.exec(threadSection)) !== null) {
      const commentId = match[1]!
      const body = match[2]!.trim()
      result.editedComments.set(commentId, body)
    }
  }
  
  return result
}

/**
 * Open $EDITOR to write a comment with diff context.
 * Returns the raw editor content for parsing, or null if cancelled.
 */
export async function openCommentEditor(
  options: EditorOptions
): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  // Use .diff extension for proper syntax highlighting
  const tmpFile = join(tmpdir(), `neoriff-comment-${randomUUID()}.diff`)
  const content = buildCommentFileContent(options)

  await Bun.write(tmpFile, content)

  // Spawn editor and wait for it
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
    // Editor exited with error, treat as cancelled
    try {
      const { unlink } = await import("fs/promises")
      await unlink(tmpFile)
    } catch {
      // Ignore cleanup errors
    }
    return null
  }

  // Read the file back
  const editedContent = await Bun.file(tmpFile).text()

  // Clean up temp file
  try {
    const { unlink } = await import("fs/promises")
    await unlink(tmpFile)
  } catch {
    // Ignore cleanup errors
  }

  // Return the raw content - caller will parse it with parseEditorOutput
  return editedContent
}
