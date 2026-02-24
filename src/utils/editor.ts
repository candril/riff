/**
 * Open $EDITOR with diff context for writing a comment.
 * Lines starting with # are stripped from the final output (like git commit).
 */

import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"

export interface EditorOptions {
  /** The diff content to show as context */
  diffContent: string
  /** File path being commented on */
  filePath: string
  /** Line number being commented on */
  line: number
  /** Existing comment to edit (optional) */
  existingComment?: string
}

// Marker line - everything at and below this is stripped from the comment
const SCISSORS_LINE = "# ------------------------ >8 ------------------------"

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
 * Build the comment file content with diff context.
 * 
 * Structure:
 *   <comment area - cursor starts here>
 *   # scissors line
 *   # Instructions
 *   <context hunk - actual diff lines for syntax highlighting>
 *   # Full diff below
 *   <full diff>
 */
function buildCommentFileContent(options: EditorOptions): string {
  const lines: string[] = []
  
  // Comment area at top (cursor starts here)
  if (options.existingComment) {
    lines.push(options.existingComment)
  }
  lines.push("")
  
  // Scissors line - everything below is stripped
  lines.push(SCISSORS_LINE)
  lines.push(`# Commenting on: ${options.filePath}:${options.line}`)
  lines.push("# Leave empty to cancel.")
  lines.push("#")
  
  // Context hunk with the selected line +/- 5 lines (real diff for syntax highlighting)
  const contextHunk = extractContextHunk(options.diffContent, options.line, 5)
  lines.push(contextHunk)
  
  lines.push("#")
  lines.push("# Full diff:")
  lines.push("")
  lines.push(options.diffContent)

  return lines.join("\n")
}

/**
 * Parse the comment from editor output.
 * Takes everything before the scissors line.
 */
export function parseCommentOutput(content: string): string {
  // Find scissors line and take everything before it
  const scissorsIndex = content.indexOf(">8")
  const commentSection = scissorsIndex !== -1 
    ? content.slice(0, content.lastIndexOf("\n", scissorsIndex))
    : content
  
  // Trim whitespace
  return commentSection.trim()
}

/**
 * Open $EDITOR to write a comment with diff context.
 * Returns the comment text, or null if cancelled/empty.
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

  // Parse out the comment
  const comment = parseCommentOutput(editedContent)

  // Return null if comment is empty (user cancelled or cleared it)
  if (!comment) {
    return null
  }

  return comment
}
