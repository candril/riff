/**
 * Hand riff's buffers to $EDITOR, tmux and external diff viewers.
 */

import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import {
  type DraftEditorContext,
  type EditorOptions,
  buildCommentFileContent,
  buildDraftFileContent,
  parseEditorOutput,
  parsePrCommentOutput,
  prCommentFileContent,
} from "./editor/comment-template"
import {
  type PrCreateOptions,
  type PrCreateResult,
  type PrEditOptions,
  type PrEditResult,
  buildPrCreateContent,
  buildPrEditContent,
  parsePrCreateOutput,
  parsePrEditOutput,
} from "./editor/pr-template"

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
 * Open $EDITOR seeded with `initial` to edit a raw comment draft, and
 * return the edited text. Used by the inline composer's "edit in $EDITOR"
 * escape hatch (Ctrl-g) so a long or structured comment can be written
 * with full editor power and pulled back into the textarea.
 *
 * With `context`, the buffer also carries the anchor header, thread and
 * diff that the `C` route shows — writing a comment in nvim shouldn't
 * mean writing it blind. Everything below the marker is discarded on
 * read-back, so the draft stays the only thing the composer receives.
 *
 * Returns the edited content (trailing newline trimmed) on save, or
 * `null` if the editor exited with an error. An empty buffer is a valid
 * result (the user cleared the draft), not a cancel.
 */
export async function openTextInEditor(
  initial: string,
  context?: DraftEditorContext
): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  const tmpFile = join(tmpdir(), `riff-draft-${randomUUID()}.md`)
  await Bun.write(tmpFile, context ? buildDraftFileContent(initial, context) : initial)

  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited

  const cleanup = async () => {
    try {
      const { unlink } = await import("fs/promises")
      await unlink(tmpFile)
    } catch {
      // Ignore cleanup errors
    }
  }

  if (exitCode !== 0) {
    await cleanup()
    return null
  }

  const editedContent = await Bun.file(tmpFile).text()
  await cleanup()

  if (context) return parseEditorOutput(editedContent).newReply

  return editedContent.replace(/\n+$/, "")
}

/**
 * Open $EDITOR for a PR-level conversation comment (not attached to code).
 * Returns the comment body, or null if cancelled/empty.
 */
export async function openPrCommentEditor(): Promise<string | null> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"

  const tmpFile = join(tmpdir(), `riff-pr-comment-${randomUUID()}.md`)
  const content = prCommentFileContent()

  await Bun.write(tmpFile, content)

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
    } catch {}
    return null
  }

  const editedContent = await Bun.file(tmpFile).text()

  try {
    const { unlink } = await import("fs/promises")
    await unlink(tmpFile)
  } catch {}

  return parsePrCommentOutput(editedContent)
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

/**
 * Write `content` to a temp file that keeps `filename`'s extension, so an
 * editor opening it still gets syntax highlighting. The caller owns cleanup.
 */
export async function writeSnapshotFile(filename: string, content: string): Promise<string> {
  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const tmpFile = join(tmpdir(), `riff-view-${randomUUID()}.${ext}`)
  await Bun.write(tmpFile, content)
  return tmpFile
}

/**
 * The configured diff command, as argv (spec 075).
 *
 * `{old}` and `{new}` are whole arguments wherever they appear, so a path
 * with a space in it survives without any quoting rules of riff's own.
 */
export function diffCommand(template: string, oldPath: string, newPath: string): string[] {
  return template
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.replace("{old}", oldPath).replace("{new}", newPath))
}

/**
 * Open a command in a new tmux pane beside riff, leaving riff running.
 *
 * A pane rather than a window: the diff riff is showing is the reason you
 * opened the editor, and a window would hide it (spec 075).
 */
export async function openInTmuxPane(
  argv: string[],
  opts: { cwd?: string; removeWhenClosed?: string[] } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cleanup = opts.removeWhenClosed ?? []
  const command = cleanup.length > 0
    ? [
        "sh",
        "-c",
        `${argv.map(shellQuote).join(" ")}; rm -f ${cleanup.map(shellQuote).join(" ")}`,
      ]
    : argv

  const args = ["tmux", "split-window", "-h", ...(opts.cwd ? ["-c", opts.cwd] : []), ...command]

  try {
    const proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode === 0) return { ok: true }
    const stderr = (await new Response(proc.stderr).text()).trim()
    return { ok: false, error: stderr || `tmux exited with ${exitCode}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** riff can only hand a file to tmux when it is itself running inside one. */
export function insideTmux(): boolean {
  return Boolean(process.env.TMUX)
}

/**
 * Open a file in $EDITOR in a new tmux window, leaving riff running in the
 * current one.
 *
 * `tmux new-window` returns as soon as the window exists, so nothing here
 * waits for the editor: the point is to keep both alive side by side. A
 * temp file therefore cannot be cleaned up by riff — the wrapper shell in
 * the new window removes it once the editor exits.
 *
 * @param path - File to open; absolute, or relative to `cwd`
 * @param lineNumber - Optional line to jump to
 * @param opts.cwd - Working directory for the new window
 * @param opts.removeWhenClosed - Delete `path` after the editor exits
 */
export async function openInTmuxWindow(
  path: string,
  lineNumber?: number,
  opts: { cwd?: string; removeWhenClosed?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const editor = process.env.EDITOR || process.env.VISUAL || "nvim"
  const editorArgs = lineNumber && lineNumber > 0
    ? [editor, `+${lineNumber}`, path]
    : [editor, path]

  const command = opts.removeWhenClosed
    ? ["sh", "-c", `${editorArgs.map(shellQuote).join(" ")}; rm -f ${shellQuote(path)}`]
    : editorArgs

  const args = ["tmux", "new-window", ...(opts.cwd ? ["-c", opts.cwd] : []), ...command]

  try {
    // `tmux new-window` exits as soon as the window is created, so awaiting
    // it reports a real failure (no server, bad cwd) without waiting on the
    // editor session itself.
    const proc = Bun.spawn(args, { stdin: "ignore", stdout: "ignore", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode === 0) return { ok: true }
    const stderr = (await new Response(proc.stderr).text()).trim()
    return { ok: false, error: stderr || `tmux exited with ${exitCode}` }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`
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
