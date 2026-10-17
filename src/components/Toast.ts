import { Box, Text } from "@opentui/core"
import { theme } from "../theme"
import { toastModel, type ToastType } from "./notification-model"

export type { ToastType }

export interface ToastProps {
  message: string
  type: ToastType
}

/**
 * Toast notification - renders at top-right of screen
 */
export function Toast({ message, type }: ToastProps) {
  const bgs: Record<ToastType, string> = {
    success: theme.green,
    error: theme.red,
    info: theme.blue,
  }
  const model = toastModel(message, type)

  return Box(
    {
      id: "toast-container",
      position: "absolute",
      top: 1,
      right: 2,
      backgroundColor: bgs[model.tone],
      paddingX: 2,
      paddingY: 0,
      zIndex: 100,
    },
    Text({ content: `${model.icon} ${model.message}`, fg: theme.base })
  )
}
