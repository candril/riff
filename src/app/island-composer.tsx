import type { TextareaRenderable } from "@opentui/core"
import { CommentComposer } from "../components/CommentComposer"
import { createComposerSession, PLACEHOLDER_COMPOSE } from "./composer-session"

/** How the overlay's keys read and write the composer's text. */
export interface ComposerHandle {
  value(): string
  cursorOffset(): number
  setValue(text: string): void
  replaceRange(start: number, end: number, replacement: string): void
}

/**
 * The comment composer's textarea and its typing session, for the thread
 * panel island to own. Each island has its own, so a second renderer never
 * types into a textarea the first one built.
 */
export function createIslandComposer() {
  let textarea: TextareaRenderable | undefined
  const node = (): TextareaRenderable => {
    if (!textarea) throw new Error("the comment composer's textarea is read before the thread panel mounted it")
    return textarea
  }
  const session = createComposerSession(node)
  const handle: ComposerHandle = {
    value: session.value,
    cursorOffset: session.cursorOffset,
    setValue: session.setValue,
    replaceRange: session.replaceRange,
  }
  return {
    /** Called once, inside the island's Solid root, which then keeps the node for its whole life. */
    createField: () => (
      <CommentComposer ref={(ref) => (textarea = ref)} placeholder={PLACEHOLDER_COMPOSE} onActivity={session.activity} />
    ),
    compose: session.sync,
    handle,
  }
}
