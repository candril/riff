/**
 * PR Info Panel handlers (spec 041).
 *
 * With the panel promoted to a first-class view, "opening" the panel is
 * just switching to `viewMode === "pr"`. Extended PR info (commits,
 * reviews, conversation comments, checks) is already loaded by
 * `loadPrSession` at startup, so there's nothing to fetch here.
 */

import type { AppState } from "../../state"
import { openPRInfoPanel } from "../../state"
import type { PrCommentInputState } from "./comment-input-state"

export interface PRInfoPanelOpenContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  commentInput: Pick<PrCommentInputState, "close">
}

/**
 * Enter the PR overview. No-op outside PR mode.
 */
export async function handleOpenPRInfoPanel(ctx: PRInfoPanelOpenContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) return

  ctx.setState(openPRInfoPanel)
  // Entering the overview starts it afresh, and a prompt left open belongs to the visit before.
  ctx.commentInput.close()
  ctx.render()
}
