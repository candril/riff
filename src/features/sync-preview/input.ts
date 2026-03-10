/**
 * Sync Preview input handling.
 *
 * The sync preview captures all input when open. It shows pending syncs
 * (edits and replies) and executes them on Enter.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"

export interface SyncPreviewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Called when user confirms sync
  onExecuteSync: () => void
}

/**
 * Handle input when sync preview is open.
 * Returns true if the key was handled (preview is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: SyncPreviewInputContext
): boolean {
  if (!ctx.state.syncPreview.open) {
    return false
  }

  // Escape closes
  if (key.name === "escape") {
    ctx.setState((s) => ({
      ...s,
      syncPreview: { ...s.syncPreview, open: false },
    }))
    ctx.render()
    return true
  }

  // Enter executes sync
  if (key.name === "return" || key.name === "enter") {
    if (!ctx.state.syncPreview.loading) {
      ctx.onExecuteSync()
    }
    return true
  }

  // Capture all other keys when preview is open
  return true
}
