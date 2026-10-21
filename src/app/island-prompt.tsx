import type { InputRenderable } from "@opentui/core"
import { PromptField } from "../components/PromptField"
import { createPromptSession } from "./prompt-session"

/**
 * A prompt field and its typing session, for an island to own. One field
 * per island, so a field never moves between boxes: the palette's Enter
 * opens a picker in the same keypress, and a single field moved from the
 * palette's box into the picker's in that frame left the terminal scrolled
 * by a screen.
 */
export function createIslandPrompt(owner: string) {
  let input: InputRenderable | undefined
  const field = (): InputRenderable => {
    if (!input) throw new Error(`the ${owner} prompt's field is read before its island mounted it`)
    return input
  }
  const session = createPromptSession(field)
  return {
    /** Called once, inside the island's Solid root, which then keeps the node for its whole life. */
    createField: () => (
      <PromptField owner={owner} ref={(node) => (input = node)} onInput={session.input} onSubmit={session.submit} />
    ),
    prompt: session.sync,
    field,
  }
}
