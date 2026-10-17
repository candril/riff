import { Show } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme"
import type { SearchPromptModel } from "./prompt-line-model"

export interface SearchPromptProps {
  model: SearchPromptModel
  /** PromptInput's search field, which outlives every search. */
  field: InputRenderable
}

/** The search row: `/pattern` or `?pattern`. Match counts are the status bar's. */
export function SearchPrompt(props: SearchPromptProps) {
  const promptColor = () => (props.model.tone === "error" ? theme.red : theme.text)

  return (
    <box height={1} width="100%" backgroundColor={theme.surface0} flexDirection="row" paddingLeft={1}>
      <text fg={promptColor()}>{props.model.prefix}</text>
      {/* The field stays mounted and is only hidden once the search is
          confirmed: a node Solid removes is destroyed on the next tick
          once it has no parent, and PromptInput hands out this same field
          for every search. */}
      <box visible={props.model.typing} flexGrow={1} flexDirection="row">
        {props.field}
      </box>
      <Show when={!props.model.typing}>
        <text fg={promptColor()}>{props.model.pattern}</text>
      </Show>
      <Show when={props.model.loading}>
        <text fg={theme.subtext0}>{" Loading..."}</text>
      </Show>
      <Show when={props.model.error}>
        <text fg={theme.red}>{` ${props.model.error}`}</text>
      </Show>
    </box>
  )
}
