/**
 * A reload empties the file contents a rendered file is drawn from. Read
 * each one's new version again, so the reloaded review shows it rendered as
 * before; a file with no new version to read turns its toggle off, or the
 * next `gR` would only turn it off and draw nothing new.
 */

import type { DiffFile } from "../../utils/diff-parser"
import type { FileContentState } from "../file-content/state"
import type { RenderedMarkdownState } from "./state"

export interface ReloadRenderedContext {
  files: () => readonly DiffFile[]
  renderedMarkdown: Pick<RenderedMarkdownState, "files" | "retain">
  fileContent: Pick<FileContentState, "entry">
  loadFileContent: (filename: string) => Promise<void>
}

export async function reloadRenderedFiles(ctx: ReloadRenderedContext): Promise<void> {
  const readable = new Set(ctx.files().filter((file) => file.status !== "deleted").map((file) => file.filename))
  ctx.renderedMarkdown.retain((filename) => readable.has(filename))
  await Promise.all([...ctx.renderedMarkdown.files()].map((filename) => ctx.loadFileContent(filename)))
  ctx.renderedMarkdown.retain((filename) => ctx.fileContent.entry(filename)?.newContent != null)
}
