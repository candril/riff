/**
 * PromptInput — the one-line text field every prompt in riff types into
 * (spec 065): the search prompt, the action menu, the file / comments /
 * commit pickers, the feed's filter.
 *
 * It wraps OpenTUI's `InputRenderable`, so `Ctrl-w`, `Ctrl-u`, word motions,
 * paste, undo and selection are the widget's behaviour rather than riff's
 * — the hand-rolled query strings each of those prompts used to keep are
 * what this replaces.
 *
 * The fields outlive the render pass, which is what keeps the cursor where
 * the typist left it (the same arrangement `CommentComposer` uses).
 */

import { InputRenderable, InputRenderableEvents } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import { theme } from "../theme"

/**
 * One field per prompt, keyed by the prompt that owns it. The palette's
 * Enter opens a picker in the same keypress, and a single field moved from
 * the palette's box into the picker's box in that frame left the terminal
 * scrolled by a screen; a field that only ever lives in one prompt does
 * not move.
 */
const inputs = new Map<string, InputRenderable>()
let sessionKey: string | null = null
let changeHandler: ((value: string) => void) | null = null
let submitHandler: (() => void) | null = null

function ensureInput(renderer: CliRenderer, owner: string): InputRenderable {
  let input = inputs.get(owner)
  if (!input) {
    input = new InputRenderable(renderer, {
      id: `prompt-input-${owner}`,
      backgroundColor: "transparent",
      textColor: theme.text,
      focusedBackgroundColor: "transparent",
      focusedTextColor: theme.text,
      placeholderColor: theme.overlay0,
      cursorColor: theme.yellow,
      cursorStyle: { style: "line", blinking: true },
      flexGrow: 1,
    })
    input.on(InputRenderableEvents.INPUT, (value: string) => changeHandler?.(value))
    input.on(InputRenderableEvents.ENTER, () => submitHandler?.())
    inputs.set(owner, input)
  }
  return input
}

export interface PromptSession {
  renderer: CliRenderer
  /** The prompt this is — its field, and the session's identity. A new
   *  key re-seeds the field and takes focus. */
  key: string
  /** What the field starts with — a filter being refined rather than restarted. */
  initialValue: string
  placeholder?: string
  onChange: (value: string) => void
  /** Enter, when the prompt wants it. Most prompts take Enter in their own
   *  key handling instead, where they can act on the selected row. */
  onSubmit?: () => void
}

/** The field belongs to the prompt named by the key's first segment. */
function ownerOf(key: string): string {
  return key.split(":")[0]!
}

/**
 * Drive the field from the render pass. Re-seeding only on a new key is
 * what keeps a re-render mid-typing from resetting the cursor.
 */
export function syncPromptSession(session: PromptSession): void {
  const field = ensureInput(session.renderer, ownerOf(session.key))
  changeHandler = session.onChange
  submitHandler = session.onSubmit ?? null

  if (sessionKey === session.key) return
  if (sessionKey !== null) inputs.get(ownerOf(sessionKey))?.blur()
  sessionKey = session.key
  field.placeholder = session.placeholder ?? ""
  field.value = session.initialValue
  field.focus()
}

/** No prompt is open any more. */
export function endPromptSession(): void {
  if (sessionKey === null) return
  inputs.get(ownerOf(sessionKey))?.blur()
  sessionKey = null
  changeHandler = null
  submitHandler = null
}

/** What is typed right now. "" before any prompt has opened. */
export function readPromptValue(): string {
  return sessionKey === null ? "" : inputs.get(ownerOf(sessionKey))?.value ?? ""
}

/**
 * The field of a prompt, to be placed in whatever draws it. Each prompt
 * gets its own, and gets the same one back every render.
 */
export function PromptInput(renderer: CliRenderer, owner: string): InputRenderable {
  return ensureInput(renderer, owner)
}
