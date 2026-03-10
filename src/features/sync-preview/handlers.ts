/**
 * Sync Preview open handler
 *
 * Handles opening the sync preview modal.
 */

import type { AppState } from "../../state"
import { showToast, clearToast } from "../../state"

export interface SyncPreviewOpenContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Render
  render: () => void
}

/**
 * Open the sync preview (gs)
 * Only available in PR mode
 */
export function handleOpenSyncPreview(ctx: SyncPreviewOpenContext): void {
  const state = ctx.getState()
  if (state.appMode !== "pr") {
    ctx.setState((s) => showToast(s, "Sync only available in PR mode", "error"))
    ctx.render()
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 3000)
    return
  }

  ctx.setState((s) => ({
    ...s,
    syncPreview: {
      ...s.syncPreview,
      open: true,
      loading: false,
      error: null,
    },
  }))
  ctx.render()
}
