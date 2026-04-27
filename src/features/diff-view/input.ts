/**
 * Diff View input handling.
 *
 * Handles input when the diff view is focused. Most vim-like navigation
 * is delegated to the vim handler; this handles additional commands.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { VimCursorState } from "../../vim-diff/types"
import { VimMotionHandler, type KeyEvent as VimKeyEvent } from "../../vim-diff/motion-handler"
import type { SearchHandler } from "../../vim-diff/search-handler"
import type { SearchState } from "../../vim-diff/search-state"
import type { VimDiffView } from "../../components"
import { enterVisualLineMode, exitVisualMode } from "../../vim-diff/cursor-state"

export interface DiffViewInputContext {
  readonly state: AppState
  // Vim state management
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  // Vim handler for navigation
  vimHandler: VimMotionHandler
  // Vim diff view for cursor updates
  vimDiffView: VimDiffView
  // Search
  searchState: SearchState
  searchHandler: SearchHandler
  // Get current comment at cursor
  getCurrentComment: () => Comment | null
  // Handlers
  handleAddComment: () => void
  handleExpandDivider: () => void
  handleToggleViewed: (advanceToNext: boolean) => void
  handleSubmitSingleComment: (comment: Comment) => void
  /** spec 039: open the inline comment overlay. `view` requires an
   *  existing thread on the cursor's anchor; `compose` only requires
   *  the line to be commentable. Returns true when the overlay opened. */
  handleOpenInlineOverlay: (mode: "view" | "compose") => boolean
  /** Open the panel in view mode with no specific anchor — used when
   *  `Ctrl-t` is pressed off a commentable line so the toggle still
   *  succeeds and the user sees the file's existing threads. */
  handleOpenPanelView: () => void
  /** Close the comments side panel — paired with `handleOpenInlineOverlay`
   *  so `Ctrl-t` can toggle. */
  handleClosePanel: () => void
}

/**
 * Handle input when diff view is focused.
 * Returns true if the key was handled, false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: DiffViewInputContext
): boolean {
  if (ctx.state.viewMode !== "diff" || ctx.state.focusedPanel !== "diff") {
    return false
  }

  // Convert KeyEvent to VimKeyEvent format
  const vimKey: VimKeyEvent = {
    name: key.name,
    sequence: key.sequence,
    ctrl: key.ctrl,
    shift: key.shift,
  }

  // Let vim handler try first
  if (ctx.vimHandler.handleKey(vimKey)) {
    return true
  }

  // Ctrl-t toggles the comments side panel — open in view mode, close
  // if already open. Pure toggle: never starts a draft. New comments
  // are started with `n` from inside the panel, not from the diff.
  // Mirrors Ctrl-b for the file tree on the opposite side.
  if (key.name === "t" && key.ctrl && !key.shift) {
    if (ctx.state.inlineCommentOverlay.open) {
      ctx.handleClosePanel()
    } else {
      ctx.handleOpenPanelView()
    }
    return true
  }

  // `c` opens the comments panel and starts a new comment on the cursor's
  // line. Visual-line drops into $EDITOR so multi-line context is
  // preserved. preventDefault stops the textarea (focused during the
  // sync re-render) from also seeing this keystroke.
  if (key.name === "c" && !key.ctrl) {
    key.preventDefault()
    const vimState = ctx.getVimState()
    if (vimState.mode === "visual-line") {
      ctx.handleAddComment()
      return true
    }
    if (!ctx.handleOpenInlineOverlay("compose")) {
      ctx.handleAddComment()
    }
    return true
  }

  // Handle Enter: show inline overlay if comments exist, otherwise
  // expand/collapse dividers (spec 039).
  if (key.name === "return" || key.name === "enter") {
    if (!ctx.handleOpenInlineOverlay("view")) {
      ctx.handleExpandDivider()
    }
    return true
  }

  // Handle 'V' for visual line mode (explicit check)
  if (key.name === "v" && key.shift) {
    ctx.setVimState(enterVisualLineMode(ctx.getVimState()))
    ctx.vimDiffView.updateCursor(ctx.getVimState())
    return true
  }

  // Handle 'v' for toggle viewed status (lowercase, no shift)
  if (key.name === "v" && !key.shift && !key.ctrl) {
    ctx.handleToggleViewed(true) // Advance to next unviewed after marking
    return true
  }

  // Handle escape to exit visual mode OR clear search
  if (key.name === "escape") {
    const vimState = ctx.getVimState()
    if (vimState.mode === "visual-line") {
      ctx.setVimState(exitVisualMode(vimState))
      ctx.vimDiffView.updateCursor(ctx.getVimState())
      return true
    }
    // Clear search highlights (if any)
    if (ctx.searchState.pattern) {
      ctx.searchHandler.clearSearch()
      return true
    }
  }

  // Handle '/' for forward search
  if ((key.name === "/" || key.sequence === "/") && !key.ctrl) {
    ctx.searchHandler.startSearch("forward")
    return true
  }

  // Handle '?' for backward search
  if ((key.name === "?" || key.sequence === "?") && !key.ctrl) {
    ctx.searchHandler.startSearch("backward")
    return true
  }

  // Handle '*' for word under cursor search (forward)
  if (key.sequence === "*" || (key.name === "8" && key.shift)) {
    ctx.searchHandler.searchWordUnderCursor("forward")
    return true
  }

  // Handle '#' for word under cursor search (backward)
  if (key.sequence === "#" || (key.name === "3" && key.shift)) {
    ctx.searchHandler.searchWordUnderCursor("backward")
    return true
  }

  // Handle 'n' and 'N' for search repeat
  if (key.name === "n" && !key.ctrl) {
    if (ctx.searchState.pattern) {
      ctx.searchHandler.jumpToMatch(key.shift ? "prev" : "next")
    } else {
      ctx.vimHandler.repeatSearch(key.shift)
    }
    return true
  }

  // Handle 'S' for submit comment (local or edited synced)
  if (key.name === "s" && key.shift) {
    const currentComment = ctx.getCurrentComment()
    if (currentComment) {
      if (currentComment.status === "local" || currentComment.localEdit !== undefined) {
        ctx.handleSubmitSingleComment(currentComment)
      }
    }
    return true
  }

  return false
}
