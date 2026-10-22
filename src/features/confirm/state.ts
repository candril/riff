/**
 * The confirmation dialog's state. The feature owns it rather than AppState,
 * which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"

export interface ConfirmDialogState {
  title: string
  message: string
  details?: string
  /** Called when the user presses `y`. */
  onConfirm: () => void
  /** Called when the user presses `n` or Escape. */
  onCancel: () => void
}

export type ConfirmState = ReturnType<typeof createConfirmState>

export function createConfirmState() {
  const [dialog, setDialog] = createSignal<ConfirmDialogState | null>(null)

  return {
    dialog,
    show(next: ConfirmDialogState) {
      // Wrapped, so the setter can never take the dialog for an updater.
      setDialog(() => next)
    },
    close() {
      setDialog(null)
    },
  }
}
