/**
 * Thread panel input handling in view mode (spec 039): `j/k` highlight,
 * `Ctrl-d`/`Ctrl-u` half a page, `gg`/`G` the ends, `r/R` reply, `e/E`
 * edit, `d` delete, `x` resolve, `H` open threads only, `S` submit,
 * `Ctrl-n` the next thread; `Ctrl-p` falls through to the palette and
 * `Esc` closes. The composer's keys, in compose and edit mode, are bound
 * in `composer-keys.ts`.
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
  clearViewFilter,
  commitViewFilter,
  startViewFilter,
  closeInlineCommentOverlay,
  moveInlineCommentOverlayHighlight,
  getInlineCommentOverlayComments,
  getInlineCommentOverlayDisplayOrder,
  startInlineCompose,
  startInlineEdit,
  toggleInlineCommentOverlayExpand,
  setCommentCodePeek,
  showToast,
  clearToast,
} from "../../state"
import { commentHunk } from "./hunk"
import { entrySpans, halfPageEntry, UNLAID, type ThreadPanelLayout } from "./motions"
import { groupIntoThreads } from "../../utils/threads"

export interface InlineCommentOverlayInputContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
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
  /** `H` — show only open threads, or all of them again. */
  handleToggleOpenOnly: () => void
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
  /** Where the panel's entries were last drawn, for Ctrl-d / Ctrl-u; null before the panel is laid out. */
  getPanelLayout: () => ThreadPanelLayout | null
  /** `y` — copy a GitHub link to the highlighted comment. */
  handleCopyLink: (comment: Comment) => void
  /** `o` — open the highlighted comment's file in $EDITOR at its
   *  anchored line. Most useful for outdated threads where the line is
   *  no longer in the diff but still exists in the working copy. */
  handleOpenInEditor: (comment: Comment) => void
  /** `O` — open the images the highlighted comment carries in the browser. */
  handleOpenImages: (comment: Comment) => void
  /** `gx` opens a link in the panel's comments, `gX` copies it (spec 077). */
  onOpenLinks: (comment: Comment, action: "open" | "copy") => void
  /** `g?` — the keymap, which every surface owes the reader. */
  onToggleHelp: () => void
  /** `+` — react on the highlighted comment (spec 042). */
  onReact: () => void
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

/**
 * `g`-chords, kept here rather than in the global handler: the panel is
 * modal, so a key that reaches it never reaches the chord matcher.
 */
let pendingKey: string | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

function clearPendingKey(): void {
  pendingKey = null
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
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

  // View mode: only act when the panel is the focused surface.
  // Otherwise the user is driving the diff/tree and the panel is
  // just visible — let those handlers process the key.
  if (state.focusedPanel !== "comments") {
    return false
  }

  const highlighted: Comment | undefined = displayOrder[ov.highlightedIndex]

  // The `Ctrl-f` prompt owns every key while it is open, bar the two that
  // close it — the rest belong to the input widget (spec 065).
  if (ov.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      ctx.setState(clearViewFilter)
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      ctx.setState(commitViewFilter)
      ctx.render()
    }
    return true
  }

  // The code peek sits over the panel: while it is up, it owns the keys
  // (spec 060).
  if (ov.codePeekId !== null) {
    if (key.name === "escape" || key.name === "q" || key.name === "c") {
      ctx.setState((s) => setCommentCodePeek(s, null))
      ctx.render()
    }
    return true
  }

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

  // Ctrl-f is the file picker, from here as from everywhere: let it through.
  if (key.ctrl && key.name === "f") {
    return false
  }

  // `/` narrows the panel to the comments that match (spec 065).
  if ((key.name === "/" || key.sequence === "/") && !key.ctrl) {
    key.preventDefault()
    ctx.setState(startViewFilter)
    ctx.render()
    return true
  }

  // `y` — copy a link to the highlighted comment. The panel is where the
  // user is looking at a specific thread, so no target resolution needed.
  if (key.name === "y" && !key.ctrl) {
    if (highlighted) ctx.handleCopyLink(highlighted)
    return true
  }

  // Ctrl-t — toggle close (mirrors the diff-view's open binding).
  if (key.ctrl && key.name === "t") {
    ctx.setState(closeInlineCommentOverlay)
    ctx.render()
    return true
  }

  const highlightEntry = (index: number) => {
    ctx.setState((s) => moveInlineCommentOverlayHighlight(s, index - s.inlineCommentOverlay.highlightedIndex))
    ctx.syncCursorToHighlight()
    ctx.render()
  }

  // Ctrl-d / Ctrl-u — half a page of drawn rows. The window follows the
  // highlighted comment, so moving the highlight scrolls the view.
  // Handled before the `d` (delete) case so Ctrl-d never deletes.
  if (key.ctrl && (key.name === "d" || key.name === "u")) {
    const layout = ctx.getPanelLayout() ?? UNLAID
    const spans = entrySpans(displayOrder, layout)
    highlightEntry(halfPageEntry(spans, ov.highlightedIndex, key.name === "d" ? 1 : -1, layout.viewportRows))
    return true
  }

  // q / Esc — close the panel.
  if (key.name === "escape" || (key.name === "q" && !key.ctrl && !key.shift && !key.meta)) {
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

  if (pendingKey === "g") {
    clearPendingKey()
    // `gx` — the links in the highlighted comment (spec 077). Every other
    // g-sequence is swallowed rather than falling through into the
    // panel's own `r`/`e`/`d` handlers.
    if (key.name === "?" || key.sequence === "?") {
      ctx.onToggleHelp()
      return true
    }
    if (key.name === "g" && !key.shift && !key.ctrl) {
      highlightEntry(0)
      return true
    }
    if ((key.name === "x" || key.name === "X") && highlighted) {
      // preventDefault so the picker's prompt field, focused in this same
      // keypress, does not read the `x` as the start of a query.
      key.preventDefault()
      ctx.onOpenLinks(highlighted, key.shift || key.name === "X" ? "copy" : "open")
    }
    return true
  }

  if ((key.name === "H" || (key.name === "h" && key.shift)) && !key.ctrl && !key.meta) {
    ctx.handleToggleOpenOnly()
    return true
  }

  if ((key.name === "G" || (key.name === "g" && key.shift)) && !key.ctrl) {
    highlightEntry(Math.max(0, displayOrder.length - 1))
    return true
  }

  if (key.name === "g" && !key.shift && !key.ctrl) {
    pendingKey = "g"
    pendingTimeout = setTimeout(clearPendingKey, 500)
    return true
  }

  // Enter is an alias for `za` — toggle expand on the highlighted thread.
  if (key.name === "return" || key.name === "enter") {
    toggleHighlightedThread()
    return true
  }

  if (key.name === "+" || key.sequence === "+") {
    // preventDefault so the picker's prompt field, focused in this same
    // keypress, does not read the `+` as the start of a query.
    key.preventDefault()
    ctx.onReact()
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
        }, "", { reply: true }))
      } else {
        ctx.setState((s) => startInlineCompose(s, "", { reply: true }))
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
      // Bare `s` is flash's: the global handler labels the panel's rows
      // (spec 066). `S` posts the highlighted comment.
      if (!key.shift && !key.ctrl) return false
      if (key.shift && highlighted) {
        if (
          highlighted.status === "local" ||
          highlighted.localEdit !== undefined
        ) {
          ctx.handleSubmit(highlighted)
        }
      }
      return true

    case "c": {
      // The code this comment was written against — the only copy of it
      // riff has once the thread has gone outdated (spec 060).
      if (key.ctrl || key.shift || !highlighted) return true
      key.preventDefault()
      if (!commentHunk(threadComments, highlighted.id)) {
        ctx.setState((s) =>
          showToast(s, "No stored context for this comment", "info")
        )
        ctx.render()
        setTimeout(() => {
          ctx.setState(clearToast)
          ctx.render()
        }, 2000)
        return true
      }
      ctx.setState((s) => setCommentCodePeek(s, highlighted.id))
      ctx.render()
      return true
    }

    case "o":
      if (key.ctrl) return true
      key.preventDefault()
      if (highlighted) {
        // O — the panel can only name a comment's images; the browser is
        // where they can actually be seen (and, for a private repo, the
        // only place authenticated to fetch them at all).
        if (key.shift) ctx.handleOpenImages(highlighted)
        // o — open the comment's file in $EDITOR at its line. Not gated on
        // outdated specifically — works for any thread, just happens to be
        // the only way to inspect outdated context.
        else ctx.handleOpenInEditor(highlighted)
      }
      return true
  }

  // Everything else is swallowed while the overlay is open (modal).
  return true
}
