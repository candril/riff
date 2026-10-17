import { theme } from "../theme"
import type { ToastModel, ToastType } from "./notification-model"

export type { ToastType }

const TONE: Record<ToastType, string> = {
  success: theme.green,
  error: theme.red,
  info: theme.blue,
}

/** A one-row notice; only the icon carries the tone, the row sits on mantle like every overlay. */
export function Toast(props: { model: ToastModel }) {
  return (
    <box height={1} backgroundColor={theme.mantle} paddingX={2} flexDirection="row">
      <text fg={TONE[props.model.tone]}>{props.model.icon}</text>
      <text fg={theme.text}>{` ${props.model.message}`}</text>
    </box>
  )
}
