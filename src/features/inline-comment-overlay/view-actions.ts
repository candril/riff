/**
 * What the thread panel's keys do in view mode (spec 039). The heavy
 * lifting (delete, submit, resolve, the adjacent jump, the `$EDITOR` reply
 * and edit) is delegated through the deps, which the app wires.
 */

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
} from "../../state"
import { stateFilterTarget } from "../../app/view-filter"
import { commentHunk } from "./hunk"
import { entrySpans, halfPageEntry, UNLAID, type ThreadPanelLayout } from "./motions"
import { groupIntoThreads, threadRootId } from "../../utils/threads"
import type { CommentDraftsState } from "./drafts-state"
import type { ToastState } from "../toast/state"
import type { ComposerPickersState } from "./composer-pickers-state"
import type { CodePeekState } from "./code-peek-state"

export interface ThreadPanelViewDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  /** $EDITOR reply (Shift-r) to the thread rooted at `replyTo`. Reuses the existing add-comment flow. */
  handleReplyExternal: (replyTo: string | undefined) => void
  /** $EDITOR edit (Shift-e). Reuses the existing add-comment flow,
   *  which detects edits via the comment id passed back from the
   *  editor output. The editor is handed the thread rooted at `replyTo`. */
  handleEditExternal: (replyTo: string | undefined) => void
  handleDelete: (comment: Comment) => void
  /** Pushes a local or locally edited comment to GitHub. */
  handleSubmit: (comment: Comment) => void
  handleToggleResolved: (thread: Thread) => void
  /** `H` — show only open threads, or all of them again. */
  handleToggleOpenOnly: () => void
  /** Ctrl-n and `J`/`K` — jump to the next or previous thread, repositioning the panel. */
  handleJumpAdjacent: (direction: 1 | -1) => void
  /** `n` from the panel — start a new comment anchored at the diff
   *  cursor's current line. The panel doesn't know about line mapping or
   *  vim state, so this is wired up at the app level. */
  handleStartNewComment: () => void
  /** Move the diff cursor to the highlighted comment's source line so
   *  the diff stays in sync as the user navigates threads with j/k.
   *  Wired at the app level (needs lineMapping + vim state). */
  syncCursorToHighlight: () => void
  /** Where the panel's entries were last drawn, for Ctrl-d / Ctrl-u; null before the panel is laid out. */
  getPanelLayout: () => ThreadPanelLayout | null
  /** The columns of the panel's comment stack, which an unmounted entry's guessed rows wrap to. */
  getPanelTextWidth: () => number
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
  /** The kept drafts the composer picks back up (spec 061). */
  commentDrafts: Pick<CommentDraftsState, "on">
  /** Cleared whenever the composer opens, changes mode or closes with the panel. */
  composerPickers: Pick<ComposerPickersState, "clear">
  /** The code peek (spec 060), which closes with the panel. */
  codePeek: Pick<CodePeekState, "id" | "open" | "close">
}

type Deps = ThreadPanelViewDeps

/** The comment the highlight is on: j/k move through the display order, in which resolved threads collapse to their root. */
export function highlightedComment(state: AppState): Comment | undefined {
  return getInlineCommentOverlayDisplayOrder(state)[state.inlineCommentOverlay.highlightedIndex]
}

/**
 * The root of the highlighted comment's thread: a line can hold several, and
 * a reply answers this one. Looked up among all comments, since the panel's
 * filter can leave a root out while showing its replies.
 */
function highlightedThreadRoot(state: AppState): string | undefined {
  const highlighted = highlightedComment(state)
  if (!highlighted) return undefined
  return threadRootId(state.comments, highlighted.id) ?? highlighted.id
}

function update(deps: Deps, updater: (s: AppState) => AppState): void {
  deps.setState(updater)
  deps.render()
}

/** An update that starts, swaps or ends the composer, whose pickers do not carry over. */
function recompose(deps: Deps, updater: (s: AppState) => AppState): void {
  deps.setState(updater)
  deps.composerPickers.clear()
  deps.render()
}

/** The peek is a sub-modal of the panel, so it goes down with it. */
function dismissPanel(deps: Deps): void {
  deps.codePeek.close()
  recompose(deps, closeInlineCommentOverlay)
}

export function closeFilter(deps: Deps): void {
  update(deps, (s) => clearViewFilter(s, stateFilterTarget(s)))
}

export function commitFilter(deps: Deps): void {
  update(deps, (s) => commitViewFilter(s, stateFilterTarget(s)))
}

export function startFilter(deps: Deps): void {
  update(deps, (s) => startViewFilter(s, stateFilterTarget(s)))
}

export function closeCodePeek(deps: Deps): void {
  deps.codePeek.close()
  deps.render()
}

/** Ctrl-h — hand focus back to the diff (mirror of file tree's exit). */
export function focusDiff(deps: Deps): void {
  update(deps, (s) => ({ ...s, focusedPanel: "diff" }))
}

/** Ctrl-e — toggle expanded width (mirror of file tree's Ctrl-e). */
export function toggleExpanded(deps: Deps): void {
  update(deps, (s) => ({
    ...s,
    inlineCommentOverlay: {
      ...s.inlineCommentOverlay,
      expanded: !s.inlineCommentOverlay.expanded,
    },
  }))
}

/** The panel is where the user is looking at a specific thread, so no target resolution needed. */
export function copyLink(deps: Deps): void {
  const highlighted = highlightedComment(deps.getState())
  if (highlighted) deps.handleCopyLink(highlighted)
}

export function closePanel(deps: Deps): void {
  dismissPanel(deps)
}

export function highlightEntry(deps: Deps, index: number): void {
  deps.setState((s) => moveInlineCommentOverlayHighlight(s, index - s.inlineCommentOverlay.highlightedIndex))
  deps.syncCursorToHighlight()
  deps.render()
}

/**
 * Ctrl-d / Ctrl-u — half a page of drawn rows. The window follows the
 * highlighted comment, so moving the highlight scrolls the view.
 */
export function halfPage(deps: Deps, direction: 1 | -1): void {
  const state = deps.getState()
  const layout = deps.getPanelLayout() ?? UNLAID
  const spans = entrySpans(getInlineCommentOverlayDisplayOrder(state), layout, deps.getPanelTextWidth())
  highlightEntry(deps, halfPageEntry(spans, state.inlineCommentOverlay.highlightedIndex, direction, layout.viewportRows))
}

export function jumpToEnd(deps: Deps): void {
  highlightEntry(deps, Math.max(0, getInlineCommentOverlayDisplayOrder(deps.getState()).length - 1))
}

export function moveHighlight(deps: Deps, delta: 1 | -1): void {
  deps.setState((s) => moveInlineCommentOverlayHighlight(s, delta))
  deps.syncCursorToHighlight()
  deps.render()
}

/**
 * `za` and Enter: resolved threads reveal their body and replies,
 * outdated threads the original diff hunk.
 */
export function toggleHighlightedThread(deps: Deps): void {
  const state = deps.getState()
  const highlighted = highlightedComment(state)
  if (!highlighted) return
  const rootId = threadRootId(getInlineCommentOverlayComments(state), highlighted.id) ?? highlighted.id
  update(deps, (s) => toggleInlineCommentOverlayExpand(s, rootId))
}

export function toggleOpenOnly(deps: Deps): void {
  deps.handleToggleOpenOnly()
}

export function jumpAdjacent(deps: Deps, direction: 1 | -1): void {
  deps.handleJumpAdjacent(direction)
}

export function startNew(deps: Deps): void {
  deps.handleStartNewComment()
}

/**
 * The inline reply re-anchors to the highlighted thread's (file, line,
 * side) before dropping into the composer: without it, replying after
 * j/k navigation (or in all-files view, after crossing files) would
 * attach to whatever the panel was originally opened on. With nothing
 * highlighted there is no thread to answer, so `r` opens a new comment
 * on the panel's line, which is what the composer then says.
 */
export function replyInline(deps: Deps): void {
  const state = deps.getState()
  const highlighted = highlightedComment(state)
  const replyTo = highlightedThreadRoot(state)
  if (highlighted && replyTo) {
    const { filename, line, side } = highlighted
    deps.setState((s) => startInlineCompose({
      ...s,
      inlineCommentOverlay: { ...s.inlineCommentOverlay, filename, line, side },
    }, deps.commentDrafts.on({ replyTo }), { replyTo }))
  } else {
    const { filename, line, side } = state.inlineCommentOverlay
    deps.setState((s) => startInlineCompose(s, deps.commentDrafts.on({ filename, line, side })))
  }
  deps.composerPickers.clear()
  deps.render()
}

// The highlight is read before the panel goes: it is what says which thread is meant.
export function replyInEditor(deps: Deps): void {
  const replyTo = highlightedThreadRoot(deps.getState())
  dismissPanel(deps)
  deps.handleReplyExternal(replyTo)
}

export function editInEditor(deps: Deps): void {
  const replyTo = highlightedThreadRoot(deps.getState())
  dismissPanel(deps)
  deps.handleEditExternal(replyTo)
}

/** Only the highlighted comment can be edited, so with none there is nothing to open. */
export function editInline(deps: Deps, highlighted: Comment): void {
  const prefill = highlighted.localEdit ?? highlighted.body
  recompose(deps, (s) => startInlineEdit(s, highlighted.id, deps.commentDrafts.on({ editingId: highlighted.id }) || prefill))
}

export function deleteHighlighted(deps: Deps): void {
  const highlighted = highlightedComment(deps.getState())
  if (highlighted) deps.handleDelete(highlighted)
}

/** Resolution belongs to the thread, looked up among all the panel's comments rather than the display order. */
export function toggleResolved(deps: Deps): void {
  const state = deps.getState()
  const highlighted = highlightedComment(state)
  if (!highlighted) return
  const thread = groupIntoThreads(getInlineCommentOverlayComments(state)).find((t) =>
    t.comments.some((c) => c.id === highlighted.id)
  )
  if (thread) deps.handleToggleResolved(thread)
}

/** Only what GitHub does not have yet can be posted: a local comment, or a local edit of a synced one. */
export function submit(deps: Deps): void {
  const highlighted = highlightedComment(deps.getState())
  if (highlighted && (highlighted.status === "local" || highlighted.localEdit !== undefined)) {
    deps.handleSubmit(highlighted)
  }
}

/**
 * The code this comment was written against — the only copy of it riff
 * has once the thread has gone outdated (spec 060).
 */
export function openCodePeek(deps: Deps, highlighted: Comment): void {
  if (!commentHunk(getInlineCommentOverlayComments(deps.getState()), highlighted.id)) {
    deps.toast.show("No stored context for this comment", "info")
    deps.render()
    setTimeout(() => {
      deps.toast.clear()
      deps.render()
    }, 2000)
    return
  }
  deps.codePeek.open(highlighted.id)
  deps.render()
}

/**
 * Not gated on outdated: it works for any thread, and just happens to be
 * the only way to inspect outdated context.
 */
export function openInEditor(deps: Deps, highlighted: Comment): void {
  deps.handleOpenInEditor(highlighted)
}

/**
 * The panel can only name a comment's images; the browser is where they
 * can actually be seen (and, for a private repo, the only place
 * authenticated to fetch them at all).
 */
export function openImages(deps: Deps, highlighted: Comment): void {
  deps.handleOpenImages(highlighted)
}

export function react(deps: Deps): void {
  deps.onReact()
}

export function openLinks(deps: Deps, highlighted: Comment, action: "open" | "copy"): void {
  deps.onOpenLinks(highlighted, action)
}

export function toggleHelp(deps: Deps): void {
  deps.onToggleHelp()
}
