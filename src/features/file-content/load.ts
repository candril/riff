import type { FileContentState } from "./state"

/** Both versions of a file, from whatever revisions the review is showing. */
export type FetchFileVersions = (
  filename: string,
) => Promise<{ ok: true; newContent: string; oldContent: string | null } | { ok: false; error: string }>

export interface LoadFileContentContext {
  fileContent: Pick<FileContentState, "markLoading" | "set" | "setError">
  fetchFileVersions: FetchFileVersions
  render: () => void
}

export async function loadFileContent(ctx: LoadFileContentContext, filename: string): Promise<void> {
  ctx.fileContent.markLoading(filename)
  ctx.render()

  try {
    const fetched = await ctx.fetchFileVersions(filename)
    if (fetched.ok) {
      ctx.fileContent.set(filename, fetched.newContent, fetched.oldContent)
    } else {
      ctx.fileContent.setError(filename, fetched.error)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.fileContent.setError(filename, msg)
  }

  ctx.render()
}
