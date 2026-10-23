import { Show } from "solid-js"
import { theme, colors } from "../theme"
import type { ConfirmAlternativeModel, ConfirmDialogModel } from "./confirm-dialog-model"

// A second answer carries a longer command; the extra room keeps a typical one on its row.
const WIDTH = 50
const WIDTH_WITH_ALTERNATIVE = 64

export function ConfirmDialog(props: { model: ConfirmDialogModel }) {
  return (
    <box width={props.model.alternative ? WIDTH_WITH_ALTERNATIVE : WIDTH} flexDirection="column" backgroundColor={theme.base}>
      <box paddingX={2} paddingY={1} backgroundColor={theme.mantle}>
        <text fg={theme.yellow}>{props.model.title}</text>
      </box>
      <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
        <text fg={theme.text}>{props.model.message}</text>
        <Show when={props.model.details}>
          <text fg={colors.textDim}>{props.model.details}</text>
        </Show>
        <Show when={props.model.alternative}>
          {(alternative: () => ConfirmAlternativeModel) => (
            <box flexDirection="column">
              <box flexDirection="row">
                <text fg={theme.yellow}>{alternative().key}</text>
                <text fg={colors.textMuted}>{` ${alternative().label}`}</text>
              </box>
              <Show when={alternative().details}>
                <text fg={colors.textDim}>{alternative().details}</text>
              </Show>
            </box>
          )}
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
