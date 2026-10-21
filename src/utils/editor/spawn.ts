import { tmpdir } from "os"
import { join } from "path"
import { randomUUID } from "crypto"
import { unlink } from "fs/promises"
import {
  type DraftEditorContext,
  type EditorOptions,
  buildCommentFileContent,
  buildDraftFileContent,
  parseEditorOutput,
  parsePrCommentOutput,
  prCommentFileContent,
} from "./comment-template"
import {
  type PrCreateOptions,
  type PrCreateResult,
  type PrEditOptions,
  type PrEditResult,
  buildPrCreateContent,
  buildPrEditContent,
  parsePrCreateOutput,
  parsePrEditOutput,
} from "./pr-template"

export function editorCommand(): string {
  return process.env.EDITOR || process.env.VISUAL || "nvim"
}

/** Run an editor in riff's own terminal and wait for it; its exit code. */
async function runEditor(args: string[]): Promise<number> {
  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  return proc.exited
}

async function removeTempFile(path: string): Promise<void> {
  try {
    await unlink(path)
  } catch {
    // A temp file left behind costs nothing; failing the edit over it would.
  }
}

/**
 * Write `content` to a fresh `<prefix>-<uuid>.<ext>` temp file, open it in
 * the editor, and return what was saved. An editor that exits non-zero
 * (`:cq` in vim) is a cancel, and gives null. The extension is the editor's
 * cue for syntax highlighting.
 *
 * `editor` is there so tests can run a stub script; riff itself passes nothing.
 */
export async function editInTempFile(
  prefix: string,
  ext: string,
  content: string,
  editor: string = editorCommand(),
): Promise<string | null> {
  const tmpFile = join(tmpdir(), `${prefix}-${randomUUID()}.${ext}`)
  await Bun.write(tmpFile, content)

  const exitCode = await runEditor([editor, tmpFile])
  if (exitCode !== 0) {
    await removeTempFile(tmpFile)
    return null
  }

  const edited = await Bun.file(tmpFile).text()
  await removeTempFile(tmpFile)
  return edited
}

/**
 * Open $EDITOR to write a comment with diff context.
 * Returns the raw editor content for parseEditorOutput, or null if cancelled.
 */
export async function openCommentEditor(options: EditorOptions): Promise<string | null> {
  return editInTempFile("riff-comment", "md", buildCommentFileContent(options))
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
  const edited = await editInTempFile(
    "riff-draft",
    "md",
    context ? buildDraftFileContent(initial, context) : initial,
  )
  if (edited === null) return null

  if (context) return parseEditorOutput(edited).newReply

  return edited.replace(/\n+$/, "")
}

/**
 * Open $EDITOR for a PR-level conversation comment (not attached to code).
 * Returns the comment body, or null if cancelled/empty.
 */
export async function openPrCommentEditor(): Promise<string | null> {
  const edited = await editInTempFile("riff-pr-comment", "md", prCommentFileContent())
  return edited === null ? null : parsePrCommentOutput(edited)
}

/**
 * Open $EDITOR to edit PR title and description, with diff as context.
 * Returns the parsed result, or null if the user cancelled (empty title or editor error).
 */
export async function openPrEditor(options: PrEditOptions): Promise<PrEditResult | null> {
  const edited = await editInTempFile("riff-pr-edit", "md", buildPrEditContent(options))
  return edited === null ? null : parsePrEditOutput(edited)
}

/**
 * Open $EDITOR to create a new PR, with diff as context.
 * Returns the parsed result, or null if the user cancelled (empty title or editor error).
 */
export async function openPrCreator(options: PrCreateOptions): Promise<PrCreateResult | null> {
  // .diff rather than .md: most of the buffer is the diff below the scissors.
  const edited = await editInTempFile("riff-pr-create", "diff", buildPrCreateContent(options))
  return edited === null ? null : parsePrCreateOutput(edited)
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
  const editor = editorCommand()

  const ext = filename.includes(".") ? filename.split(".").pop() : "txt"
  const tmpFile = join(tmpdir(), `riff-view-${randomUUID()}.${ext}`)

  await Bun.write(tmpFile, content)

  // Most editors take +N to open at line N.
  const args = lineNumber ? [editor, `+${lineNumber}`, tmpFile] : [editor, tmpFile]

  await runEditor(args)
  await removeTempFile(tmpFile)
}
