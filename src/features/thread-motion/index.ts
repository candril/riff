/**
 * Thread motion — `]r` / `[r` to jump the cursor to the next/previous
 * commented line; `]R` / `[R` to skip resolved threads.
 *
 * Also used by the thread-preview overlay's `Ctrl-n` / `Ctrl-p` to move
 * between threads without closing.
 */

import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { FileNavigationContext } from "../file-navigation"
import { handleSelectFile } from "../file-navigation"
import { openThreadPreview } from "../../state"

export interface ThreadAnchor {
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
  rootCommentId: string
  resolved: boolean
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
}

/**
 * Get all root-comment anchors in the PR, sorted by (filename, line).
 */
export function getThreadAnchors(state: AppState, skipResolved: boolean): ThreadAnchor[] {
  const anchors: ThreadAnchor[] = []
  for (const c of state.comments) {
    if (c.inReplyTo) continue
    const resolved = c.isThreadResolved ?? false
    if (skipResolved && resolved) continue
    anchors.push({
      filename: c.filename,
      line: c.line,
      side: c.side,
      rootCommentId: c.id,
      resolved,
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
  ctx: ThreadMotionContext
): ThreadAnchor | null {
  const state = ctx.getState()
  const anchors = getThreadAnchors(state, skipResolved)
  if (anchors.length === 0) return null

  const lineMapping = ctx.getLineMapping()
  const vim = ctx.getVimState()
  const from = getCurrentPosition(state, lineMapping, vim.line)
  const target = findThreadAnchor(anchors, from, direction)
  if (!target) return null

  const inSingleFileView = state.selectedFileIndex !== null
  const targetFileIndex = state.files.findIndex((f) => f.filename === target.filename)

  if (inSingleFileView && targetFileIndex !== -1 && targetFileIndex !== state.selectedFileIndex) {
    // Cross-file in single-file view: switch files first, then position cursor
    handleSelectFile(targetFileIndex, ctx.fileNavContext)
  }

  // Move vim cursor to the anchor line on the (now-current) line mapping
  const freshMapping = ctx.getLineMapping()
  const rootComment = state.comments.find((c) => c.id === target.rootCommentId)
  if (rootComment) {
    const visualLine = freshMapping.findLineForComment(rootComment)
    if (visualLine !== null) {
      ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
      ctx.ensureCursorVisible()
    }
  }

  ctx.render()
  return target
}

/**
 * Move the thread-preview overlay to the next/prev thread without closing.
 * Moves the vim cursor too so the underlying diff stays in sync.
 */
export function jumpOverlayToAdjacentThread(
  direction: 1 | -1,
  ctx: ThreadMotionContext
): void {
  const state = ctx.getState()
  if (!state.threadPreview.open) return

  const skipResolved = false
  const anchors = getThreadAnchors(state, skipResolved)
  if (anchors.length === 0) return

  const from = { filename: state.threadPreview.filename, line: state.threadPreview.line }
  const target = findThreadAnchor(anchors, from, direction)
  if (!target) return

  const inSingleFileView = state.selectedFileIndex !== null
  const targetFileIndex = state.files.findIndex((f) => f.filename === target.filename)

  if (inSingleFileView && targetFileIndex !== -1 && targetFileIndex !== state.selectedFileIndex) {
    handleSelectFile(targetFileIndex, ctx.fileNavContext)
  }

  const rootComment = state.comments.find((c) => c.id === target.rootCommentId)
  if (rootComment) {
    const mapping = ctx.getLineMapping()
    const visualLine = mapping.findLineForComment(rootComment)
    if (visualLine !== null) {
      ctx.setVimState({ ...ctx.getVimState(), line: visualLine })
      ctx.ensureCursorVisible()
    }
  }

  // Update the overlay to point at the new thread
  ctx.setState((s) => openThreadPreview(s, target.filename, target.line, target.side))
  ctx.render()
}
