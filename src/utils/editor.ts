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

// Marker line - everything below this is stripped from the comment
const SCISSORS_LINE = "# ------------------------ >8 ------------------------"

/**
 * Extract a few lines of context around the target line from the diff.
 */
function extractContext(diffContent: string, targetLine: number, contextLines: number = 5): string[] {
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
 * Build the comment file content with diff context.
 * Uses a scissors line to separate comment from context (like git commit --verbose).
 */
function buildCommentFileContent(options: EditorOptions): string {
  const lines: string[] = []

  // Add existing comment or empty space for new comment
  if (options.existingComment) {
    lines.push(options.existingComment)
  } else {
    lines.push("")
  }

  lines.push("")
  lines.push("# Enter your comment above.")
  lines.push(`# Commenting on: ${options.filePath}:${options.line}`)
  lines.push("#")
  lines.push("# Lines starting with # will be ignored.")
  lines.push("# Leave empty to cancel.")
  lines.push("#")
  lines.push("# Do not modify or remove the line below.")
  lines.push(SCISSORS_LINE)
  lines.push("")

  // Add diff context for syntax highlighting
  // Include the full diff so nvim can highlight it properly
  lines.push(options.diffContent)

  return lines.join("\n")
}

/**
 * Parse the comment from editor output.
 * Strips everything at and after the scissors line, and removes # comment lines.
 */
export function parseCommentOutput(content: string): string {
  const lines = content.split("\n")
  const commentLines: string[] = []

  for (const line of lines) {
    // Stop at scissors line - everything below is context
    if (line.includes(">8")) {
      break
    }
    // Skip lines that start with # (instruction lines)
    if (!line.startsWith("#")) {
      commentLines.push(line)
    }
  }

  // Trim leading and trailing empty lines, preserve internal formatting
  let result = commentLines.join("\n")

  // Trim leading empty lines
  result = result.replace(/^\n+/, "")

  // Trim trailing whitespace/newlines
  result = result.trimEnd()

  return result
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
