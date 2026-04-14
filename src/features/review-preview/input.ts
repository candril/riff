/**
 * Review Preview input handling.
 *
 * The review preview captures all input when open. It allows selecting
 * review type, writing a summary, and selecting which comments to include.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { ValidatedComment } from "../../components"
import { canSubmit } from "../../components"
import {
  closeReviewPreview,
  setReviewEvent,
  toggleReviewSection,
  setReviewBody,
  setReviewCursor,
  moveReviewHighlight,
  toggleReviewComment,
} from "../../state"

export interface ReviewPreviewInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  // Validated comments for navigation
  getValidatedComments: () => ValidatedComment[]
  // Whether reviewing own PR (affects available review types)
  isOwnPr: boolean
  // Called when user confirms review
  onConfirmReview: () => void
}

/**
 * Handle input when review preview is open.
 * Returns true if the key was handled (preview is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: ReviewPreviewInputContext
): boolean {
  if (!ctx.state.reviewPreview.open) {
    return false
  }

  const validatedComments = ctx.getValidatedComments()
  const validComments = validatedComments.filter((c) => c.valid)
  const section = ctx.state.reviewPreview.focusedSection
  const includedCount = validComments.filter(
    (c) => !ctx.state.reviewPreview.excludedCommentIds.has(c.comment.id)
  ).length

  // Escape always closes
  if (key.name === "escape") {
    ctx.setState(closeReviewPreview)
    ctx.render()
    return true
  }

  // Enter submits
  if (key.name === "return" || key.name === "enter") {
    if (
      !ctx.state.reviewPreview.loading &&
      canSubmit(ctx.state.reviewPreview, includedCount, ctx.isOwnPr)
    ) {
      ctx.onConfirmReview()
    }
    return true
  }

  // 1/2/3 select review type (works in any section)
  if (key.name === "1") {
    ctx.setState((s) => setReviewEvent(s, "COMMENT"))
    ctx.render()
    return true
  }
  if (key.name === "2") {
    ctx.setState((s) => setReviewEvent(s, "APPROVE"))
    ctx.render()
    return true
  }
  if (key.name === "3") {
    ctx.setState((s) => setReviewEvent(s, "REQUEST_CHANGES"))
    ctx.render()
    return true
  }

  // Tab toggles between input and comments
  if (key.name === "tab") {
    ctx.setState(toggleReviewSection)
    ctx.render()
    return true
  }

  // Section-specific key handling
  if (section === "input") {
    const body = ctx.state.reviewPreview.body
    const cursor = ctx.state.reviewPreview.cursorOffset

    // Cursor navigation
    if (key.name === "left") {
      ctx.setState((s) => setReviewCursor(s, s.reviewPreview.cursorOffset - 1))
      ctx.render()
      return true
    }
    if (key.name === "right") {
      ctx.setState((s) => setReviewCursor(s, s.reviewPreview.cursorOffset + 1))
      ctx.render()
      return true
    }
    if (key.name === "up") {
      const prevNewline = body.lastIndexOf("\n", cursor - 1)
      if (prevNewline === -1) {
        ctx.setState((s) => setReviewCursor(s, 0))
      } else {
        const lineStart = prevNewline + 1
        const col = cursor - lineStart
        const prevLineStart = body.lastIndexOf("\n", prevNewline - 1) + 1
        const prevLineLen = prevNewline - prevLineStart
        ctx.setState((s) =>
          setReviewCursor(s, prevLineStart + Math.min(col, prevLineLen))
        )
      }
      ctx.render()
      return true
    }
    if (key.name === "down") {
      const nextNewline = body.indexOf("\n", cursor)
      if (nextNewline === -1) {
        ctx.setState((s) => setReviewCursor(s, s.reviewPreview.body.length))
      } else {
        const lineStart = body.lastIndexOf("\n", cursor - 1) + 1
        const col = cursor - lineStart
        const nextLineStart = nextNewline + 1
        const nextNextNewline = body.indexOf("\n", nextLineStart)
        const nextLineLen =
          (nextNextNewline === -1 ? body.length : nextNextNewline) - nextLineStart
        ctx.setState((s) =>
          setReviewCursor(s, nextLineStart + Math.min(col, nextLineLen))
        )
      }
      ctx.render()
      return true
    }
    if (key.name === "home" || (key.name === "a" && key.ctrl)) {
      const lineStart = body.lastIndexOf("\n", cursor - 1) + 1
      ctx.setState((s) => setReviewCursor(s, lineStart))
      ctx.render()
      return true
    }
    if (key.name === "end" || (key.name === "e" && key.ctrl)) {
      const nextNewline = body.indexOf("\n", cursor)
      const lineEnd = nextNewline === -1 ? body.length : nextNewline
      ctx.setState((s) => setReviewCursor(s, lineEnd))
      ctx.render()
      return true
    }

    // Ctrl+j adds newline at cursor
    if (key.name === "j" && key.ctrl) {
      ctx.setState((s) => {
        const b = s.reviewPreview.body
        const c = s.reviewPreview.cursorOffset
        return setReviewBody(s, b.slice(0, c) + "\n" + b.slice(c), c + 1)
      })
      ctx.render()
      return true
    }
    // Backspace removes character before cursor
    if (key.name === "backspace") {
      if (cursor > 0) {
        ctx.setState((s) => {
          const b = s.reviewPreview.body
          const c = s.reviewPreview.cursorOffset
          return setReviewBody(s, b.slice(0, c - 1) + b.slice(c), c - 1)
        })
        ctx.render()
      }
      return true
    }
    // Delete removes character after cursor
    if (key.name === "delete") {
      if (cursor < body.length) {
        ctx.setState((s) => {
          const b = s.reviewPreview.body
          const c = s.reviewPreview.cursorOffset
          return setReviewBody(s, b.slice(0, c) + b.slice(c + 1), c)
        })
        ctx.render()
      }
      return true
    }
    // Type characters (but not 1/2/3 which select type)
    if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const ch = key.sequence
      ctx.setState((s) => {
        const b = s.reviewPreview.body
        const c = s.reviewPreview.cursorOffset
        return setReviewBody(s, b.slice(0, c) + ch + b.slice(c), c + ch.length)
      })
      ctx.render()
      return true
    }
  } else if (section === "comments") {
    // j/down = next comment
    if (key.name === "j" || key.name === "down") {
      ctx.setState((s) => moveReviewHighlight(s, 1, validComments.length - 1))
      ctx.render()
      return true
    }
    // k/up = previous comment
    if (key.name === "k" || key.name === "up") {
      ctx.setState((s) => moveReviewHighlight(s, -1, validComments.length - 1))
      ctx.render()
      return true
    }
    // Space toggles selection
    if (key.name === "space") {
      const highlightedComment = validComments[ctx.state.reviewPreview.highlightedIndex]
      if (highlightedComment) {
        ctx.setState((s) => toggleReviewComment(s, highlightedComment.comment.id))
        ctx.render()
      }
      return true
    }
  }

  // Capture all other keys (don't let them escape to normal mode)
  return true
}
