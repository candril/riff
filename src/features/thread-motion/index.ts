/**
 * Thread motion — `]r` / `[r` to jump the cursor to the next/previous
 * commented line; `]R` / `[R` to skip resolved threads.
 *
 * Also used by the thread-preview overlay's `Ctrl-n` / `Ctrl-p` to move
 * between threads without closing.
 */

import type { AppState } from "../../state"
import { unseenComments, type VisitWatermark } from "../../utils/visit"
import type { VisitState } from "../visit/state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FileNavigationContext } from "../file-navigation"
import { handleSelectFile, ensureFileExpanded } from "../file-navigation"
import { openInlineCommentOverlay, expandThreadFor } from "../../state"

export interface ThreadAnchor {
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
  rootCommentId: string
  resolved: boolean
  outdated: boolean
}

export interface ThreadMotionContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  getLineMapping: () => DiffLineMapping
  ensureCursorVisible: () => void
  render: () => void
  fileNavContext: FileNavigationContext
  /** The last visit, which says what `]n`/`[n` count as unseen. */
  visit: Pick<VisitState, "watermark">
}

export interface ThreadAnchorFilter {
  skipResolved?: boolean
  /** Drop outdated threads too, as the thread panel's open-only does (spec 039). */
  skipOutdated?: boolean
  /** Only threads carrying a comment you have not seen (spec 069). */
  unseenOnly?: boolean
  /** What unseenOnly measures against; without one nothing is unseen. */
  watermark?: VisitWatermark | null
}

/**
 * Get all root-comment anchors in the PR, sorted by (filename, line).
 */
export function getThreadAnchors(
  state: AppState,
  { skipResolved = false, skipOutdated = false, unseenOnly = false, watermark = null }: ThreadAnchorFilter = {}
): ThreadAnchor[] {
  const unseen = unseenOnly
    ? new Set(unseenComments(state.comments, watermark).map((c) => c.inReplyTo ?? c.id))
    : null
  const anchors: ThreadAnchor[] = []
  for (const c of state.comments) {
    if (c.inReplyTo) continue
    const resolved = c.isThreadResolved ?? false
    const outdated = c.outdated ?? false
    if (skipResolved && resolved) continue
    if (skipOutdated && outdated) continue
    if (unseen && !unseen.has(c.id)) continue
    anchors.push({
      filename: c.filename,
      line: c.line,
      side: c.side,
      rootCommentId: c.id,
      resolved,
      outdated,
    })
  }
  anchors.sort((a, b) => {
    const f = a.filename.localeCompare(b.filename)
    if (f !== 0) return f
    return a.line - b.line
  })
  return anchors
}

/**
 * Find the next or previous anchor relative to a (filename, line) position.
 * `direction === 1` → first anchor strictly after; `-1` → strictly before.
 * Wraps at ends.
 */
export function findThreadAnchor(
  anchors: ThreadAnchor[],
  from: { filename: string; line: number } | null,
  direction: 1 | -1
): ThreadAnchor | null {
  if (anchors.length === 0) return null
  if (!from) return direction === 1 ? anchors[0]! : anchors[anchors.length - 1]!

  if (direction === 1) {
    for (const a of anchors) {
      if (a.filename > from.filename || (a.filename === from.filename && a.line > from.line)) {
        return a
      }
    }
    return anchors[0]! // wrap
  } else {
    for (let i = anchors.length - 1; i >= 0; i--) {
      const a = anchors[i]!
      if (a.filename < from.filename || (a.filename === from.filename && a.line < from.line)) {
        return a
      }
    }
    return anchors[anchors.length - 1]! // wrap
  }
}

/**
 * Derive the current anchor position (filename + file line) for comparison
 * against thread anchors. Returns null when the cursor is on a non-file line.
 */
function getCurrentPosition(
  state: AppState,
  lineMapping: DiffLineMapping,
  vimLine: number
): { filename: string; line: number } | null {
  const line = lineMapping.getLine(vimLine)
  if (!line?.filename) return null
  const fileLine = line.newLineNum ?? line.oldLineNum
  if (fileLine === undefined) return null
  return { filename: line.filename, line: fileLine }
}

/**
 * Navigate the vim cursor to the next/prev thread anchor.
 * Handles cross-file jumps in single-file view.
 */
export function navigateToThread(
  direction: 1 | -1,
  skipResolved: boolean,
  ctx: ThreadMotionContext,
  unseenOnly = false
): ThreadAnchor | null {
  const state = ctx.getState()
  const anchors = getThreadAnchors(state, { skipResolved, unseenOnly, watermark: ctx.visit.watermark() })
  if (anchors.length === 0) return null

  const lineMapping = ctx.getLineMapping()
  const vim = ctx.getVimState()
  const from = getCurrentPosition(state, lineMapping, vim.line)
  const target = findThreadAnchor(anchors, from, direction)
  if (!target) return null

  revealAnchor(target, ctx)
  ctx.render()
  return target
}

/**
 * Bring a line into view and put the diff cursor on it: in single-file
 * view a line in another file switches files first, otherwise its file is
 * expanded so the line has a row.
 */
export function revealAnchor(
  anchor: Pick<ThreadAnchor, "filename" | "line" | "side">,
  ctx: ThreadMotionContext
): void {
  const state = ctx.getState()
  const inSingleFileView = state.selectedFileIndex !== null
  const targetFileIndex = state.files.findIndex((f) => f.filename === anchor.filename)

  if (inSingleFileView && targetFileIndex !== -1 && targetFileIndex !== state.selectedFileIndex) {
    handleSelectFile(targetFileIndex, ctx.fileNavContext)
  } else {
    ensureFileExpanded(anchor.filename, ctx.fileNavContext)
  }

  // The mapping is read after the file switch, which rebuilds it.
  const visualLine = ctx.getLineMapping().findLineForComment(anchor)
  if (visualLine !== null) {
    ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
    ctx.ensureCursorVisible()
  }
}

/**
 * Move the inline comment overlay to the next/prev thread without
 * closing it. Moves the vim cursor too so the underlying diff stays in
 * sync.
 */
export function jumpOverlayToAdjacentThread(
  direction: 1 | -1,
  ctx: ThreadMotionContext
): void {
  const state = ctx.getState()
  if (!state.inlineCommentOverlay.open) return

  // The panel's own jump stays among the threads the panel shows; ]r and [r
  // ignore open-only (spec 039).
  const skipClosed = state.threadPanelOpenOnly
  const anchors = getThreadAnchors(state, { skipResolved: skipClosed, skipOutdated: skipClosed })
  if (anchors.length === 0) return

  const from = {
    filename: state.inlineCommentOverlay.filename,
    line: state.inlineCommentOverlay.line,
  }
  const target = findThreadAnchor(anchors, from, direction)
  if (!target) return

  revealAnchor(target, ctx)

  // Reposition the overlay onto the new thread (view mode — adjacent
  // navigation is read-first; the user can still drop into compose
  // with `r` once the overlay is here).
  ctx.setState((s) =>
    expandThreadFor(
      openInlineCommentOverlay(s, target.filename, target.line, target.side, "view"),
      target.rootCommentId
    )
  )
  ctx.render()
}
