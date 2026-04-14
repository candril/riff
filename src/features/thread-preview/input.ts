/**
 * Thread Preview input handling.
 *
 * The thread preview captures all input when open.
 *
 * Keys:
 *  - j/k         — move highlight within the thread; also re-targets the
 *                  palette React… action (spec 042)
 *  - Ctrl+n/^p   — jump to adjacent thread (passes through)
 *  - r           — reply (delegates to the add-comment flow; uses $EDITOR)
 *  - e           — edit highlighted comment (delegates to the add-comment flow)
 *  - d           — delete highlighted comment
 *  - x           — toggle resolved state on the thread
 *  - S           — submit highlighted local or edited-synced comment
 *  - Ctrl+p      — open the action menu (fall-through — React… is reachable
 *                  from there; spec 042)
 *  - Esc         — close
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { Comment } from "../../types"
import type { Thread } from "../../utils/threads"
import {
  closeThreadPreview,
  moveThreadPreviewHighlight,
  getThreadPreviewComments,
} from "../../state"
import { groupIntoThreads } from "../../utils/threads"

export interface ThreadPreviewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Action handlers — wired up in global-keys.ts
  handleReply: () => void                                 // opens add-comment flow on the anchor line
  handleDelete: (comment: Comment) => void                // delete highlighted
  handleSubmit: (comment: Comment) => void                // submit highlighted
  handleToggleResolved: (thread: Thread) => void          // toggle thread resolution
  handleJumpAdjacent: (direction: 1 | -1) => void         // Ctrl-n / Ctrl-p: next/prev thread
}

/**
 * Handle input when thread preview is open.
 * Returns true if the key was handled (preview is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: ThreadPreviewInputContext
): boolean {
  if (!ctx.state.threadPreview.open) {
    return false
  }

  const tp = ctx.state.threadPreview
  const threadComments = getThreadPreviewComments(ctx.state)

  // If all comments were deleted while the preview was open, close it.
  if (threadComments.length === 0) {
    ctx.setState(closeThreadPreview)
    ctx.render()
    return true
  }

  const highlighted: Comment | undefined = threadComments[tp.highlightedIndex]

  // Ctrl+p falls through so the action menu can open over the preview.
  // The React… submenu targets the currently-highlighted comment (spec 042).
  // Note: Ctrl+n is still Ctrl+n (next thread), but bare Ctrl+p is reserved
  // for the palette by convention.
  if (key.ctrl && key.name === "p") {
    return false
  }

  // Escape closes. Enter is reserved for future compose entry.
  if (key.name === "escape") {
    ctx.setState(closeThreadPreview)
    ctx.render()
    return true
  }

  switch (key.name) {
    case "j":
    case "down":
      ctx.setState((s) => moveThreadPreviewHighlight(s, 1))
      ctx.render()
      return true

    case "k":
    case "up":
      ctx.setState((s) => moveThreadPreviewHighlight(s, -1))
      ctx.render()
      return true

    case "n":
      if (key.ctrl) {
        ctx.handleJumpAdjacent(1)
        return true
      }
      break

    case "r":
    case "e":
      // Reply / edit both route through the existing comment editor flow
      // (edits and new replies are distinguished inside the editor).
      ctx.setState(closeThreadPreview)
      ctx.render()
      ctx.handleReply()
      return true

    case "d":
      if (highlighted) {
        ctx.handleDelete(highlighted)
      }
      return true

    case "x": {
      // Resolve the thread the highlighted comment belongs to.
      if (!highlighted) return true
      const threads = groupIntoThreads(threadComments)
      const thread = threads.find((t) =>
        t.comments.some((c) => c.id === highlighted.id)
      )
      if (thread) {
        ctx.handleToggleResolved(thread)
      }
      return true
    }

    case "s":
      if (key.shift && highlighted) {
        if (highlighted.status === "local" || highlighted.localEdit !== undefined) {
          ctx.handleSubmit(highlighted)
        }
      }
      return true
  }

  // Capture all other keys when preview is open (modal)
  return true
}
