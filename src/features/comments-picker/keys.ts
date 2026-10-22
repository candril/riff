/**
 * Comments picker keys (spec 044). Enter closes the modal and hands the
 * selected comment to `onSelectComment`.
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import { getFilteredEntries } from "./filter"
import type { CommentsPickerState } from "./state"

export interface CommentsPickerKeyDeps {
  getState: () => AppState
  /** The comments picker's state, the same instance the frame pass reads. */
  commentsPicker: CommentsPickerState
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
    active: () => deps.commentsPicker.open(),
    close: () => {
      deps.commentsPicker.close()
      deps.render()
    },
    pick: () => {
      const entry = getFilteredEntries(deps.getState(), deps.commentsPicker.query())[deps.commentsPicker.selectedIndex()]
      if (!entry) return
      deps.commentsPicker.close()
      deps.onSelectComment(entry.comment)
    },
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = Math.max(0, getFilteredEntries(deps.getState(), deps.commentsPicker.query()).length - 1)
      deps.commentsPicker.move(delta, maxIndex)
      deps.render()
    },
  })
}
