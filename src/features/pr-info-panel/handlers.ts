/**
 * PR Info Panel handlers (spec 041).
 *
 * With the panel promoted to a first-class view, "opening" the panel is
 * just switching to `viewMode === "state"`. Extended PR info (commits,
 * reviews, conversation comments, checks) is already loaded by
 * `loadPrSession` at startup, so there's nothing to fetch here.
 */

import type { AppState } from "../../state"
import { openPRInfoPanel } from "../../state"
import type { PrCommentInputState } from "./comment-input-state"
import type { PrInfoFilterState } from "./filter-state"
import type { PRInfoPanelClass } from "../../components"

export interface PRInfoPanelOpenContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  commentInput: Pick<PrCommentInputState, "close">
  prInfoFilter: Pick<PrInfoFilterState, "clear">
  /** Where `gp` puts the cursor; the overview opens without it otherwise. */
  getPanel?: () => Pick<PRInfoPanelClass, "focusSection"> | null
| null
}

/** `gp` from anywhere: the overview, standing on the first preview (spec 113). */
export function handleOpenPreviews(ctx: PRInfoPanelOpenContext): void {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) return
  void handleOpenPRInfoPanel(ctx)
  ctx.getPanel?.()?.focusSection('previews')
  ctx.render()
}

/**
 * Enter the PR overview. No-op outside PR mode.
 */
export async function handleOpenPRInfoPanel(ctx: PRInfoPanelOpenContext): Promise<void> {
  const state = ctx.getState()
  if (state.appMode !== "pr" || !state.prInfo) return

  ctx.setState(openPRInfoPanel)
  // Entering the overview starts it afresh: a filter or a prompt left open belongs to the visit before.
  ctx.prInfoFilter.clear()
  ctx.commentInput.close()
  ctx.render()
}
