import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import type { ChatState } from "./state"

export interface ChatKeyContext {
  state: ChatState
  input: () => TextareaRenderable | null
  /** Esc with no answer running: back to the diff, the chat left open. */
  focusDiff: () => void
  /** Bare Ctrl-h, which terminals send as backspace, on an empty input. */
  walkLeft: () => void
}

/**
 * The chat's own keys while it has focus. Every key stops here, so nothing
 * typed into the chat reaches the diff; what is not one of these is left
 * to the textarea, which runs after the global handler unless a key is
 * prevented.
 */
export function handleChatKey(key: KeyEvent, ctx: ChatKeyContext): true {
  const input = ctx.input()
  if (!(key.ctrl && key.name === "n")) ctx.state.cancelNewConversation()

  if ((key.name === "return" || key.name === "enter") && !key.shift && !key.meta) {
    key.preventDefault()
    const text = input?.plainText ?? ""
    // A question that did not go keeps its text, so a mistyped @path is fixed rather than retyped.
    if (ctx.state.send(text)) input?.clear()
    return true
  }
  // Ctrl-j is a line feed on the wire; the kitty protocol reports it as itself.
  if (key.name === "linefeed" || (key.ctrl && key.name === "j")) {
    key.preventDefault()
    input?.newLine()
    return true
  }
  if (key.name === "escape") {
    key.preventDefault()
    if (ctx.state.status() === "answering") ctx.state.interrupt()
    else ctx.focusDiff()
    return true
  }
  if (key.ctrl && key.name === "n") {
    key.preventDefault()
    ctx.state.newConversation()
    return true
  }
  // Ctrl-h and backspace are one key on most terminals: it deletes while there is text, and walks once there is none.
  if (key.name === "backspace" && (input?.plainText ?? "") === "") {
    key.preventDefault()
    ctx.walkLeft()
    return true
  }
  return true
}
