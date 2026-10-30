import type { FileContentState } from "./state"
import type { FetchFileVersions } from "./load"

export interface ExpandDividerContext {
  fileContent: Pick<FileContentState, "entry" | "markLoading" | "set" | "setError" | "expand" | "setExpanding" | "generation" | "track">
  fetchFileVersions: FetchFileVersions
  /** The key of the collapsed run under the cursor, or null when the cursor is on anything else. */
  dividerKeyAtCursor: () => string | null
  rebuildLineMapping: () => void
  render: () => void
  /** Scroll the cursor into view and redraw its line, over the rows the run just opened. */
  revealCursor: () => void
}

/**
 * Open the collapsed run of context under the cursor (spec 074), reading
 * the file first when riff has not read it yet or the last read failed.
 * False when there is no run there or the read fails, and the run stays
 * closed. False too when the diff changed while the read was in flight:
 * the run it was asked for is not on screen any more.
 */
export async function expandDividerAtCursor(ctx: ExpandDividerContext): Promise<boolean> {
  const dividerKey = ctx.dividerKeyAtCursor()
  if (!dividerKey) return false

  const [filename] = dividerKey.split(":")
  if (!filename) return false

  const { fileContent } = ctx
  const cached = fileContent.entry(filename)
  if (!cached || cached.error) {
    const read = readVersions(ctx, filename, dividerKey)
    // gR waits on this read rather than asking for the file a second time.
    fileContent.track(filename, read.then(() => {}))
    if (!(await read)) return false
  }

  fileContent.expand(dividerKey)
  fileContent.setExpanding(null)
  ctx.rebuildLineMapping()
  ctx.render()
  ctx.revealCursor()
  return true
}

/** False when the read fails, or lands after the diff changed. */
async function readVersions(ctx: ExpandDividerContext, filename: string, dividerKey: string): Promise<boolean> {
  const { fileContent } = ctx
  const generation = fileContent.generation()
  fileContent.markLoading(filename)
  fileContent.setExpanding(dividerKey)
  ctx.render()

  try {
    const fetched = await ctx.fetchFileVersions(filename)
    if (fileContent.generation() !== generation) return false
    if (!fetched.ok) {
      fileContent.setError(filename, fetched.error)
      fileContent.setExpanding(null)
      ctx.render()
      return false
    }

    fileContent.set(filename, fetched.newContent, fetched.oldContent)
    return true
  } catch (err) {
    if (fileContent.generation() !== generation) return false
    const msg = err instanceof Error ? err.message : "Unknown error"
    fileContent.setError(filename, msg)
    fileContent.setExpanding(null)
    ctx.render()
    return false
  }
}
