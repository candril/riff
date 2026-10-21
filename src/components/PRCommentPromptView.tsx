import { theme } from "../theme"
import type { PrCommentPromptModel } from "./pr-comment-prompt"

/** The `gC` prompt's dimmed backdrop and box, centred in whatever hosts it. */
export function PRCommentPrompt(props: { model: PrCommentPromptModel }) {
  return (
    <>
      <box
        id="pr-comment-input-bg"
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="#00000080"
      />
      <box id="pr-comment-input-box" width={60} flexDirection="column" backgroundColor={theme.mantle} paddingX={2} paddingY={1}>
        <box id="pr-comment-input-header" flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text fg={theme.text}>Add PR Comment</text>
          <text fg={theme.overlay0}>Esc to cancel</text>
        </box>
        <box id="pr-comment-input-text-box" backgroundColor={theme.surface0} paddingX={1}>
          <text id="pr-comment-input-text" fg={props.model.textFg}>
            {props.model.text}
          </text>
        </box>
        <box id="pr-comment-input-status-box" marginTop={1}>
          <text id="pr-comment-input-status" fg={props.model.statusFg}>
            {props.model.status}
          </text>
        </box>
      </box>
    </>
  )
}
