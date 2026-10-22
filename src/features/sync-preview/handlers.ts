import type { AppState } from "../../state"
import type { SyncPreviewState } from "./state"
import type { ToastState } from "../toast/state"

export interface SyncPreviewOpenContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  syncPreview: Pick<SyncPreviewState, "show">
}

/** Opens the sync preview (gs); a local review has no PR to sync to. */
export function handleOpenSyncPreview(ctx: SyncPreviewOpenContext): void {
  const state = ctx.getState()
  if (state.appMode !== "pr") {
    ctx.toast.show("Sync only available in PR mode", "error")
    ctx.render()
    setTimeout(() => {
      ctx.toast.clear()
      ctx.render()
    }, 3000)
    return
  }

  ctx.syncPreview.show()
  ctx.render()
}
