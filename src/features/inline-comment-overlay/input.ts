/**
 * Thread panel input handling in view mode (spec 039): `j/k` highlight,
 * `Ctrl-d`/`Ctrl-u` half a page, `gg`/`G` the ends, `r/R` reply, `e/E`
 * edit, `d` delete, `x` resolve, `H` open threads only, `S` submit,
 * `Ctrl-n` the next thread; `Ctrl-p` falls through to the palette and
 * `Esc` closes. The composer's keys, in compose and edit mode, are bound
 * in `composer-keys.ts`; what each key does is in `view-actions.ts`.
 */

import type { KeyEvent } from "@opentui/core"
import {
  closeCodePeek,
  closeFilter,
  closePanel,
  commitFilter,
  copyLink,
  deleteHighlighted,
  editInEditor,
  editInline,
  focusDiff,
  halfPage,
  highlightedComment,
  highlightEntry,
  jumpAdjacent,
  jumpToEnd,
  moveHighlight,
  openCodePeek,
  openImages,
  openInEditor,
  openLinks,
  react,
  replyInEditor,
  replyInline,
  startFilter,
  startNew,
  submit,
  toggleExpanded,
  toggleHelp,
  toggleHighlightedThread,
  toggleOpenOnly,
  toggleResolved,
  type ThreadPanelViewDeps,
} from "./view-actions"

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
  ctx: ThreadPanelViewDeps
): boolean {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return false

  const ov = state.inlineCommentOverlay

  // View mode: only act when the panel is the focused surface.
  // Otherwise the user is driving the diff/tree and the panel is
  // just visible — let those handlers process the key.
  if (state.focusedPanel !== "comments") {
    return false
  }

  const highlighted = highlightedComment(state)

  // The `Ctrl-f` prompt owns every key while it is open, bar the two that
  // close it — the rest belong to the input widget (spec 065).
  if (ov.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      closeFilter(ctx)
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      commitFilter(ctx)
    }
    return true
  }

  // The code peek sits over the panel: while it is up, it owns the keys
  // (spec 060).
  if (ov.codePeekId !== null) {
    if (key.name === "escape" || key.name === "q" || key.name === "c") closeCodePeek(ctx)
    return true
  }

  // Terminals deliver bare Ctrl-h as `backspace`; we accept both shapes
  // because some emulators (and kitty-protocol terminals) preserve the
  // `h` form.
  if (key.name === "backspace" || (key.ctrl && key.name === "h")) {
    focusDiff(ctx)
    return true
  }

  if (key.ctrl && key.name === "e") {
    toggleExpanded(ctx)
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
    startFilter(ctx)
    return true
  }

  if (key.name === "y" && !key.ctrl) {
    copyLink(ctx)
    return true
  }

  // Ctrl-t — toggle close (mirrors the diff-view's open binding).
  if (key.ctrl && key.name === "t") {
    closePanel(ctx)
    return true
  }

  // Handled before the `d` (delete) case so Ctrl-d never deletes.
  if (key.ctrl && (key.name === "d" || key.name === "u")) {
    halfPage(ctx, key.name === "d" ? 1 : -1)
    return true
  }

  if (key.name === "escape" || (key.name === "q" && !key.ctrl && !key.shift && !key.meta)) {
    clearPendingZ()
    closePanel(ctx)
    return true
  }

  if (pendingZ) {
    clearPendingZ()
    if (key.name === "a" && !key.ctrl && !key.shift) {
      toggleHighlightedThread(ctx)
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
      toggleHelp(ctx)
      return true
    }
    if (key.name === "g" && !key.shift && !key.ctrl) {
      highlightEntry(ctx, 0)
      return true
    }
    if ((key.name === "x" || key.name === "X") && highlighted) {
      // preventDefault so the picker's prompt field, focused in this same
      // keypress, does not read the `x` as the start of a query.
      key.preventDefault()
      openLinks(ctx, highlighted, key.shift || key.name === "X" ? "copy" : "open")
    }
    return true
  }

  if ((key.name === "H" || (key.name === "h" && key.shift)) && !key.ctrl && !key.meta) {
    toggleOpenOnly(ctx)
    return true
  }

  if ((key.name === "G" || (key.name === "g" && key.shift)) && !key.ctrl) {
    jumpToEnd(ctx)
    return true
  }

  if (key.name === "g" && !key.shift && !key.ctrl) {
    pendingKey = "g"
    pendingTimeout = setTimeout(clearPendingKey, 500)
    return true
  }

  // Enter is an alias for `za`.
  if (key.name === "return" || key.name === "enter") {
    toggleHighlightedThread(ctx)
    return true
  }

  if (key.name === "+" || key.sequence === "+") {
    // preventDefault so the picker's prompt field, focused in this same
    // keypress, does not read the `+` as the start of a query.
    key.preventDefault()
    react(ctx)
    return true
  }

  switch (key.name) {
    case "j":
    case "down":
      if (key.shift) jumpAdjacent(ctx, 1)
      else moveHighlight(ctx, 1)
      return true

    case "k":
    case "up":
      if (key.shift) jumpAdjacent(ctx, -1)
      else moveHighlight(ctx, -1)
      return true

    case "n":
      // Ctrl-n kept as an alias for next-thread (legacy muscle memory).
      // The visible binding is `J`.
      if (key.ctrl) {
        jumpAdjacent(ctx, 1)
        return true
      }
      // Bare `n` starts a new comment at the diff cursor's line —
      // mirrors the diff's `n`-for-new convention but only fires while
      // the panel is the focused surface so vim's `n` (search-next)
      // stays available everywhere else. preventDefault so the textarea
      // (focused during the sync re-render) doesn't also see this `n`.
      if (!key.shift) {
        key.preventDefault()
        startNew(ctx)
        return true
      }
      break

    case "r":
      if (key.shift) {
        replyInEditor(ctx)
        return true
      }
      // preventDefault so the textarea (focused during the sync
      // re-render) doesn't also see this `r`.
      key.preventDefault()
      replyInline(ctx)
      return true

    case "e":
      if (key.shift) {
        editInEditor(ctx)
        return true
      }
      // preventDefault so the textarea (focused during the sync
      // re-render) doesn't also see this `e`.
      if (highlighted) {
        key.preventDefault()
        editInline(ctx, highlighted)
      }
      return true

    case "d":
      deleteHighlighted(ctx)
      return true

    case "x":
      toggleResolved(ctx)
      return true

    case "s":
      // Bare `s` is flash's: the global handler labels the panel's rows
      // (spec 066). `S` posts the highlighted comment.
      if (!key.shift && !key.ctrl) return false
      if (key.shift) submit(ctx)
      return true

    case "c":
      if (key.ctrl || key.shift || !highlighted) return true
      key.preventDefault()
      openCodePeek(ctx, highlighted)
      return true

    case "o":
      if (key.ctrl) return true
      key.preventDefault()
      if (highlighted) {
        if (key.shift) openImages(ctx, highlighted)
        else openInEditor(ctx, highlighted)
      }
      return true
  }

  // Everything else is swallowed while the overlay is open (modal).
  return true
}
