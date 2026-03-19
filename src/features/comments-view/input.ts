/**
 * Comments View input handling.
 *
 * Handles navigation and actions in the comments view panel.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { CommentsViewPanel } from "../../components/CommentsViewPanel"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import {
  moveCommentSelection,
  selectFile,
  collapseThread,
  expandThread,
  getVisibleComments,
  openCommentsSearch,
  closeCommentsSearch,
  setCommentsSearchQuery,
} from "../../state"
import { groupIntoThreads, flattenThreadsForNav } from "../../utils/threads"
import { filterCommentsBySearch } from "./search"

export interface CommentsViewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Comments view panel instance
  getPanel: () => CommentsViewPanel
  // Vim state management for jumping to comment in diff
  getVimState: () => VimCursorState
  setVimState: (state: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  rebuildLineMapping: () => DiffLineMapping
  // Ensure cursor visible after jump
  ensureCursorVisible: () => void
  // Handlers for complex actions
  handleAddComment: () => void
  handleSubmitSingleComment: (comment: Comment) => void
  handleToggleThreadResolved: () => void
  handleDeleteComment: (comment: Comment) => void
}

/**
 * Handle input when comments search is active.
 * Returns true if the key was handled (search is active), false otherwise.
 */
export function handleSearchInput(
  key: KeyEvent,
  ctx: CommentsViewInputContext
): boolean {
  if (!ctx.state.commentsSearch.active) {
    return false
  }

  switch (key.name) {
    case "escape":
      ctx.setState(closeCommentsSearch)
      ctx.render()
      return true

    case "return":
    case "enter":
      // Confirm search — keep filter active, just close the input prompt
      ctx.setState((s) => ({
        ...s,
        commentsSearch: { ...s.commentsSearch, active: false },
      }))
      ctx.render()
      return true

    case "backspace":
      if (ctx.state.commentsSearch.query.length > 0) {
        ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query.slice(0, -1)))
        ctx.render()
      } else {
        // Backspace on empty query closes search
        ctx.setState(closeCommentsSearch)
        ctx.render()
      }
      return true

    case "w":
      // Ctrl+w: delete last word
      if (key.ctrl) {
        const q = ctx.state.commentsSearch.query
        const trimmed = q.replace(/\S+\s*$/, "")
        ctx.setState((s) => setCommentsSearchQuery(s, trimmed))
        ctx.render()
        return true
      }
      // fallthrough to default
      ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query + "w"))
      ctx.render()
      return true

    case "u":
      // Ctrl+u: clear query
      if (key.ctrl) {
        ctx.setState((s) => setCommentsSearchQuery(s, ""))
        ctx.render()
        return true
      }
      ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query + "u"))
      ctx.render()
      return true

    case "n":
      if (key.ctrl) {
        // Ctrl+n: move selection down
        const items = getFilteredNavItems(ctx.state)
        ctx.setState((s) => moveCommentSelection(s, 1, items.length - 1))
        ctx.render()
        return true
      }
      ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query + "n"))
      ctx.render()
      return true

    case "p":
      if (key.ctrl) {
        // Ctrl+p: move selection up
        const items = getFilteredNavItems(ctx.state)
        ctx.setState((s) => moveCommentSelection(s, -1, items.length - 1))
        ctx.render()
        return true
      }
      ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query + "p"))
      ctx.render()
      return true

    default:
      // Type characters into search
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState((s) => setCommentsSearchQuery(s, s.commentsSearch.query + key.sequence))
        ctx.render()
      }
      // Capture all keys when search is active
      return true
  }
}

/**
 * Get filtered nav items based on current search query.
 * Used by both the input handler and the panel for consistent filtering.
 */
export function getFilteredNavItems(state: AppState) {
  let comments = getVisibleComments(state)
  if (state.commentsSearch.query) {
    comments = filterCommentsBySearch(comments, state.commentsSearch.query)
  }
  const threads = groupIntoThreads(comments)
  return flattenThreadsForNav(
    threads,
    state.selectedFileIndex === null,
    state.commentsSearch.query ? undefined : state.collapsedThreadIds
  )
}

/**
 * Handle input when comments view is focused.
 * Returns true if the key was handled, false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: CommentsViewInputContext
): boolean {
  if (ctx.state.viewMode !== "comments" || ctx.state.focusedPanel !== "comments") {
    return false
  }

  const navItems = getFilteredNavItems(ctx.state)
  const panel = ctx.getPanel()

  // Handle '/' for search (may come as key.sequence only, not key.name)
  if ((key.name === "/" || key.sequence === "/") && !key.ctrl) {
    ctx.setState(openCommentsSearch)
    ctx.render()
    return true
  }

  switch (key.name) {
    case "escape": {
      // Clear search filter if active
      if (ctx.state.commentsSearch.query) {
        ctx.setState(closeCommentsSearch)
        ctx.render()
        return true
      }
      return false
    }

    case "j":
    case "down": {
      ctx.setState((s) => moveCommentSelection(s, 1, navItems.length - 1))
      panel.ensureSelectedVisible(ctx.state.selectedCommentIndex)
      ctx.render()
      return true
    }

    case "k":
    case "up": {
      ctx.setState((s) => moveCommentSelection(s, -1, navItems.length - 1))
      panel.ensureSelectedVisible(ctx.state.selectedCommentIndex)
      ctx.render()
      return true
    }

    case "d":
      // Ctrl+d: scroll down half page and move selection
      if (key.ctrl) {
        const scrollBox = panel.getScrollBox()
        if (scrollBox) {
          const viewportHeight = Math.floor(scrollBox.height || 20)
          const halfPage = Math.floor(viewportHeight / 2)
          const maxScroll = scrollBox.scrollHeight - viewportHeight
          scrollBox.scrollTop = Math.min(maxScroll, scrollBox.scrollTop + halfPage)
          // Move selection to match new viewport position
          const newIndex = panel.findItemAtScrollPosition(scrollBox.scrollTop)
          ctx.setState((s) => ({ ...s, selectedCommentIndex: Math.min(newIndex, navItems.length - 1) }))
          ctx.render()
        }
      } else {
        // d: delete comment (synced comments are deleted on GitHub first)
        const deleteNav = navItems[ctx.state.selectedCommentIndex]
        if (deleteNav?.comment) {
          ctx.handleDeleteComment(deleteNav.comment)
        }
      }
      return true

    case "u":
      // Ctrl+u: scroll up half page and move selection
      if (key.ctrl) {
        const scrollBox = panel.getScrollBox()
        if (scrollBox) {
          const viewportHeight = Math.floor(scrollBox.height || 20)
          const halfPage = Math.floor(viewportHeight / 2)
          scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - halfPage)
          // Move selection to match new viewport position
          const newIndex = panel.findItemAtScrollPosition(scrollBox.scrollTop)
          ctx.setState((s) => ({ ...s, selectedCommentIndex: Math.min(newIndex, navItems.length - 1) }))
          ctx.render()
        }
      }
      return true

    case "return":
    case "enter": {
      const selectedNav = navItems[ctx.state.selectedCommentIndex]
      if (selectedNav?.comment) {
        const fileIndex = ctx.state.files.findIndex(
          (f) => f.filename === selectedNav.comment!.filename
        )
        if (fileIndex >= 0) {
          ctx.setState((s) => ({
            ...selectFile(s, fileIndex),
            viewMode: "diff" as const,
            focusedPanel: "diff" as const,
          }))
          // Reset vim cursor to the comment's line
          const lineMapping = ctx.rebuildLineMapping()
          let vimState = ctx.getVimState()
          vimState = { ...vimState, line: 0, col: 0 }
          const visualLine = lineMapping.findLineForComment(selectedNav.comment)
          if (visualLine !== null) {
            vimState = { ...vimState, line: visualLine }
          }
          ctx.setVimState(vimState)
          ctx.render()
          setTimeout(() => {
            ctx.ensureCursorVisible()
          }, 0)
        }
      }
      return true
    }

    case "r": {
      const replyNav = navItems[ctx.state.selectedCommentIndex]
      if (replyNav?.comment) {
        const fileIndex = ctx.state.files.findIndex(
          (f) => f.filename === replyNav.comment!.filename
        )
        if (fileIndex >= 0) {
          ctx.setState((s) => ({
            ...selectFile(s, fileIndex),
            viewMode: "diff" as const,
            focusedPanel: "diff" as const,
          }))
          const lineMapping = ctx.rebuildLineMapping()
          let vimState = ctx.getVimState()
          vimState = { ...vimState, line: 0, col: 0 }
          const visualLine = lineMapping.findLineForComment(replyNav.comment)
          if (visualLine !== null) {
            vimState = { ...vimState, line: visualLine }
          }
          ctx.setVimState(vimState)
          ctx.render()
          setTimeout(() => {
            ctx.ensureCursorVisible()
            ctx.handleAddComment()
          }, 0)
        }
      }
      return true
    }

    case "s":
      // S (shift+s) - submit selected comment (local or edited synced)
      if (key.shift) {
        const submitNav = navItems[ctx.state.selectedCommentIndex]
        if (submitNav?.comment) {
          const c = submitNav.comment
          if (c.status === "local" || c.localEdit !== undefined) {
            ctx.handleSubmitSingleComment(c)
          }
        }
      }
      return true

    case "x":
      // x - toggle resolved state on thread
      ctx.handleToggleThreadResolved()
      return true

    case "h":
    case "minus": {
      // h or - : collapse thread
      const selectedNav = navItems[ctx.state.selectedCommentIndex]
      if (selectedNav?.thread) {
        ctx.setState((s) => collapseThread(s, selectedNav.thread!.id))
        ctx.render()
      }
      return true
    }

    case "l":
    case "equal": {
      // l or + : expand thread
      const selectedNav = navItems[ctx.state.selectedCommentIndex]
      if (selectedNav?.thread) {
        ctx.setState((s) => expandThread(s, selectedNav.thread!.id))
        ctx.render()
      }
      return true
    }
  }

  return false
}
