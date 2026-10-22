import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { chatReaches } from "../features/chat/keys"

const BLAME_PEEK_CHORDS = new Set(["go", "gb"])

/**
 * Whether a completed chord may act while a peek is up. The peeks let `g`
 * through only so their own chords can complete; anything else would move
 * the diff, open a panel or stack a second peek behind the modal one.
 */
export function chordAllowedUnderPeek(
  sequence: string,
  state: Pick<AppState, "blamePeek" | "showLinePeek" | "viewMode">,
): boolean {
  if (state.blamePeek && state.viewMode === "diff") return BLAME_PEEK_CHORDS.has(sequence)
  if (state.showLinePeek) return sequence === "gl"
  return true
}

/** What both peeks read to decide whether they hold a key, beyond whether they are up. */
export interface PeekKeyContext {
  getState: () => AppState
  getVimState: () => VimCursorState
  searchActive: () => boolean
  /** Whether a chord waits for its second key, which is the chord's rather than the peek's. */
  chordPending: () => boolean
}

/**
 * Whether an open peek leaves `key` to the handlers behind it. A bare `g`
 * goes on to the keymap's g sequences, or `gb`, `go` and `gl` could not
 * complete, and so does every key while a chord is pending. A pending text
 * object (`vi` waiting for its object) is answered by the text object's
 * capture registered behind both peeks, which stand aside for it, so `vi`
 * under a peek still gets its object. The chat's reach comes ahead of them
 * too.
 */
export function peekLeaves(key: KeyEvent, ctx: PeekKeyContext): boolean {
  const state = ctx.getState()
  if (key.name === "g" && !key.ctrl && !key.shift) return true
  if (ctx.chordPending()) return true
  if (ctx.getVimState().pendingTextObject && state.focusedPanel === "diff") return true
  return chatReaches(key, state, ctx.searchActive())
}
