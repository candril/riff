/**
 * Comments picker input handling (spec 044).
 *
 * Captures all input when open. Enter pushes a jumplist entry, hands the
 * selected comment to `onSelectComment`, and closes the modal.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import {
  closeCommentsPicker,
  moveCommentsPickerSelection,
} from "../../state"
import { getFilteredEntries } from "./filter"

export interface CommentsPickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /** Push current location onto the jumplist before navigating (spec 038). */
  recordJump?: () => void
  /**
   * Handle the actual jump: file switch, cursor placement, overlay open.
   * Wired up by the global-keys layer so this module stays decoupled
   * from line-mapping / vim state.
   */
  onSelectComment: (comment: Comment) => void
}

export function handleInput(key: KeyEvent, ctx: CommentsPickerInputContext): boolean {
  if (!ctx.state.commentsPicker.open) return false

  const filtered = getFilteredEntries(ctx.state)
  const maxIndex = Math.max(0, filtered.length - 1)

  const consume = (): void => key.preventDefault()

  switch (key.name) {
    case "escape":
      consume()
      ctx.setState(closeCommentsPicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      consume()
      const entry = filtered[ctx.state.commentsPicker.selectedIndex]
      if (entry) {
        ctx.recordJump?.()
        ctx.setState(closeCommentsPicker)
        ctx.onSelectComment(entry.comment)
      }
      return true
    }

    case "up":
      consume()
      ctx.setState((s) => moveCommentsPickerSelection(s, -1, maxIndex))
      ctx.render()
      return true

    case "down":
      consume()
      ctx.setState((s) => moveCommentsPickerSelection(s, 1, maxIndex))
      ctx.render()
      return true

    case "p":
      // Ctrl-p moves up; a bare `p` is a letter of the query.
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveCommentsPickerSelection(s, -1, maxIndex))
        ctx.render()
      }
      return true

    case "n":
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveCommentsPickerSelection(s, 1, maxIndex))
        ctx.render()
      }
      return true

    default:
      // Everything else is typing, and belongs to the prompt field.
      return true
  }
}
