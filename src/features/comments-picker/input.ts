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
  setCommentsPickerQuery,
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

  switch (key.name) {
    case "escape":
      ctx.setState(closeCommentsPicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      const entry = filtered[ctx.state.commentsPicker.selectedIndex]
      if (entry) {
        ctx.recordJump?.()
        ctx.setState(closeCommentsPicker)
        ctx.onSelectComment(entry.comment)
      }
      return true
    }

    case "up":
      ctx.setState((s) => moveCommentsPickerSelection(s, -1, maxIndex))
      ctx.render()
      return true

    case "down":
      ctx.setState((s) => moveCommentsPickerSelection(s, 1, maxIndex))
      ctx.render()
      return true

    case "p":
      if (key.ctrl) {
        ctx.setState((s) => moveCommentsPickerSelection(s, -1, maxIndex))
        ctx.render()
        return true
      }
      ctx.setState((s) => setCommentsPickerQuery(s, s.commentsPicker.query + "p"))
      ctx.render()
      return true

    case "n":
      if (key.ctrl) {
        ctx.setState((s) => moveCommentsPickerSelection(s, 1, maxIndex))
        ctx.render()
        return true
      }
      ctx.setState((s) => setCommentsPickerQuery(s, s.commentsPicker.query + "n"))
      ctx.render()
      return true

    case "backspace":
      if (ctx.state.commentsPicker.query.length > 0) {
        ctx.setState((s) =>
          setCommentsPickerQuery(s, s.commentsPicker.query.slice(0, -1))
        )
        ctx.render()
      }
      return true

    default:
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState((s) => setCommentsPickerQuery(s, s.commentsPicker.query + key.sequence))
        ctx.render()
      }
      return true
  }
}
