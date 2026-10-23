/**
 * App-level jumplist (spec 038).
 *
 * Records "big" navigation events so the user can retrace their steps with
 * `Ctrl-O` (back) and `Ctrl-I` (forward), matching nvim muscle memory.
 *
 * A jump captures: selected file (by index *and* filename for stability),
 * viewing commit, view mode, split or unified, the focused panel, and the
 * cursor's line anchored as a mark is (file, line, side, text). `apply`
 * restores those, looking the anchor up in the mapping as it is now, so
 * folds and a refresh do not move it.
 *
 * The list itself is `createJumpListState` (state.ts), walked by walk.ts;
 * this module takes a place and goes back to one.
 */

import type { AppState } from "../../state"
import { selectFile, clearFileSelection, switchView, enterDiffView } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { anchorAt } from "../marks/capture"
import { resolveMark } from "../marks/resolve"
import { openFoldHiding } from "../marks/fold-hiding"
import type { Jump } from "./types"
import { sameAnchor } from "./place"

export type { Jump, JumpList } from "./types"
export { sameLine, sameLocation } from "./place"
export { isStepMotion, isListWalk, isFindMotion } from "./keys"

type Pane = "left" | "right"

/**
 * The file the cursor is standing in, which in the all-files view is not the
 * selected file — there isn't one. Stepping out of a file and into the next
 * is a navigation even when `j` is what did it (spec 089).
 */
export function cursorFile(mapping: { getLine(i: number): { filename?: string } | undefined }, line: number): string | null {
  return mapping.getLine(line)?.filename ?? null
}

/**
 * Snapshot the current location into a Jump. `view.split` is whether split
 * is asked for, and `view.pane` the active split pane, which decides the
 * side of a line both panes show.
 */
export function capture(
  state: AppState,
  vim: VimCursorState,
  mapping: Pick<DiffLineMapping, "getLine">,
  view: { split: boolean; pane?: Pane | null },
): Jump {
  const filename =
    state.selectedFileIndex !== null
      ? state.files[state.selectedFileIndex]?.filename ?? null
      : null
  return {
    fileIndex: state.selectedFileIndex,
    filename,
    viewingCommit: state.viewingCommit,
    viewMode: state.viewMode,
    splitView: view.split,
    focusedPanel: state.focusedPanel,
    // The mapping is the diff's even while another view shows, so off the
    // diff the cursor's line would anchor to a row that is not under it.
    anchor: state.viewMode === "diff" ? anchorAt(mapping, vim.line, view.pane ?? undefined) : null,
    cursorLine: vim.line,
    cursorCol: vim.col,
  }
}

export interface JumpApplyContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  rebuildLineMapping: () => void
  setPane: (pane: Pane) => void
  splitView: () => boolean
  toggleSplitView: () => void
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

    // The view comes back last: selecting a file or clearing the selection
    // leaves the overview for the diff, which would undo it. Both directions
    // are judged on the view the apply started in, since that selection has
    // already flipped viewMode: into the diff it would keep the overview's
    // reaction target that enterDiffView drops, and out of it the view key's
    // one slot of history would name the diff rather than where the reader
    // was. The cursor below is read against this view and the mapping
    // rebuilt for it.
    if (jump.viewMode === "diff") {
      if (s.viewMode !== "diff") next = enterDiffView(next)
    } else if (s.viewMode !== jump.viewMode) {
      next = switchView({ ...next, viewMode: s.viewMode }, jump.viewMode)
    } else {
      next = { ...next, viewMode: s.viewMode, previousView: s.previousView }
    }

    return { ...next, focusedPanel: focusable(next, jump.focusedPanel) }
  })

  ctx.rebuildLineMapping()
  const landing = landingOf(jump, ctx)

  // The cursor moves; it is not rebuilt. A fresh one would throw away the
  // last search and vim's own jump state along with the position, so going
  // back would quietly cost you `n`.
  ctx.setVimState({
    ...ctx.getVimState(),
    line: landing.line,
    col: Math.max(0, jump.cursorCol ?? 0),
    mode: "normal",
    selectionAnchor: null,
    selectionAnchorCol: null,
    desiredCol: null,
    pendingTextObject: null,
    pendingFindChar: null,
  })
  // After the cursor has moved, so the pane split opens in is the
  // destination's and its own draw already shows the destination. The
  // mapping is the same in both layouts, so the landing above holds.
  if (ctx.splitView() !== jump.splitView) ctx.toggleSplitView()
  // A context row is in both panes, and split leaves the pane alone there,
  // so the entry's own side has to be made active.
  if (landing.side) ctx.setPane(landing.side === "LEFT" ? "left" : "right")

  // One paint. Rendering, settling the scroll and rendering again showed the
  // destination at the scroll position of where you came from, then moved it
  // — which is the flicker.
  ctx.render()
  ctx.ensureCursorVisible()
}

/**
 * Ctrl-o returns to a place; it does not undo closing a panel, so focus
 * recorded in a panel that has since closed lands in the diff.
 */
function focusable(state: AppState, panel: AppState["focusedPanel"]): AppState["focusedPanel"] {
  switch (panel) {
    case "tree":
      return state.showFilePanel ? panel : "diff"
    case "comments":
      return state.inlineCommentOverlay.open ? panel : "diff"
    case "chat":
      return state.chatOpen ? panel : "diff"
    case "diff":
      return panel
  }
}

/**
 * The anchor looked up in the mapping as it is now. A row with no line of
 * its own (a divider, the spacing below a file) is anchored to the nearest
 * numbered row above, so while the mapping line it was taken on still
 * stands for the anchor, that line is where you were. Without an anchor,
 * or in a mapping that does not show its file, the line is all there is.
 */
function landingOf(jump: Jump, ctx: JumpApplyContext): { line: number; side: "LEFT" | "RIGHT" | null } {
  const anchor = jump.anchor
  if (!anchor) return { line: Math.max(0, jump.cursorLine), side: null }
  const mapping = ctx.getLineMapping()
  const there = anchorAt(mapping, jump.cursorLine, anchor.side === "LEFT" ? "left" : "right")
  if (there && sameAnchor(there, anchor)) return { line: jump.cursorLine, side: anchor.side }

  const found = resolveMark(mapping, anchor)
  if (!found) return { line: Math.max(0, jump.cursorLine), side: null }
  const resolved = openFoldHiding(anchor, found, {
    setState: ctx.setState,
    getLineMapping: ctx.getLineMapping,
    rebuildLineMapping: () => {
      ctx.rebuildLineMapping()
      return ctx.getLineMapping()
    },
  })
  return { line: resolved.line, side: resolved.side }
}
