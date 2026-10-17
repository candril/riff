import { Show } from "solid-js"
import { theme, colors } from "../theme"
import type { ConfirmDialogModel } from "./confirm-dialog-model"

export function ConfirmDialog(props: { model: ConfirmDialogModel }) {
  return (
    <box width={50} flexDirection="column" backgroundColor={theme.base}>
      <box paddingX={2} paddingY={1} backgroundColor={theme.mantle}>
        <text fg={theme.yellow}>{props.model.title}</text>
      </box>
      <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <text fg={theme.text}>{props.model.message}</text>
        <Show when={props.model.details}>
          <text fg={colors.textDim}>{props.model.details}</text>
        </Show>
      </box>
      <box flexDirection="row" paddingX={2} paddingY={1} backgroundColor={theme.mantle}>
        <text fg={theme.green}>Y</text>
        <text fg={colors.textMuted}>es / </text>
        <text fg={theme.red}>n</text>
        <text fg={colors.textMuted}>o</text>
      </box>
    </box>
  )
}
