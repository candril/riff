/**
 * The sync preview's state. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export type SyncPreviewState = ReturnType<typeof createSyncPreviewState>

export function createSyncPreviewState() {
  const [open, setOpen] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  return {
    open,
    loading,
    error,
    show() {
      batch(() => {
        setOpen(true)
        setLoading(false)
        setError(null)
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setLoading(false)
      })
    },
    startSync() {
      batch(() => {
        setLoading(true)
        setError(null)
      })
    },
  }
}
