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
} from "../../state"
import { groupIntoThreads, flattenThreadsForNav } from "../../utils/threads"

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

  const visibleComments = getVisibleComments(ctx.state)
  const threads = groupIntoThreads(visibleComments)
  const navItems = flattenThreadsForNav(
    threads,
    ctx.state.selectedFileIndex === null,
    ctx.state.collapsedThreadIds
  )
  const panel = ctx.getPanel()

  switch (key.name) {
    case "j":
    case "down": {
      const oldIndex = ctx.state.selectedCommentIndex
      ctx.setState((s) => moveCommentSelection(s, 1, navItems.length - 1))
      if (ctx.state.selectedCommentIndex !== oldIndex) {
        panel.scrollBy(1)
      }
      ctx.render()
      return true
    }

    case "k":
    case "up": {
      const oldIndex = ctx.state.selectedCommentIndex
      ctx.setState((s) => moveCommentSelection(s, -1, navItems.length - 1))
      if (ctx.state.selectedCommentIndex !== oldIndex) {
        panel.scrollBy(-1)
      }
      ctx.render()
      return true
    }

    case "d":
      // Ctrl+d: scroll down half page
      if (key.ctrl) {
        const scrollBox = panel.getScrollBox()
        if (scrollBox) {
          const viewportHeight = Math.floor(scrollBox.height || 20)
          const halfPage = Math.floor(viewportHeight / 2)
          scrollBox.scrollTop = Math.min(
            scrollBox.scrollHeight - viewportHeight,
            scrollBox.scrollTop + halfPage
          )
        }
      }
      return true

    case "u":
      // Ctrl+u: scroll up half page
      if (key.ctrl) {
        const scrollBox = panel.getScrollBox()
        if (scrollBox) {
          const viewportHeight = Math.floor(scrollBox.height || 20)
          const halfPage = Math.floor(viewportHeight / 2)
          scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - halfPage)
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
