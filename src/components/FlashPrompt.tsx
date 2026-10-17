import { theme } from "../theme"
import type { FlashPromptModel } from "./prompt-line-model"

/** Flash's input row: what has been typed and how many targets are live. */
export function FlashPrompt(props: { model: FlashPromptModel }) {
  return (
    <box height={1} width="100%" backgroundColor={theme.surface0} flexDirection="row" paddingLeft={1} gap={1}>
      <text fg={theme.mauve}>flash</text>
      <text fg={props.model.noMatches ? theme.red : theme.text}>{props.model.pattern}</text>
      <text fg={props.model.noMatches ? theme.red : theme.overlay1}>{`(${props.model.hint})`}</text>
    </box>
  )
}
