/**
 * Open $EDITOR with diff context for writing a comment.
 * Supports thread view and inline editing of own comments.
 */

import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { $ } from "bun"
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

// Markers for parsing (markdown format with HTML comments)
const MARKER_COMMENT_END = "<!-- Write your comment above this line -->"
const MARKER_THREAD = "## Thread"
const MARKER_CONTEXT = "## Context"
const MARKER_FULL_CHANGE = "## Full Change"

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
 * Get status label for HTML comment (without brackets)
 */
function getStatusText(comment: Comment): string {
  // Check for local edits on synced comments
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
  const author = comment.author || (isEditable ? username : "unknown")
  const time = formatRelativeTime(comment.createdAt)
  const status = getStatusText(comment)
  
  // Use localEdit if present (for edited synced comments), otherwise body
  const displayBody = comment.localEdit ?? comment.body
  
  if (isEditable) {
    // Editable comment with edit marker in HTML comment
    // Format: <!-- @author · time · status · edit:id -->
    lines.push(`${indent}<!-- @${author} · ${time} · ${status} · edit:${shortId(comment.id)} -->`)
    for (const bodyLine of displayBody.split("\n")) {
      lines.push(`${indent}${bodyLine}`)
    }
    lines.push(`${indent}<!-- /edit -->`)
  } else {
    // Read-only comment
    // Format: <!-- @author · time · status -->
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
function buildCommentFileContent(options: EditorOptions): string {
  const lines: string[] = []
  const username = options.username || "@you"
  const thread = options.thread || []
  
  // New reply area at top (cursor starts here, always empty)
  lines.push("")
  lines.push("")
  lines.push(MARKER_COMMENT_END)
  lines.push("")
  
  // Thread section (if there are existing comments)
  if (thread.length > 0) {
    lines.push(MARKER_THREAD)
    lines.push("")
    
    for (const comment of thread) {
      // Your own comments are editable (local, pending, or synced with local edits)
      const isYours = comment.author === username || !comment.author
      const isEditable = isYours
      const isReply = comment.inReplyTo !== undefined
      const indent = isReply ? "    " : ""  // 4 spaces for reply indent
      
      lines.push(...buildThreadComment(comment, username, isEditable, indent))
    }
  }
  
  // Context section (3 lines around target) in a diff code block
  const contextHunk = extractContextHunk(options.diffContent, options.line, 3)
  if (contextHunk.trim()) {
    lines.push(MARKER_CONTEXT)
    lines.push("")
    lines.push("```diff")
    lines.push(contextHunk)
    lines.push("```")
    lines.push("")
  }
  
  // Full change section in a diff code block
  lines.push(MARKER_FULL_CHANGE)
  lines.push("")
  lines.push("```diff")
  lines.push(options.diffContent)
  lines.push("```")

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
  
  // Find the comment end marker first (primary delimiter for new reply)
  const commentEndIdx = content.indexOf(MARKER_COMMENT_END)
  
  // Find section markers
  const threadIdx = content.indexOf(MARKER_THREAD)
  const contextIdx = content.indexOf(MARKER_CONTEXT)
  const fullChangeIdx = content.indexOf(MARKER_FULL_CHANGE)
  
  // New reply ends at the comment end marker, or the first section marker
  let replyEndIdx: number
  if (commentEndIdx !== -1) {
    replyEndIdx = commentEndIdx
  } else {
    // Fallback: find the earliest section marker
    const markers = [threadIdx, contextIdx, fullChangeIdx].filter(i => i !== -1)
    replyEndIdx = markers.length > 0 ? Math.min(...markers) : content.length
  }
  
  // Extract new reply (everything before the end marker)
  result.newReply = content.slice(0, replyEndIdx).trim()
  
  // Parse edited comments from thread section
  if (threadIdx !== -1) {
    const threadEnd = contextIdx !== -1 ? contextIdx : 
                      fullChangeIdx !== -1 ? fullChangeIdx : content.length
    const threadSection = content.slice(threadIdx + MARKER_THREAD.length, threadEnd)
    
    // Find all edit blocks with HTML comment format:
    // <!-- @author · time · status · edit:ID -->
    // comment body (may span multiple lines)
    // <!-- /edit -->
    // 
    // The regex captures:
    // 1. The comment ID from the opening marker
    // 2. Everything between the markers (the body)
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

/**
 * Open $EDITOR to write a comment with diff context.
 * Returns the raw editor content for parsing, or null if cancelled.
 */
export async function openCommentEditor(
  options: EditorOptions
): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  // Use .md extension for markdown syntax highlighting
  const tmpFile = join(tmpdir(), `riff-comment-${randomUUID()}.md`)
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

/**
 * Open a file in $EDITOR for viewing (read-only context).
 * Creates a temporary file with the content and opens it.
 * The file is cleaned up after the editor closes.
 * 
 * @param filename - Original filename (used for extension/syntax highlighting)
 * @param content - File content to display
 * @param lineNumber - Optional line number to jump to
 */
export async function openFileInEditor(
  filename: string,
  content: string,
  lineNumber?: number
): Promise<void> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
  
  // Extract extension from filename for syntax highlighting
  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const tmpFile = join(tmpdir(), `riff-view-${randomUUID()}.${ext}`)
  
  await Bun.write(tmpFile, content)
  
  // Build editor command with line number if supported
  // Most editors support +N syntax for jumping to line N
  const args = lineNumber ? [editor, `+${lineNumber}`, tmpFile] : [editor, tmpFile]
  
  // Spawn editor and wait for it
  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit", 
    stderr: "inherit",
  })
  
  await proc.exited
  
  // Clean up temp file
  try {
    const { unlink } = await import("fs/promises")
    await unlink(tmpFile)
  } catch {
    // Ignore cleanup errors
  }
}

// ========== PR TITLE/DESCRIPTION EDITOR ==========

const PR_EDIT_SCISSORS = "# ------------------------ >8 ------------------------"
const PR_EDIT_COMMENT_PREFIX = "# "

export interface PrEditOptions {
  /** Current PR title */
  title: string
  /** Current PR description/body */
  body: string
  /** Raw unified diff of all changes (shown below scissors line) */
  diff: string
  /** File summary lines (e.g., "M src/app.ts") */
  fileSummary?: string[]
}

export interface PrEditResult {
  /** The new title (first non-comment, non-empty line) */
  title: string
  /** The new description (everything after first blank line, before scissors) */
  body: string
}

/**
 * Build the editor file content for PR title/description editing.
 * Format follows git commit --verbose conventions:
 *
 *   PR title here
 *
 *   PR description here
 *   (can be multiple lines/paragraphs)
 *
 *   # ------------------------ >8 ------------------------
 *   # Do not modify or remove the line above.
 *   # Everything below it will be ignored.
 *   #
 *   # Files changed:
 *   #   M src/app.ts
 *   #   A src/new-file.ts
 *   #
 *   diff --git a/src/app.ts b/src/app.ts
 *   ...
 */
function buildPrEditContent(options: PrEditOptions): string {
  const lines: string[] = []

  // Title (first line)
  lines.push(options.title)
  lines.push("")

  // Body
  if (options.body.trim()) {
    lines.push(options.body)
    // Ensure body ends with blank line before scissors
    if (!options.body.endsWith("\n")) {
      lines.push("")
    }
  }

  // Scissors line
  lines.push(PR_EDIT_SCISSORS)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Do not modify or remove the line above.`)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Everything below it will be ignored.`)
  lines.push(PR_EDIT_COMMENT_PREFIX)

  // File summary
  if (options.fileSummary && options.fileSummary.length > 0) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Files changed:`)
    for (const file of options.fileSummary) {
      lines.push(`${PR_EDIT_COMMENT_PREFIX}  ${file}`)
    }
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  // Full diff (not commented — syntax highlighting works)
  lines.push(options.diff)

  return lines.join("\n")
}

/**
 * Parse the editor output for PR title/description.
 * Strips everything at/after the scissors line and comment lines.
 * First line = title, rest = body.
 */
export function parsePrEditOutput(content: string): PrEditResult | null {
  // Strip everything at and after scissors line
  const scissorsIdx = content.indexOf(PR_EDIT_SCISSORS)
  const editable = scissorsIdx !== -1 ? content.slice(0, scissorsIdx) : content

  // Split into lines and strip trailing whitespace
  const lines = editable.split("\n")

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop()
  }

  if (lines.length === 0) {
    return null // Empty = cancelled
  }

  // First non-empty line is the title
  const title = lines[0]!.trim()
  if (!title) {
    return null // No title = cancelled
  }

  // Skip blank line(s) after title, rest is body
  let bodyStart = 1
  while (bodyStart < lines.length && lines[bodyStart]!.trim() === "") {
    bodyStart++
  }

  const body = lines.slice(bodyStart).join("\n").trimEnd()

  return { title, body }
}

/**
 * Open $EDITOR to edit PR title and description, with diff as context.
 * Returns the parsed result, or null if the user cancelled (empty title or editor error).
 */
export async function openPrEditor(options: PrEditOptions): Promise<PrEditResult | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  // Use .md extension so the title/description get markdown syntax highlighting
  const tmpFile = join(tmpdir(), `riff-pr-edit-${randomUUID()}.md`)
  const content = buildPrEditContent(options)

  await Bun.write(tmpFile, content)

  // Spawn editor at line 1
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
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

  // Clean up
  try {
    const { unlink } = await import("fs/promises")
    await unlink(tmpFile)
  } catch {
    // Ignore cleanup errors
  }

  return parsePrEditOutput(editedContent)
}

// ========== CREATE PR EDITOR ==========

export interface PrCreateOptions {
  /** Raw unified diff of all changes (shown below scissors line) */
  diff: string
  /** File summary lines (e.g., "M src/app.ts") */
  fileSummary?: string[]
  /** Branch info (e.g., "my-feature → main") */
  branchInfo?: string | null
}

export interface PrCreateResult {
  /** The PR title (first non-empty line) */
  title: string
  /** The PR description (everything after first blank line, before Draft/scissors) */
  body: string
  /** Whether to create as draft */
  draft: boolean
}

/**
 * Build the editor file content for PR creation.
 * Format:
 *
 *   <title here>
 *
 *   <body here>
 *
 *   # Draft: no
 *   # ------------------------ >8 ------------------------
 *   # Do not modify or remove the line above.
 *   # Everything below it will be ignored.
 *   #
 *   # Creating PR for branch: my-feature → main
 *   #
 *   # Files changed:
 *   #   M src/app.ts
 *   #   A src/new-file.ts
 *   #
 *   diff --git a/src/app.ts b/src/app.ts
 *   ...
 */
function buildPrCreateContent(options: PrCreateOptions): string {
  const lines: string[] = []

  // Title placeholder (first line - user fills this in)
  lines.push("")
  lines.push("")

  // Body placeholder
  lines.push("")

  // Draft option
  lines.push("# Draft: no")

  // Scissors line
  lines.push(PR_EDIT_SCISSORS)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Do not modify or remove the line above.`)
  lines.push(`${PR_EDIT_COMMENT_PREFIX}Everything below it will be ignored.`)
  lines.push(PR_EDIT_COMMENT_PREFIX)

  // Branch info
  if (options.branchInfo) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Creating PR for: ${options.branchInfo}`)
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  // File summary
  if (options.fileSummary && options.fileSummary.length > 0) {
    lines.push(`${PR_EDIT_COMMENT_PREFIX}Files changed:`)
    for (const file of options.fileSummary) {
      lines.push(`${PR_EDIT_COMMENT_PREFIX}  ${file}`)
    }
    lines.push(PR_EDIT_COMMENT_PREFIX)
  }

  // Full diff (not commented — syntax highlighting works)
  lines.push(options.diff)

  return lines.join("\n")
}

/**
 * Parse the editor output for PR creation.
 * Extracts title, body, and draft flag.
 * Returns null if title is empty (cancelled).
 */
export function parsePrCreateOutput(content: string): PrCreateResult | null {
  // Strip everything at and after scissors line
  const scissorsIdx = content.indexOf(PR_EDIT_SCISSORS)
  const editable = scissorsIdx !== -1 ? content.slice(0, scissorsIdx) : content

  // Extract draft flag from the "# Draft: yes/no" line before scissors
  let draft = false
  const draftMatch = editable.match(/^#\s*Draft:\s*(yes|no)\s*$/mi)
  if (draftMatch) {
    draft = draftMatch[1]!.toLowerCase() === "yes"
  }

  // Remove comment lines (starting with #) and the draft line
  const lines = editable.split("\n").filter(line => !line.match(/^\s*#/))

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === "") {
    lines.pop()
  }

  if (lines.length === 0) {
    return null // Empty = cancelled
  }

  // Find first non-empty line as title
  let titleIdx = 0
  while (titleIdx < lines.length && lines[titleIdx]!.trim() === "") {
    titleIdx++
  }

  if (titleIdx >= lines.length) {
    return null // No title = cancelled
  }

  const title = lines[titleIdx]!.trim()
  if (!title) {
    return null
  }

  // Skip blank line(s) after title, rest is body
  let bodyStart = titleIdx + 1
  while (bodyStart < lines.length && lines[bodyStart]!.trim() === "") {
    bodyStart++
  }

  const body = lines.slice(bodyStart).join("\n").trimEnd()

  return { title, body, draft }
}

/**
 * Open $EDITOR to create a new PR, with diff as context.
 * Returns the parsed result, or null if the user cancelled (empty title or editor error).
 */
export async function openPrCreator(options: PrCreateOptions): Promise<PrCreateResult | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  // Use .diff extension so the diff portion gets syntax highlighting
  const tmpFile = join(tmpdir(), `riff-pr-create-${randomUUID()}.diff`)
  const content = buildPrCreateContent(options)

  await Bun.write(tmpFile, content)

  // Spawn editor at line 1
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited

  if (exitCode !== 0) {
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

  // Clean up
  try {
    const { unlink } = await import("fs/promises")
    await unlink(tmpFile)
  } catch {
    // Ignore cleanup errors
  }

  return parsePrCreateOutput(editedContent)
}

/**
 * Open a file diff in an external diff viewer.
 * Suspends the TUI while the viewer is open.
 * 
 * @param oldContent - The old version of the file
 * @param newContent - The new version of the file  
 * @param filename - Original filename (for temp file extension)
 * @param viewer - Which diff viewer to use
 */
export async function openExternalDiffViewer(
  oldContent: string,
  newContent: string,
  filename: string,
  viewer: "difftastic" | "delta" | "nvim"
): Promise<void> {
  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const baseName = filename.split("/").pop()?.replace(/\.[^.]+$/, "") || "file"
  const oldFile = join(tmpdir(), `riff-old-${baseName}-${randomUUID().slice(0, 8)}.${ext}`)
  const newFile = join(tmpdir(), `riff-new-${baseName}-${randomUUID().slice(0, 8)}.${ext}`)
  
  await Bun.write(oldFile, oldContent)
  await Bun.write(newFile, newContent)
  
  let proc: ReturnType<typeof Bun.spawn>
  
  switch (viewer) {
    case "difftastic":
      // difftastic (dft) with side-by-side diff, piped to less for paging
      // --color=always forces color output when piped
      proc = Bun.spawn(["sh", "-c", `difft --color=always "${oldFile}" "${newFile}" | less -R`], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
      
    case "delta":
      // delta reads unified diff from stdin
      // Generate diff with git diff --no-index, pipe to delta
      proc = Bun.spawn(["sh", "-c", `git diff --no-index --color=always "${oldFile}" "${newFile}" | delta --paging=always`], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
      
    case "nvim":
      // neovim diff mode
      proc = Bun.spawn(["nvim", "-d", oldFile, newFile], {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      })
      break
  }
  
  await proc.exited
  
  // Clean up temp files
  try {
    const { unlink } = await import("fs/promises")
    await Promise.all([unlink(oldFile), unlink(newFile)])
  } catch {
    // Ignore cleanup errors
  }
}
