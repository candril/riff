/**
 * The PR overview's comment prompt (`c` in the conversation section), a
 * sub-modal that types into state rather than a focused field.
 */

import {
  closePRCommentInput,
  setPRCommentInputText,
  setPRCommentInputLoading,
  setPRCommentInputError,
} from "../../state"
import { submitPrComment } from "../../providers/github/mutations"
import type { PRInfoPanelDeps } from "./actions"

type Deps = PRInfoPanelDeps

export function closeCommentInput(deps: Deps): void {
  deps.setState(closePRCommentInput)
  deps.render()
}

/** Posts the comment, unless it is blank; the prompt closes once GitHub has it. */
export function submitComment(deps: Deps): void {
  const { prInfoPanel, prInfo } = deps.getState()
  if (!prInfoPanel.commentInputText.trim() || !prInfo) return
  deps.setState(s => setPRCommentInputLoading(s, true))
  deps.render()

  submitPrComment(
    prInfo.owner,
    prInfo.repo,
    prInfo.number,
    prInfoPanel.commentInputText.trim()
  ).then(result => {
    if (result.success) {
      deps.setState(closePRCommentInput)
      deps.toast.show("Comment posted", "success")
      deps.render()
      setTimeout(() => {
        deps.toast.clear()
        deps.render()
      }, 2000)
    } else {
      deps.setState(s => setPRCommentInputError(s, result.error ?? "Failed to post comment"))
      deps.render()
    }
  })
}

export function deleteCommentChar(deps: Deps): void {
  if (deps.getState().prInfoPanel.commentInputText.length > 0) {
    deps.setState(s => setPRCommentInputText(s, s.prInfoPanel.commentInputText.slice(0, -1)))
    deps.render()
  }
}

export function typeIntoComment(deps: Deps, text: string): void {
  deps.setState(s => setPRCommentInputText(s, s.prInfoPanel.commentInputText + text))
  deps.render()
}

export function newlineInComment(deps: Deps): void {
  typeIntoComment(deps, "\n")
}
