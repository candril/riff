/**
 * The toast: the one-line notification riff flashes over the review. It is
 * the notification layer, not review state: no part of the review reads it,
 * and each call site that shows one decides when it goes. The feature owns
 * it rather than AppState, which sheds one slice per feature this way (spec
 * 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"
import type { ToastType } from "../../components/notification-model"

export type ToastState = ReturnType<typeof createToastState>

export function createToastState() {
  const [toast, setToast] = createSignal<{ message: string; type: ToastType } | null>(null)

  return {
    /** Null when no toast shows. */
    current: toast,
    show(message: string, type: ToastType = "info") {
      // Callers pass through messages that can be empty, and an empty toast is no toast.
      setToast(message ? { message, type } : null)
    },
    clear() {
      setToast(null)
    },
  }
}
