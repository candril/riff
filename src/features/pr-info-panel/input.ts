/**
 * PR Info Panel input handling.
 *
 * The PR info panel captures all input when open. It displays PR details
 * with section-based navigation:
 * - Tab: cycle between sections
 * - j/k: navigate items within active section
 * - za/zm/zr/zR/zM: fold controls
 * - Enter: action on selected item
 *
 * What each key does is in `actions.ts`, `row-actions.ts` and
 * `comment-input.ts`.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import * as act from "./actions"
import * as row from "./row-actions"
import * as comment from "./comment-input"

// Key sequence state for multi-key commands (e.g., "gg" for go to top)
let pendingKey: string | null = null
let pendingTimeout: ReturnType<typeof setTimeout> | null = null

function clearPendingKey(): void {
  pendingKey = null
  if (pendingTimeout) {
    clearTimeout(pendingTimeout)
    pendingTimeout = null
  }
}

/** The panel's deps with the state as it stood when the key arrived. */
export interface PRInfoPanelInputContext extends Omit<act.PRInfoPanelDeps, "getState"> {
  readonly state: AppState
}

/**
 * Handle input when PR info panel is open.
 * Returns true if the key was handled (panel is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: PRInfoPanelInputContext
): boolean {
  const deps: act.PRInfoPanelDeps = { ...ctx, getState: () => ctx.state }
  const handled = handleInputInner(key, deps)
  // After every consumed key, sync state.reactionTarget to whatever the
  // panel is focused on now — keeps Ctrl+p → React… targeting the
  // visually-focused item (spec 042).
  if (handled) act.syncReactionTarget(deps)
  return handled
}

function handleInputInner(
  key: KeyEvent,
  deps: act.PRInfoPanelDeps
): boolean {
  const state = deps.getState()
  if (state.viewMode !== "state") {
    return false
  }

  // The `Ctrl-f` prompt owns every key while it is open; only the two that
  // mean something to riff are taken, and the rest reach the input widget
  // (spec 065).
  if (state.prInfoPanel.filterInput) {
    if (key.name === "escape") {
      key.preventDefault()
      act.closeFilter(deps)
    } else if (key.name === "return" || key.name === "enter") {
      key.preventDefault()
      act.commitFilter(deps)
    }
    return true
  }

  // When the tree sidebar has focus (spec 041: the tree is visible
  // alongside the PR view), let tree key handling run — except for the
  // sub-modal below, which always wins.
  if (!state.prInfoPanel.commentInputOpen && state.focusedPanel === "tree") {
    return false
  }

  // Handle PR comment input mode (sub-modal within the PR view)
  if (state.prInfoPanel.commentInputOpen) {
    handleCommentInput(key, deps)
    return true
  }

  const panel = deps.getPanel()

  // Ctrl-modified keys never match the section-scoped letter handlers
  // below — fall through so Ctrl-O (jumplist back), Ctrl-I (forward),
  // Ctrl-P (palette), etc. reach the global handler. Without this guard
  // Ctrl-O would hit `case "o":` and trigger "open in browser" (spec 038).
  if (key.ctrl) {
    return false
  }

  if (pendingKey === "z") {
    clearPendingKey()
    if (!panel) return true
    switch (key.name) {
      case "a":
        act.toggleFold(deps)
        return true
      case "m":
        act.collapse(deps, key.shift)
        return true
      case "r":
        act.expand(deps, key.shift)
        return true
    }
    return true
  }

  // Resolve `g`-prefixed chords before the switch so the panel's standalone
  // `r`/`o`/`y` handlers (expand-section / open-focused / copy-focused)
  // don't swallow the chord key.
  if (pendingKey === "g") {
    clearPendingKey()
    // `?` reaches some terminals as a name and others only as the sequence.
    if (key.name === "?" || key.sequence === "?") {
      act.toggleHelp(deps)
      return true
    }
    switch (key.name) {
      case "g":
        act.scrollTop(deps)
        return true
      case "r":
        act.runAction(deps, "refresh")
        return true
      case "o":
        act.runAction(deps, "open-in-browser")
        return true
      case "y":
        act.runAction(deps, "copy-pr-url")
        return true
      // Terminals differ in whether shift+b reports its name as `B` or `b`.
      case "B":
        act.runAction(deps, "open-in-board")
        return true
      case "b":
        if (key.shift) act.runAction(deps, "open-in-board")
        return true
      case "x":
      case "X":
        // preventDefault so the picker's prompt field, focused in this same
        // keypress, does not also read the `x` as the first letter of a query.
        key.preventDefault()
        act.openLinks(deps, key.shift || key.name === "X" ? "copy" : "open")
        return true
    }
    // Unknown g-sequence: swallow to avoid accidentally falling through
    // into the panel-local `r`/`o`/`y`/etc. handlers below.
    return true
  }

  if (key.name === "+" || key.sequence === "+") {
    // preventDefault so the picker's prompt field, focused in this same
    // keypress, does not read the `+` as the start of a query.
    key.preventDefault()
    act.react(deps)
    return true
  }

  // Opening the filter focuses its input in this same keypress.
  if (key.name === "/" || key.sequence === "/") {
    key.preventDefault()
    act.startFilter(deps)
    return true
  }

  switch (key.name) {
    case "i":
      // Bare `i` is the view router's — it takes you back to wherever you
      // came from (spec 064).
      return false

    case "tab":
      // Tab now means jumplist forward (spec 038); falls through to the
      // global handler.
      return false

    case "c":
      act.openCommentInput(deps)
      return true

    case "l":
      act.expandItem(deps)
      return true

    case "h":
      act.collapseItem(deps)
      return true

    case "x":
      act.toggleResolved(deps)
      return true

    case "z":
      // Fold commands: za, zm, zr, zM, zR — a real chord, so that the
      // letters they end in stay free for the keys that reach every view
      // (`a` is the feed, spec 064).
      pendingKey = "z"
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return true

    case "return":
    case "enter":
      row.activate(deps, key)
      return true

    case "o":
      row.openFocused(deps, key)
      return true

    case "y":
      if (key.shift) row.copyAll(deps)
      else row.copyFocused(deps, key)
      return true

    case "j":
    case "down":
      act.moveDown(deps)
      return true

    case "k":
    case "up":
      act.moveUp(deps)
      return true

    case "d":
      // Ctrl+d pages down. Bare `d` is the diff: on a file row it opens the
      // diff at that file (spec 067), anywhere else the view router takes it.
      if (!key.ctrl) return act.jumpToFileOnRow(deps)
      if (panel) panel.getScrollBox().scrollBy(10)
      return true

    case "u":
      // Ctrl+u: page up
      if (key.ctrl && panel) {
        panel.getScrollBox().scrollBy(-10)
      }
      return true

    case "g": {
      if (key.shift) {
        act.scrollBottom(deps)
        return true
      }
      // Start key sequence for g-prefixed commands
      pendingKey = "g"
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return true
    }

  }

  // Let truly global keys fall through: q / escape (quit / toast-clear),
  // `tab` for jumplist forward (spec 038; terminal input collapses Ctrl-I
  // to Tab), `i` / `a` for the view router (spec 064) and `s` for flash
  // (spec 066). Ctrl-modified keys are already handled by the early-return
  // at the top of this function.
  if (
    key.name === "q" ||
    key.name === "escape" ||
    key.name === "tab" ||
    key.name === "i" ||
    key.name === "a" ||
    key.name === "s"
  ) {
    return false
  }

  // Capture all other keys while in PR view
  return true
}

/**
 * Handle input when PR comment input is open
 */
function handleCommentInput(
  key: KeyEvent,
  deps: act.PRInfoPanelDeps
): void {
  switch (key.name) {
    case "escape":
      comment.closeCommentInput(deps)
      return

    case "return":
    case "enter":
      comment.submitComment(deps)
      return

    case "backspace":
      comment.deleteCommentChar(deps)
      return

    default:
      // Add character to input
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        comment.typeIntoComment(deps, key.sequence)
      } else if (key.name === "j" && key.ctrl) {
        comment.newlineInComment(deps)
      }
      return
  }
}
