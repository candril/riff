/**
 * Editing the pull request's title and body: the reader rewrites them in
 * their editor, with the PR's diff below the scissors line, and gh saves
 * them. The editor and gh come in as sources, so a test can run it with
 * neither.
 */

import type { AppState } from "../../state"
import { getPrDiff } from "../../providers/github/diff"
import { editPullRequest } from "../../providers/github/mutations"
import { openPrEditor } from "../../utils/editor/spawn"
import { prFileSummary } from "../../utils/editor/pr-template"
import type { ToastState } from "../toast/state"

export interface EditPrSources {
  getPrDiff: typeof getPrDiff
  openPrEditor: typeof openPrEditor
  editPullRequest: typeof editPullRequest
}

export const liveEditPrSources: EditPrSources = {
  getPrDiff,
  openPrEditor,
  editPullRequest,
}

export interface EditPrContext {
  sources: EditPrSources
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  /** The editor takes the terminal while the reader edits the PR. */
  suspend: () => void
  resume: () => void
  later: (fn: () => void, ms: number) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
}

export async function handleEditPr(ctx: EditPrContext): Promise<void> {
  const { prInfo } = ctx.getState()
  if (!prInfo) return

  ctx.toast.show("Fetching PR diff...", "info")
  ctx.render()

  let suspended = false
  try {
    const diff = await ctx.sources.getPrDiff(prInfo.number, prInfo.owner, prInfo.repo)
    const fileSummary = prFileSummary(ctx.getState().files)

    // A toast left up would be the first thing drawn when the editor hands the terminal back.
    ctx.toast.clear()
    ctx.suspend()
    suspended = true

    const result = await ctx.sources.openPrEditor({
      title: prInfo.title,
      body: prInfo.body,
      diff,
      fileSummary,
    })

    ctx.resume()
    suspended = false

    if (!result) {
      // An empty title or a failed editor means the reader backed out: nothing goes to GitHub.
      ctx.render()
      return
    }

    if (result.title === prInfo.title && result.body === prInfo.body) {
      ctx.toast.show("No changes made", "info")
      ctx.render()
      ctx.later(() => {
        ctx.toast.clear()
        ctx.render()
      }, 2000)
      return
    }

    ctx.toast.show("Updating PR...", "info")
    ctx.render()

    await ctx.sources.editPullRequest(prInfo.number, result.title, result.body, prInfo.owner, prInfo.repo)

    // riff may have moved on to another PR while the editor and gh had the
    // reader; GitHub still took the edit, but it belongs to the PR edited.
    ctx.setState((s) => {
      const current = s.prInfo
      if (!current || current.number !== prInfo.number || current.owner !== prInfo.owner || current.repo !== prInfo.repo) return s
      return { ...s, prInfo: { ...current, title: result.title, body: result.body } }
    })

    ctx.toast.show("PR updated", "success")
    ctx.render()
    ctx.later(() => {
      ctx.toast.clear()
      ctx.render()
    }, 2000)
  } catch (err) {
    if (suspended) ctx.resume()
    const msg = err instanceof Error ? err.message : "Unknown error"
    ctx.toast.show(`Error: ${msg}`, "error")
    ctx.render()
    ctx.later(() => {
      ctx.toast.clear()
      ctx.render()
    }, 3000)
  }
}
