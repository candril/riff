/**
 * Review Preview open handler
 *
 * Handles opening the review preview modal, including caching the current user.
 */

import type { AppState } from "../../state"
import type { AppMode } from "../../types"
import { openReviewPreview } from "../../state"
import { getCurrentUser } from "../../providers/github"

export interface ReviewPreviewOpenContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
  // Cached user (read/write)
  getCachedCurrentUser: () => string | null
  setCachedCurrentUser: (user: string) => void
  // App mode
  mode: AppMode
}

/**
 * Open the review preview (gS)
 * Caches current user for own-PR detection
 */
export async function handleOpenReviewPreview(ctx: ReviewPreviewOpenContext): Promise<void> {
  // Cache current user for own-PR detection
  if (ctx.getCachedCurrentUser() === null && ctx.mode === "pr") {
    try {
      ctx.setCachedCurrentUser(await getCurrentUser())
    } catch {
      ctx.setCachedCurrentUser("")
    }
  }
  ctx.setState(openReviewPreview)
  ctx.render()
}
