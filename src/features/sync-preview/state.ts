/**
 * The sync preview's state. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export type SyncPreviewState = ReturnType<typeof createSyncPreviewState>

export function createSyncPreviewState() {
  const [open, setOpen] = createSignal(false)
  const [loading, setLoading] = createSignal(false)

  return {
    open,
    loading,
    show() {
      batch(() => {
        setOpen(true)
        setLoading(false)
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setLoading(false)
      })
    },
    startSync() {
      setLoading(true)
    },
  }
}
