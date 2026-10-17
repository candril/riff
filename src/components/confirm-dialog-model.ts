import type { ConfirmDialogState } from "../state"

/** What the confirm dialog shows; its callbacks stay in state, where the keys read them. */
export interface ConfirmDialogModel {
  title: string
  message: string
  details?: string
}

export function confirmDialogModel({ title, message, details }: ConfirmDialogState): ConfirmDialogModel {
  // Left out rather than undefined, so reconcile sees the same keys every pass.
  return details !== undefined ? { title, message, details } : { title, message }
}
