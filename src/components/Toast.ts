import { Box, Text } from "@opentui/core"
import { theme } from "../theme"

export type ToastType = "success" | "error" | "info"

export interface ToastProps {
  message: string
  type: ToastType
}

/**
 * Toast notification - renders at top-right of screen
 */
export function Toast({ message, type }: ToastProps) {
  const colors: Record<ToastType, { bg: string; fg: string; icon: string }> = {
    success: { bg: theme.green, fg: theme.base, icon: "✓" },
    error: { bg: theme.red, fg: theme.base, icon: "✗" },
    info: { bg: theme.blue, fg: theme.base, icon: "i" },
  }
  
  const { bg, fg, icon } = colors[type]

  return Box(
    {
      id: "toast-container",
      position: "absolute",
      top: 1,
      right: 2,
      backgroundColor: bg,
      paddingX: 2,
      paddingY: 0,
      zIndex: 100,
    },
    Text({ content: `${icon} ${message}`, fg })
  )
}
