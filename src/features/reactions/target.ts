import type { AppState } from "../../state"
import type { ReactionTarget } from "../../types"
import { highlightedComment } from "../inline-comment-overlay/view-actions"

/**
 * What React… and Copy Comment Link act on: whatever has focus when they
 * are asked, picked the way `filterTarget` picks what Ctrl-f narrows.
 *
 * Derived rather than stored: a stored copy goes stale whenever the
 * highlight moves by a path that forgets to rewrite it, and then React…
 * lands on a comment the reader is no longer looking at.
 *
 * `overviewTarget` is a thunk so the PR overview is asked only when it is
 * the view on screen.
 */
export function reactionTargetOf(
  state: AppState,
  overviewTarget: () => ReactionTarget | null,
): ReactionTarget | null {
  const panelOpen = state.inlineCommentOverlay.open
  if (panelOpen && state.focusedPanel === "comments") return highlightedTarget(state)
  if (state.viewMode === "state") return overviewTarget()
  if (state.viewMode === "diff" && panelOpen) return highlightedTarget(state)
  return null
}

function highlightedTarget(state: AppState): ReactionTarget | null {
  const githubId = highlightedComment(state)?.githubId
  return githubId ? { kind: "review-comment", githubId } : null
}
