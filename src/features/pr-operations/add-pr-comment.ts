/**
 * Posting a comment on the pull request's conversation, written in the
 * reader's editor. The editor and gh come in as sources, so a test can run
 * it with neither.
 */

import type { AppState } from "../../state"
import { submitPrComment } from "../../providers/github/mutations"
import { openPrCommentEditor } from "../../utils/editor/spawn"
import type { ToastState } from "../toast/state"

export interface AddPrCommentSources {
  openPrCommentEditor: typeof openPrCommentEditor
  submitPrComment: typeof submitPrComment
}

export const liveAddPrCommentSources: AddPrCommentSources = {
  openPrCommentEditor,
  submitPrComment,
}

export interface AddPrCommentContext {
  sources: AddPrCommentSources
  getState: () => AppState
  /** The editor takes the terminal while the reader writes the comment. */
  suspend: () => void
  resume: () => void
  later: (fn: () => void, ms: number) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
}

export async function handleAddPrComment(ctx: AddPrCommentContext): Promise<void> {
  const { prInfo } = ctx.getState()
  if (!prInfo) return

  let suspended = false
  try {
    ctx.suspend()
    suspended = true

    const body = await ctx.sources.openPrCommentEditor()

    ctx.resume()
    suspended = false

    if (!body) {
      ctx.render()
      return
    }

    ctx.toast.show("Posting comment...", "info")
    ctx.render()

    const result = await ctx.sources.submitPrComment(prInfo.owner, prInfo.repo, prInfo.number, body)

    if (result.success) {
      ctx.toast.show("Comment posted", "success")
      ctx.render()
      ctx.later(() => {
        ctx.toast.clear()
        ctx.render()
      }, 2000)
    } else {
      ctx.toast.show(`Error: ${result.error}`, "error")
      ctx.render()
      ctx.later(() => {
        ctx.toast.clear()
        ctx.render()
      }, 3000)
    }
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
