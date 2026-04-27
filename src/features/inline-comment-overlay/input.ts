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
import { readComposerValue } from "../../components/CommentComposer"
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
  /** `n` from the panel — start a new comment anchored at the diff
   *  cursor's current line. The overlay layer doesn't know about line
   *  mapping or vim state, so this is wired up at the app level. */
  handleStartNewComment: () => void
}

export function handleInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return false

  const ov = state.inlineCommentOverlay
  const threadComments = getInlineCommentOverlayComments(state)

  // Compose/edit always captures (the textarea owns input).
  if (ov.mode === "compose" || ov.mode === "edit") {
    return handleComposerInput(key, ctx)
  }

  // View mode: only act when the panel is the focused surface.
  // Otherwise the user is driving the diff/tree and the panel is
  // just visible — let those handlers process the key.
  if (state.focusedPanel !== "comments") {
    return false
  }

  const highlighted: Comment | undefined = threadComments[ov.highlightedIndex]

  // Ctrl-h — hand focus back to the diff (mirror of file tree's exit).
  // Terminals deliver bare Ctrl-h as `backspace`; we accept both shapes
  // because some emulators (and kitty-protocol terminals) preserve the
  // `h` form.
  if (key.name === "backspace" || (key.ctrl && key.name === "h")) {
    ctx.setState((s) => ({ ...s, focusedPanel: "diff" }))
    ctx.render()
    return true
  }

  // Ctrl-e — toggle expanded width (mirror of file tree's Ctrl-e).
  if (key.ctrl && key.name === "e") {
    ctx.setState((s) => ({
      ...s,
      inlineCommentOverlay: {
        ...s.inlineCommentOverlay,
        expanded: !s.inlineCommentOverlay.expanded,
      },
    }))
    ctx.render()
    return true
  }

  // Ctrl+p falls through so the action menu can open over the overlay
  // (the React… submenu targets the highlighted comment — spec 042).
  if (key.ctrl && key.name === "p") {
    return false
  }

  // Ctrl-t — toggle close (mirrors the diff-view's open binding).
  if (key.ctrl && key.name === "t") {
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
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
      // Bare `n` starts a new comment at the diff cursor's line —
      // mirrors the diff's `n`-for-new convention but only fires while
      // the panel is the focused surface so vim's `n` (search-next)
      // stays available everywhere else. preventDefault so the textarea
      // (focused during the sync re-render) doesn't also see this `n`.
      if (!key.shift) {
        key.preventDefault()
        ctx.handleStartNewComment()
        return true
      }
      break

    case "r":
      if (key.shift) {
        // R — reply via $EDITOR
        ctx.setState(closeInlineCommentOverlay)
        ctx.render()
        ctx.handleReplyExternal()
        return true
      }
      // r — inline reply: re-anchor to the highlighted thread's
      // (file, line, side) so the new comment lands in the right place,
      // then drop into the composer. Without re-anchoring, replying
      // after j/k navigation (or in all-files view, after crossing
      // files) would attach to whatever the panel was originally
      // opened on. preventDefault so the textarea (focused during the
      // sync re-render) doesn't also see this `r`.
      key.preventDefault()
      if (highlighted) {
        ctx.setState((s) => startInlineCompose({
          ...s,
          inlineCommentOverlay: {
            ...s.inlineCommentOverlay,
            filename: highlighted.filename,
            line: highlighted.line,
            side: highlighted.side,
          },
        }))
      } else {
        ctx.setState((s) => startInlineCompose(s))
      }
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
      // has a body, but mid-mutation states might race). preventDefault
      // so the textarea (focused during the sync re-render) doesn't
      // also see this `e`.
      if (highlighted) {
        key.preventDefault()
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

  // Esc — cancel back to view mode (or close if there's nothing behind).
  // We `preventDefault` so the focused textarea doesn't also process it.
  if (key.name === "escape") {
    key.preventDefault()
    ctx.setState(cancelInlineComposer)
    ctx.render()
    return true
  }

  // Ctrl-s — submit. Pull the textarea's live value into state first so
  // the submit handlers (which still read `ov.input`) see what the user
  // actually typed.
  if (key.ctrl && key.name === "s") {
    key.preventDefault()
    const value = readComposerValue()
    ctx.setState((s) => setInlineCommentInput(s, value))
    if (ov.mode === "edit") {
      void submitInlineEditDraft(ctx)
    } else {
      void submitInlineDraft(ctx)
    }
    return true
  }

  // All other keys flow to the focused TextareaRenderable via OpenTUI's
  // internal renderable dispatch — that's where typing, paste, Ctrl-w,
  // arrow keys, undo/redo, mouse selection, etc. are handled. We return
  // `true` to short-circuit our own outer handler chain (so global keys
  // don't fire) but skip `preventDefault` so the textarea still sees
  // the event.
  return true
}
