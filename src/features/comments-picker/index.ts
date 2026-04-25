/**
 * Comments Picker Feature (spec 044)
 *
 * PR-wide fuzzy modal over every comment in the diff. Triggered by `gC`.
 * Selecting a comment switches files, positions the cursor, and opens
 * the inline comment overlay (spec 039).
 */

import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { openInlineCommentOverlay, showToast, clearToast } from "../../state"
import { handleSelectFile, type FileNavigationContext } from "../file-navigation"

export {
  handleInput,
  type CommentsPickerInputContext,
} from "./input"

export {
  buildEntries,
  filterEntries,
  getFilteredEntries,
  type CommentsPickerEntry,
} from "./filter"

// Re-export state operations callers may need.
export {
  openCommentsPicker,
  closeCommentsPicker,
} from "../../state"

export interface CommentsPickerJumpContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  ensureCursorVisible: () => void
  render: () => void
  fileNavContext: FileNavigationContext
}

/**
 * Jump to a comment from the picker. Mirrors thread-motion's logic:
 * switch files when needed (only in single-file view), reposition the
 * vim cursor on the comment's anchor line, then open the inline comment
 * overlay (spec 039) on that thread.
 */
export function jumpToComment(comment: Comment, ctx: CommentsPickerJumpContext): void {
  const state = ctx.getState()
  const targetFileIndex = state.files.findIndex((f) => f.filename === comment.filename)

  if (targetFileIndex === -1) {
    ctx.setState((s) => showToast(s, `${comment.filename} no longer in diff`, "error"))
    ctx.render()
    setTimeout(() => {
      ctx.setState(clearToast)
      ctx.render()
    }, 2000)
    return
  }

  const inSingleFileView = state.selectedFileIndex !== null
  if (inSingleFileView && targetFileIndex !== state.selectedFileIndex) {
    handleSelectFile(targetFileIndex, ctx.fileNavContext)
  }

  const mapping = ctx.getLineMapping()
  const visualLine = mapping.findLineForComment(comment)
  if (visualLine !== null) {
    ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
    ctx.ensureCursorVisible()
  }

  ctx.setState((s) =>
    openInlineCommentOverlay(s, comment.filename, comment.line, comment.side, "view")
  )
  ctx.render()
}
