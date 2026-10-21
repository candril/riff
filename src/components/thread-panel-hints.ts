import type { Comment } from "../types"
import { extractCommentImages } from "../utils/comment-images"
import { commentHunk } from "../features/inline-comment-overlay/hunk"
import type { ThreadPanelInput } from "./thread-panel-model"

export type Hint = readonly [string, string]

export function threadPanelHints(
  input: Pick<ThreadPanelInput, "comments" | "focused" | "appMode" | "draft">,
  highlighted: Comment | undefined
): Hint[] {
  const canSubmit = highlighted ? highlighted.status === "local" || highlighted.localEdit !== undefined : false
  const hasImages = highlighted
    ? extractCommentImages(highlighted.localEdit ?? highlighted.body).images.length > 0
    : false
  const hasCode = highlighted !== undefined && commentHunk(input.comments, highlighted.id) !== null
  return viewModeHints(
    canSubmit,
    input.comments.length > 0,
    input.focused,
    input.appMode,
    hasImages,
    hasCode,
    input.draft.length > 0
  )
}

/** A different set focused vs unfocused, so the user always knows the next move. */
function viewModeHints(
  canSubmit: boolean,
  hasComments: boolean,
  focused: boolean,
  appMode: "local" | "pr",
  hasImages: boolean,
  hasCode: boolean,
  hasDraft: boolean
): Hint[] {
  if (!focused) {
    return [["Ctrl-l", "focus"], ["Ctrl-t", "close"]]
  }
  const hints: Hint[] = [["n", hasDraft ? "draft" : "new"]]
  if (hasComments) {
    hints.push(["j/k", "nav"], ["za", "fold"], ["r", "reply"], ["e", "edit"], ["d", "del"], ["x", "resolve"], ["o", "open"])
    if (hasCode) hints.push(["c", "code"])
    if (hasImages) hints.push(["O", "image"])
    // Nothing to submit to in local mode; the key is a no-op there.
    if (canSubmit && appMode === "pr") hints.push(["S", "submit"])
  }
  hints.push(["Ctrl-h", "diff"], ["Ctrl-e", "expand"], ["q", "close"])
  return hints
}
