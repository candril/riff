/**
 * A text object waiting for its object key (`vi` before `f`, spec 055):
 * every key but the chat's reach goes to the vim handler as the object,
 * so `vi[`'s `[` selects the brackets instead of opening `[`'s chords.
 */

import type { KeyEvent } from "@opentui/core"
import type { RiffKeymap } from "./keymap"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { chatReaches } from "../features/chat/keys"

export interface TextObjectKeyDeps {
  getState: () => AppState
  getVimState: () => VimCursorState
  searchActive: () => boolean
  feed: (key: KeyEvent) => void
  render: () => void
}

/**
 * Whether the pending text object takes `key`. The chain asked the chat
 * ahead of the text object, so Ctrl-r opened the chat even with one
 * pending; and the chat's reach stands aside under any capture that holds
 * the key, so a capture active for Ctrl-r would swallow it.
 */
export function textObjectTakes(
  key: Pick<KeyEvent, "name" | "ctrl">,
  state: AppState,
  vim: Pick<VimCursorState, "pendingTextObject">,
  searchActive: boolean,
): boolean {
  return vim.pendingTextObject !== null && state.focusedPanel === "diff" && !chatReaches(key, state, searchActive)
}

export function registerTextObjectKeys(riffKeymap: RiffKeymap, deps: TextObjectKeyDeps): () => void {
  // Nothing is prevented: the chain never prevented the keys it fed the vim handler.
  return riffKeymap.capture(
    (key) => textObjectTakes(key, deps.getState(), deps.getVimState(), deps.searchActive()),
    (key) => {
      deps.feed(key)
      deps.render()
    },
  )
}
