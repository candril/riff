export type ToastType = "success" | "error" | "info"

/** What a toast shows; `tone` picks its colour. */
export interface ToastModel {
  icon: string
  message: string
  tone: ToastType
}

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error: "✗",
  info: "i",
}

export function toastModel(message: string, type: ToastType): ToastModel {
  return { icon: TOAST_ICONS[type], message, tone: type }
}
