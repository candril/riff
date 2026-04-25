/**
 * InlineCommentOverlay input handling (spec 039).
 *
 * Single capture point for every comment action while the overlay is
 * open. Two distinct modes:
 *
 *  - **view**: `j/k` highlight, `r/R` reply, `e/E` edit, `d` delete,
 *    `x` resolve, `S` submit, `Ctrl-n`/`Ctrl-p` adjacent thread,
 *    `Ctrl-p` falls through (palette). `Esc` closes.
 *  - **compose / edit**: char input flows into `state.inlineCommentOverlay.input`.
 *    `Ctrl-s` flushes the draft (delegating to handlers); `Ctrl-j`
 *    inserts a newline; `Esc` cancels back to view mode.
 *
 * Heavy lifting (delete / submit / resolve / adjacent jump / `$EDITOR`
 * reply / `$EDITOR` edit) is delegated through the context so this
 * stays a pure dispatcher.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { Thread } from "../../utils/threads"
import {
  closeInlineCommentOverlay,
  moveInlineCommentOverlayHighlight,
  getInlineCommentOverlayComments,
  startInlineCompose,
  startInlineEdit,
  cancelInlineComposer,
  setInlineCommentInput,
} from "../../state"
import { groupIntoThreads } from "../../utils/threads"
import {
  submitInlineDraft,
  submitInlineEditDraft,
  type InlineComposerHandlersContext,
} from "./handlers"

export interface InlineCommentOverlayInputContext extends InlineComposerHandlersContext {
  /** $EDITOR reply (Shift-r). Reuses the existing add-comment flow. */
  handleReplyExternal: () => void
  /** $EDITOR edit (Shift-e). Reuses the existing add-comment flow,
   *  which detects edits via the comment id passed back from the
   *  editor output. */
  handleEditExternal: () => void
  /** Delete highlighted comment. */
  handleDelete: (comment: Comment) => void
  /** Submit highlighted (local or edited synced) comment to GitHub. */
  handleSubmit: (comment: Comment) => void
  /** Toggle the thread's resolved state. */
  handleToggleResolved: (thread: Thread) => void
  /** Ctrl-n / Ctrl-p — jump to next/previous thread, repositioning the
   *  overlay. */
  handleJumpAdjacent: (direction: 1 | -1) => void
}

export function handleInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return false

  const ov = state.inlineCommentOverlay
  const threadComments = getInlineCommentOverlayComments(state)

  if (ov.mode === "compose" || ov.mode === "edit") {
    return handleComposerInput(key, ctx)
  }

  // View mode below.

  // If the overlay is open without an explicit thread (e.g. opened by
  // `c` on a virgin line) we still want all the actions to make sense.
  // `S`/`d`/`x`/etc. silently no-op when there's no highlighted comment.
  const highlighted: Comment | undefined = threadComments[ov.highlightedIndex]

  // If all comments were deleted while the overlay was open, close it
  // unless we're sitting on an empty anchor for compose ('c' opened it).
  if (threadComments.length === 0 && ov.mode === "view") {
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  // Ctrl+p falls through so the action menu can open over the overlay
  // (the React… submenu targets the highlighted comment — spec 042).
  if (key.ctrl && key.name === "p") {
    return false
  }

  if (key.name === "escape") {
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  switch (key.name) {
    case "j":
    case "down":
      if (key.shift) {
        // J — jump to next thread (re-anchors the overlay).
        ctx.handleJumpAdjacent(1)
        return true
      }
      ctx.setState((s) => moveInlineCommentOverlayHighlight(s, 1))
      ctx.render()
      return true

    case "k":
    case "up":
      if (key.shift) {
        // K — jump to previous thread.
        ctx.handleJumpAdjacent(-1)
        return true
      }
      ctx.setState((s) => moveInlineCommentOverlayHighlight(s, -1))
      ctx.render()
      return true

    case "n":
      // Ctrl-n kept as an alias for next-thread (legacy muscle memory).
      // The visible binding is `J`.
      if (key.ctrl) {
        ctx.handleJumpAdjacent(1)
        return true
      }
      break

    case "c":
      // Start a new comment / reply on this anchor without dropping
      // out of the overlay. Useful when opened with `c` on an empty
      // line, but also lets users add a reply after viewing the
      // thread without re-pressing `r`.
      ctx.setState((s) => startInlineCompose(s))
      ctx.render()
      return true

    case "r":
      if (key.shift) {
        // R — reply via $EDITOR
        ctx.setState(closeInlineCommentOverlay)
        ctx.render()
        ctx.handleReplyExternal()
        return true
      }
      // r — inline reply: drop into composer
      ctx.setState((s) => startInlineCompose(s))
      ctx.render()
      return true

    case "e":
      if (key.shift) {
        // E — edit via $EDITOR
        ctx.setState(closeInlineCommentOverlay)
        ctx.render()
        ctx.handleEditExternal()
        return true
      }
      // e — inline edit. Only the highlighted comment can be edited
      // and only if it has a body to edit (defensive — every comment
      // has a body, but mid-mutation states might race).
      if (highlighted) {
        const prefill = highlighted.localEdit ?? highlighted.body
        ctx.setState((s) => startInlineEdit(s, highlighted.id, prefill))
        ctx.render()
      }
      return true

    case "d":
      if (highlighted) ctx.handleDelete(highlighted)
      return true

    case "x": {
      if (!highlighted) return true
      const threads = groupIntoThreads(threadComments)
      const thread = threads.find((t) =>
        t.comments.some((c) => c.id === highlighted.id)
      )
      if (thread) ctx.handleToggleResolved(thread)
      return true
    }

    case "s":
      if (key.shift && highlighted) {
        if (
          highlighted.status === "local" ||
          highlighted.localEdit !== undefined
        ) {
          ctx.handleSubmit(highlighted)
        }
      }
      return true
  }

  // Everything else is swallowed while the overlay is open (modal).
  return true
}

function handleComposerInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  const ov = state.inlineCommentOverlay

  if (key.name === "escape") {
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return true
  }

  // Ctrl-s — submit draft.
  if (key.ctrl && key.name === "s") {
    if (ov.mode === "edit") {
      void submitInlineEditDraft(ctx)
    } else {
      void submitInlineDraft(ctx)
    }
    return true
  }

  // Ctrl-j — newline (terminals don't deliver bare Enter as input
  // reliably inside our key stream, so we follow the same convention
  // as the PR-comment input in the info panel).
  if (key.ctrl && key.name === "j") {
    ctx.setState((s) =>
      setInlineCommentInput(s, s.inlineCommentOverlay.input + "\n")
    )
    ctx.render()
    return true
  }

  // Backspace — drop last char.
  if (key.name === "backspace") {
    if (ov.input.length > 0) {
      ctx.setState((s) =>
        setInlineCommentInput(s, s.inlineCommentOverlay.input.slice(0, -1))
      )
      ctx.render()
    }
    return true
  }

  // Enter — newline (matches the convention of the PR-comment composer
  // and gives users a familiar Markdown-author flow). Submit is `Ctrl-s`.
  if (key.name === "return" || key.name === "enter") {
    ctx.setState((s) =>
      setInlineCommentInput(s, s.inlineCommentOverlay.input + "\n")
    )
    ctx.render()
    return true
  }

  // Printable character — append.
  if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
    ctx.setState((s) =>
      setInlineCommentInput(s, s.inlineCommentOverlay.input + key.sequence)
    )
    ctx.render()
    return true
  }

  // Swallow everything else (modal).
  return true
}
