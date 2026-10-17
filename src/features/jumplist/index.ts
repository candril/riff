/**
 * App-level jumplist (spec 038).
 *
 * Records "big" navigation events so the user can retrace their steps with
 * `Ctrl-O` (back) and `Ctrl-I` (forward), matching nvim muscle memory.
 *
 * A jump captures: selected file (by index *and* filename for stability),
 * viewing commit, view mode, and the vim cursor line. `apply` restores
 * those — by filename when files have been re-parsed (commit switch, refresh).
 */

import type { AppState } from "../../state"
import { selectFile, clearFileSelection, switchView, enterDiffView } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { Jump } from "./types"
import { sameLocation } from "./place"

export type { Jump, JumpListState } from "./types"
export { createJumpListState } from "./types"
export { sameLocation } from "./place"
export { isStepMotion, isListWalk, isFindMotion } from "./keys"

const MAX_ENTRIES = 100

/**
 * The file the cursor is standing in, which in the all-files view is not the
 * selected file — there isn't one. Stepping out of a file and into the next
 * is a navigation even when `j` is what did it (spec 089).
 */
export function cursorFile(mapping: { getLine(i: number): { filename?: string } | undefined }, line: number): string | null {
  return mapping.getLine(line)?.filename ?? null
}

/** Snapshot the current location into a Jump. */
export function capture(state: AppState, vim: VimCursorState): Jump {
  const filename =
    state.selectedFileIndex !== null
      ? state.files[state.selectedFileIndex]?.filename ?? null
      : null
  return {
    fileIndex: state.selectedFileIndex,
    filename,
    viewingCommit: state.viewingCommit,
    viewMode: state.viewMode,
    cursorLine: vim.line,
    cursorCol: vim.col,
  }
}

/**
 * Push a jump entry. Truncates forward history (standard jumplist
 * semantics), evicts FIFO at the cap, and coalesces consecutive duplicates.
 */
export function push(state: AppState, jump: Jump): AppState {
  const list = state.jumpList
  const tip = list.index >= 0 ? list.entries[list.index] : undefined
  if (tip && sameLocation(tip, jump)) return state

  const truncated = list.entries.slice(0, list.index + 1)
  truncated.push(jump)
  const trimmed =
    truncated.length > MAX_ENTRIES
      ? truncated.slice(truncated.length - MAX_ENTRIES)
      : truncated

  return {
    ...state,
    jumpList: { entries: trimmed, index: trimmed.length - 1 },
  }
}

/**
 * Convenience: capture current location and push in one step. Use this
 * BEFORE a navigation mutates state — the entry is the location you'll
 * jump back to.
 */
export function pushCurrent(state: AppState, vim: VimCursorState): AppState {
  return push(state, capture(state, vim))
}

/** Move back; returns new jumplist state + the jump to apply, or null. */
export function back(state: AppState, vim: VimCursorState): { state: AppState; jump: Jump } | null {
  const list = state.jumpList
  if (list.index < 0 || list.entries.length === 0) return null

  // Standard nvim behaviour: the *first* Ctrl-O from the tip jumps to the
  // tip entry itself (you haven't moved yet, so the tip is the previous
  // location). We approximate by pushing current position once when the
  // user is at the tail and the tip differs from now.
  let workingState = state
  let workingList = list
  if (list.index === list.entries.length - 1) {
    const here = capture(state, vim)
    const tip = list.entries[list.index]!
    if (!sameLocation(here, tip)) {
      // Push current as a new tip so back-jump lands on the old tip.
      workingState = push(state, here)
      workingList = workingState.jumpList
    }
  }

  if (workingList.index <= 0) return null
  const newIndex = workingList.index - 1
  const target = workingList.entries[newIndex]!
  return {
    state: {
      ...workingState,
      jumpList: { ...workingList, index: newIndex },
    },
    jump: target,
  }
}

/** Move forward; returns new jumplist state + the jump to apply, or null. */
export function forward(state: AppState): { state: AppState; jump: Jump } | null {
  const list = state.jumpList
  if (list.index < 0 || list.index >= list.entries.length - 1) return null
  const newIndex = list.index + 1
  const target = list.entries[newIndex]!
  return {
    state: {
      ...state,
      jumpList: { ...list, index: newIndex },
    },
    jump: target,
  }
}

export interface JumpApplyContext {
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  rebuildLineMapping: () => void
  ensureCursorVisible: () => void
  render: () => void
  onCommitSelected: (sha: string | null) => void
}

/**
 * Apply a jump to the current state. Resolves stale `fileIndex` via
 * `filename` lookup so refreshes/commit switches don't break jumps.
 *
 * Cross-commit jumps go through `onCommitSelected` (async) — we set the
 * commit and let it complete; file/cursor restore happens after via
 * setTimeout so the line mapping is current. Same-commit jumps apply
 * synchronously.
 */
export function apply(jump: Jump, ctx: JumpApplyContext): void {
  let didCommitSwitch = false
  ctx.setState((s) => {
    if (s.viewingCommit !== jump.viewingCommit) {
      didCommitSwitch = true
      // Defer to onCommitSelected — it handles cache, fetch, and line
      // mapping rebuild. We schedule the file/cursor restore below.
      return s
    }
    return s
  })

  if (didCommitSwitch) {
    ctx.onCommitSelected(jump.viewingCommit)
    // The commit switch is async; restore file/cursor after it settles.
    setTimeout(() => applyFileAndCursor(jump, ctx), 0)
    return
  }

  applyFileAndCursor(jump, ctx)
}

function applyFileAndCursor(jump: Jump, ctx: JumpApplyContext): void {
  ctx.setState((s) => {
    let next = s

    // The view the jump was taken in comes back first: the file selection
    // and cursor below are read against it.
    if (next.viewMode !== jump.viewMode) {
      next = jump.viewMode === "diff" ? enterDiffView(next) : switchView(next, jump.viewMode)
    }

    // File selection — resolve by filename if the index is stale.
    let targetIndex: number | null = null
    if (jump.filename) {
      targetIndex = next.files.findIndex((f) => f.filename === jump.filename)
      if (targetIndex === -1) targetIndex = null
    } else if (jump.fileIndex !== null && jump.fileIndex < next.files.length) {
      targetIndex = jump.fileIndex
    }

    if (targetIndex !== null && targetIndex !== next.selectedFileIndex) {
      next = selectFile(next, targetIndex)
    } else if (targetIndex === null && next.selectedFileIndex !== null && jump.fileIndex === null) {
      next = clearFileSelection(next)
    }

    return next
  })

  ctx.rebuildLineMapping()

  // The cursor moves; it is not rebuilt. A fresh one would throw away the
  // marks and the last search along with the position, so going back would
  // quietly cost you `n` and every `'a`.
  ctx.setVimState({
    ...ctx.getVimState(),
    line: Math.max(0, jump.cursorLine),
    col: Math.max(0, jump.cursorCol ?? 0),
    mode: "normal",
    selectionAnchor: null,
    selectionAnchorCol: null,
    desiredCol: null,
    pendingTextObject: null,
    pendingFindChar: null,
  })

  // One paint. Rendering, settling the scroll and rendering again showed the
  // destination at the scroll position of where you came from, then moved it
  // — which is the flicker.
  ctx.render()
  ctx.ensureCursorVisible()
}
