import type { AppState } from "../../state"
import { showToast, clearToast } from "../../state"
import type { SyncPreviewState } from "./state"

export interface SyncPreviewOpenContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  syncPreview: Pick<SyncPreviewState, "show">
}

/** Opens the sync preview (gs); a local review has no PR to sync to. */
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

  ctx.syncPreview.show()
  ctx.render()
}
