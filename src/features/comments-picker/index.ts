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
import {
  openInlineCommentOverlay,
  expandThreadFor,
  highlightInlineComment,
  showToast,
  clearToast,
  switchView,
} from "../../state"
import { handleSelectFile, ensureFileExpanded, type FileNavigationContext } from "../file-navigation"

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
  // A comment is anchored to a line of the diff, so going to one means
  // going there — from the overview or the feed as much as from the diff.
  if (state.viewMode !== "diff") ctx.setState((s) => switchView(s, "diff"))
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
  } else {
    ensureFileExpanded(comment.filename, ctx.fileNavContext)
  }

  const mapping = ctx.getLineMapping()
  const visualLine = mapping.findLineForComment(comment)
  if (visualLine !== null) {
    ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
    ctx.ensureCursorVisible()
  }

  // Open the panel on the thread, then put the highlight on the comment
  // that was picked — which means opening the thread when it is folded
  // shut, or the panel lands on a root that says nothing about it.
  ctx.setState((s) => {
    const opened = openInlineCommentOverlay(s, comment.filename, comment.line, comment.side, "view")
    return highlightInlineComment(expandThreadFor(opened, comment.id), comment.id)
  })
  ctx.render()
}
