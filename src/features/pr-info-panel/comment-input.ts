/**
 * The PR overview's comment prompt (`c` in the conversation section), a
 * sub-modal that types into its state rather than a focused field.
 */

import { submitPrComment } from "../../providers/github/mutations"
import type { PRInfoPanelDeps } from "./actions"

type Deps = PRInfoPanelDeps

export function closeCommentInput(deps: Deps): void {
  deps.commentInput.close()
  deps.render()
}

/** Posts the comment, unless it is blank; the prompt closes once GitHub has it. */
export function submitComment(deps: Deps, post: typeof submitPrComment = submitPrComment): void {
  const { prInfo } = deps.getState()
  const { text } = deps.commentInput.current()
  if (!text.trim() || !prInfo) return
  deps.commentInput.setLoading(true)
  deps.render()

  post(
    prInfo.owner,
    prInfo.repo,
    prInfo.number,
    text.trim()
  ).then(result => {
    if (result.success) {
      deps.commentInput.close()
      deps.toast.show("Comment posted", "success")
      deps.render()
      setTimeout(() => {
        deps.toast.clear()
        deps.render()
      }, 2000)
    } else {
      fail(result.error ?? "Failed to post comment")
    }
  }, (error: unknown) => {
    fail(error instanceof Error ? error.message : String(error))
  })

  function fail(message: string): void {
    deps.commentInput.fail(message)
    deps.render()
  }
}

export function deleteCommentChar(deps: Deps): void {
  const { text } = deps.commentInput.current()
  if (text.length > 0) {
    deps.commentInput.setText(text.slice(0, -1))
    deps.render()
  }
}

export function typeIntoComment(deps: Deps, text: string): void {
  deps.commentInput.setText(deps.commentInput.current().text + text)
  deps.render()
}

export function newlineInComment(deps: Deps): void {
  typeIntoComment(deps, "\n")
}
