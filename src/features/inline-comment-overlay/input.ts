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
  getInlineCommentOverlayDisplayOrder,
  startInlineCompose,
  startInlineEdit,
  cancelInlineComposer,
  setInlineCommentInput,
  setMentionPicker,
  moveMentionPickerSelection,
  toggleInlineCommentOverlayExpand,
} from "../../state"
import { groupIntoThreads } from "../../utils/threads"
import {
  readComposerValue,
  readComposerCursorOffset,
  replaceComposerRange,
} from "../../components/CommentComposer"
import { collectMentionCandidates } from "../../utils/mentions"
import { getFilteredMentionCandidates } from "../../components/InlineCommentOverlay"
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
  /** Move the diff cursor to the highlighted comment's source line so
   *  the diff stays in sync as the user navigates threads with j/k.
   *  Wired at the app level (needs lineMapping + vim state). */
  syncCursorToHighlight: () => void
  /** `o` — open the highlighted comment's file in $EDITOR at its
   *  anchored line. Most useful for outdated threads where the line is
   *  no longer in the diff but still exists in the working copy. */
  handleOpenInEditor: (comment: Comment) => void
}

// `za` chord state, scoped to the panel input handler. Cleared after the
// follow-up key arrives or the timeout expires so a stray `z` doesn't get
// interpreted as half a chord across unrelated keystrokes.
let pendingZ = false
let pendingZTimeout: ReturnType<typeof setTimeout> | null = null
function clearPendingZ() {
  pendingZ = false
  if (pendingZTimeout) {
    clearTimeout(pendingZTimeout)
    pendingZTimeout = null
  }
}

/**
 * Find the root comment id for a thread containing `commentId`. Used by
 * the expand toggle, which keys on root id.
 */
function findThreadRootId(comments: Comment[], commentId: string): string | null {
  const c = comments.find((x) => x.id === commentId)
  if (!c) return null
  if (!c.inReplyTo) return c.id
  // Replies inherit the root from their parent chain; in practice the
  // groupIntoThreads logic ensures inReplyTo points at the root.
  const parent = comments.find((x) => x.id === c.inReplyTo)
  return parent ? findThreadRootId(comments, parent.id) : c.id
}

export function handleInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext
): boolean {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return false

  const ov = state.inlineCommentOverlay
  // displayOrder: matches j/k navigation (resolved threads collapse to root).
  // threadComments: unfiltered, used for thread-level lookups like resolve.
  const threadComments = getInlineCommentOverlayComments(state)
  const displayOrder = getInlineCommentOverlayDisplayOrder(state)

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

  const highlighted: Comment | undefined = displayOrder[ov.highlightedIndex]

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
    clearPendingZ()
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  // za chord (vim-style "toggle fold") — expand/collapse the highlighted
  // thread. Resolved threads reveal their body + replies; outdated threads
  // reveal the original diff hunk.
  const toggleHighlightedThread = () => {
    if (!highlighted) return
    const rootId = findThreadRootId(threadComments, highlighted.id) ?? highlighted.id
    ctx.setState((s) => toggleInlineCommentOverlayExpand(s, rootId))
    ctx.render()
  }

  if (pendingZ) {
    clearPendingZ()
    if (key.name === "a" && !key.ctrl && !key.shift) {
      toggleHighlightedThread()
      return true
    }
    // Anything else after `z` cancels the chord; fall through so the key
    // still gets processed normally.
  }

  if (key.name === "z" && !key.ctrl && !key.shift) {
    pendingZ = true
    pendingZTimeout = setTimeout(clearPendingZ, 500)
    return true
  }

  // Enter is an alias for `za` — toggle expand on the highlighted thread.
  if (key.name === "return" || key.name === "enter") {
    toggleHighlightedThread()
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
      ctx.syncCursorToHighlight()
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
      ctx.syncCursorToHighlight()
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

    case "o":
      // Open the highlighted comment's file in $EDITOR at its line.
      // Not gated on outdated specifically — works for any thread, just
      // happens to be the only way to inspect outdated context.
      if (!key.ctrl && !key.shift && highlighted) {
        key.preventDefault()
        ctx.handleOpenInEditor(highlighted)
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

  // @mention picker — intercept navigation/commit keys while the picker
  // is open. Done before generic Esc/Ctrl-s handling so the picker can
  // own those keys. Typing characters falls through to the textarea so
  // the query expands naturally; the textarea's onContentChange then
  // updates the picker via render-time activity dispatch.
  if (ov.mentionPicker) {
    const handled = handleMentionPickerInput(key, ctx, ov.mentionPicker)
    if (handled) return true
  }

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

/**
 * Handle keys while the @mention picker is open. Returns `true` if the
 * picker consumed the key, leaving the outer composer handler to skip
 * its own logic. Typing characters returns `false` so they flow to the
 * textarea (extending the query, which the activity callback then
 * re-runs through `detectMentionTrigger`).
 */
function handleMentionPickerInput(
  key: KeyEvent,
  ctx: InlineCommentOverlayInputContext,
  picker: NonNullable<AppState["inlineCommentOverlay"]["mentionPicker"]>
): boolean {
  const state = ctx.getState()
  const candidates = collectMentionCandidates(state)
  const filtered = getFilteredMentionCandidates(candidates, picker.query)

  // Esc — dismiss the picker but leave the composer (and the typed
  // `@<query>`) intact. preventDefault so the textarea doesn't also
  // see Esc and the surrounding handler doesn't cancel compose.
  if (key.name === "escape") {
    key.preventDefault()
    ctx.setState((s) => setMentionPicker(s, null))
    ctx.render()
    return true
  }

  if (key.name === "up" || (key.ctrl && key.name === "p")) {
    key.preventDefault()
    if (filtered.length > 0) {
      ctx.setState((s) => moveMentionPickerSelection(s, -1, filtered.length))
      ctx.render()
    }
    return true
  }

  if (key.name === "down" || (key.ctrl && key.name === "n")) {
    key.preventDefault()
    if (filtered.length > 0) {
      ctx.setState((s) => moveMentionPickerSelection(s, 1, filtered.length))
      ctx.render()
    }
    return true
  }

  // Tab or Enter — accept the highlighted candidate. Only commit when
  // the picker has at least one match; otherwise fall through so Enter
  // inserts a newline and Tab inserts a tab in the textarea.
  if ((key.name === "tab" || key.name === "return" || key.name === "enter") && filtered.length > 0) {
    key.preventDefault()
    const idx = Math.min(picker.selectedIndex, filtered.length - 1)
    const username = filtered[idx]
    if (!username) return true
    acceptMention(ctx, picker.atOffset, username)
    return true
  }

  return false
}

/**
 * Replace the active `@<query>` with `@<username> ` in the textarea
 * and close the picker. The textarea's onContentChange fires after
 * `replaceComposerRange`, which re-runs `detectMentionTrigger`; with
 * the trailing space the regex no longer matches, so the picker stays
 * closed.
 */
function acceptMention(
  ctx: InlineCommentOverlayInputContext,
  atOffset: number,
  username: string
): void {
  const cursor = readComposerCursorOffset()
  replaceComposerRange(atOffset, cursor, `@${username} `)
  // Defensive: clear the picker explicitly even though the activity
  // callback will also clear it. Avoids a one-frame flash if the event
  // ordering ever changes.
  ctx.setState((s) => setMentionPicker(s, null))
  ctx.render()
}

