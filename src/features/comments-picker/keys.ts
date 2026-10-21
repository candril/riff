/**
 * Comments picker keys (spec 044). Enter closes the modal and hands the
 * selected comment to `onSelectComment`.
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import { closeCommentsPicker, moveCommentsPickerSelection } from "../../state"
import { getFilteredEntries } from "./filter"

export interface CommentsPickerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /**
   * The jump itself: file switch, cursor placement, overlay open. Wired by
   * the app so this module stays clear of the line mapping and the cursor.
   */
  onSelectComment: (comment: Comment) => void
}

export function registerCommentsPickerKeys(riffKeymap: RiffKeymap, deps: CommentsPickerKeyDeps): () => void {
  return registerQueryPickerKeys(riffKeymap, {
    name: "commentsPicker",
    category: "Comments picker",
    active: () => deps.getState().commentsPicker.open,
    close: () => {
      deps.setState(closeCommentsPicker)
      deps.render()
    },
    pick: () => {
      const state = deps.getState()
      const entry = getFilteredEntries(state)[state.commentsPicker.selectedIndex]
      if (!entry) return
      deps.setState(closeCommentsPicker)
      deps.onSelectComment(entry.comment)
    },
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = Math.max(0, getFilteredEntries(deps.getState()).length - 1)
      deps.setState((s) => moveCommentsPickerSelection(s, delta, maxIndex))
      deps.render()
    },
  })
}
