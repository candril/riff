import type { InputRenderable } from "@opentui/core"
import { For, Show } from "solid-js"
import { colors, theme } from "../theme"
import { FIELD_PLACEHOLDER, type OpenPrModel, type OpenPrRowModel } from "./open-pr-model"

export const OPEN_PR_WIDTH = 76

/**
 * Drawn on `base` with the field on `surface0` (spec 106). The field stays
 * mounted while the list shows, so backing out finds the text as it was left.
 */
export function OpenPrScreen(props: {
  model: OpenPrModel
  width: number
  version: string
  nothingHere: string | null
  initialText: string
  inputRef: (input: InputRenderable) => void
  onInput: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center" backgroundColor={theme.base}>
      <box width={props.width} flexDirection="column" gap={1}>
        <box flexDirection="column">
          <text fg={theme.overlay0}>{`riff ${props.version}`}</text>
          <Show when={props.nothingHere}>
            <text fg={theme.overlay1}>{props.nothingHere}</text>
          </Show>
        </box>
        <text fg={colors.primary}>{props.model.heading}</text>
        <box visible={props.model.rows === null} height={1} flexDirection="row" paddingLeft={1} paddingRight={1} backgroundColor={theme.surface0}>
          <input
            ref={props.inputRef}
            value={props.initialText}
            flexGrow={1}
            placeholder={FIELD_PLACEHOLDER}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            textColor={theme.text}
            focusedTextColor={theme.text}
            placeholderColor={theme.overlay0}
            cursorColor={theme.yellow}
            onInput={(value: string) => props.onInput(value)}
            onSubmit={() => props.onSubmit()}
          />
        </box>
        <Show when={props.model.rows}>
          {(rows: () => readonly OpenPrRowModel[]) => (
            <box flexDirection="column">
              <For each={rows()}>
                {(row) => (
                  <box height={1} flexDirection="row" gap={2} paddingLeft={1} backgroundColor={row.selected ? theme.surface0 : undefined}>
                    <text flexShrink={0} wrapMode="none" fg={row.selected ? theme.text : theme.subtext0}>{row.repo}</text>
                    <text wrapMode="none" fg={theme.overlay1}>{row.detail}</text>
                  </box>
                )}
              </For>
            </box>
          )}
        </Show>
        <Show when={props.model.message}>
          {(message: () => NonNullable<OpenPrModel["message"]>) => <text fg={message().tone === "error" ? colors.error : theme.overlay1}>{message().text}</text>}
        </Show>
        <text fg={theme.overlay0}>{props.model.hint}</text>
      </box>
    </box>
  )
}
