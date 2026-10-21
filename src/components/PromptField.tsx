import type { InputRenderable } from "@opentui/core"
import { theme } from "../theme"

/**
 * The one-line field a prompt types into (spec 065). It is OpenTUI's input,
 * so `Ctrl-w`, `Ctrl-u`, word motions, paste, undo and selection are the
 * widget's behaviour rather than riff's. The island that draws the prompt
 * mounts it once and keeps it, which is what keeps the cursor where the
 * typist left it.
 */
export function PromptField(props: {
  owner: string
  ref: (input: InputRenderable) => void
  onInput: (value: string) => void
  onSubmit: () => void
}) {
  return (
    <input
      id={`prompt-input-${props.owner}`}
      ref={props.ref}
      backgroundColor="transparent"
      focusedBackgroundColor="transparent"
      textColor={theme.text}
      focusedTextColor={theme.text}
      placeholderColor={theme.overlay0}
      cursorColor={theme.yellow}
      cursorStyle={{ style: "line", blinking: true }}
      flexGrow={1}
      onInput={props.onInput}
      onSubmit={() => props.onSubmit()}
    />
  )
}
