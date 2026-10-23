import type { AppState } from "../../state"
import { buildFileTree } from "../../utils/file-tree"
import type { FileContentState } from "../file-content/state"
import type { ToastState } from "../toast/state"
import type { CommitDiffsState } from "./diffs-state"
import { commitScopeKey } from "./key"
import { scopeFiles, type CommitScopeLoadContext } from "./load"
import { scopeToCommit } from "./scope"
import { contiguousRun } from "./span"

export interface CommitSelectionContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  commitDiffs: Pick<CommitDiffsState, "entry" | "has" | "put">
  fileContent: Pick<FileContentState, "forgetSpan">
  toast: Pick<ToastState, "show" | "clear">
  render: () => void
  resetCursor: () => void
  rebuildLineMapping: () => void
  /** Move the cursor to the file and, once the new mapping is drawn, put it at the top of the window. */
  revealFileAtTop: (fileIndex: number) => void
  load: CommitScopeLoadContext
}

export async function handleCommitSelected(
  ctx: CommitSelectionContext,
  sha: string | null,
  filename?: string,
  scope?: readonly string[] | null,
) {
  const { toast, render } = ctx
  if (sha === null) {
    // Switch back to all commits
    ctx.setState((state) => scopeToCommit(state, ctx.commitDiffs, ctx.fileContent, null))
    ctx.setState((state) => ({ ...state, fileTree: buildFileTree(state.files) }))
    ctx.resetCursor()
    ctx.rebuildLineMapping()
    toast.show("Viewing all commits", "info")
    render()
    setTimeout(() => { toast.clear(); render() }, 1500)
    return
  }

  const shas = scope && scope.length > 0 ? scope : [sha]
  const cacheKey = commitScopeKey(sha, shas)

  if (!ctx.commitDiffs.has(cacheKey)) {
    toast.show(shas.length > 1 ? "Loading commits..." : "Loading commit...", "info")
    render()

    try {
      const files = await scopeFiles(ctx.load, shas)
      ctx.commitDiffs.put(cacheKey, files)
    } catch (err) {
      toast.show(`Failed to load commit: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
      render()
      setTimeout(() => { toast.clear(); render() }, 3000)
      return
    }
  }

  // Switch to the commit's diff
  ctx.setState((state) => scopeToCommit(state, ctx.commitDiffs, ctx.fileContent, sha, shas))
  ctx.resetCursor()
  ctx.rebuildLineMapping()

  // Asked for from a file row: the commit's diff, at that file — with the
  // file at the top of the window, since it is the whole reason for
  // coming.
  const state = ctx.getState()
  const fileIndex = filename ? state.files.findIndex((file) => file.filename === filename) : -1
  if (fileIndex !== -1) ctx.revealFileAtTop(fileIndex)

  // Show toast with commit info
  const commit = state.commits.find(c => c.sha === sha)
  const commitIdx = state.commits.findIndex(c => c.sha === sha) + 1
  const run = contiguousRun(state.commits, shas)
  if (run) {
    const oldestIdx = state.commits.findIndex(c => c.sha === run.oldest) + 1
    toast.show(
      `Commits ${commitIdx}–${oldestIdx} of ${state.commits.length}`,
      "info"
    )
  } else if (shas.length > 1) {
    toast.show(`${shas.length} commits of ${state.commits.length}`, "info")
  } else {
    const msg = commit ? `${commit.sha}: ${commit.message}` : sha
    const truncMsg = msg.length > 50 ? msg.slice(0, 49) + "…" : msg
    toast.show(`Commit ${commitIdx}/${state.commits.length}: ${truncMsg}`, "info")
  }
  render()
  setTimeout(() => { toast.clear(); render() }, 1500)
}
