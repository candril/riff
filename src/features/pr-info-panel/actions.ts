/**
 * What the PR overview's keys do: the section walk, the folds and the tree
 * walk of `l`/`h`, the filter, the `g` chords that reach the app. What
 * `Enter`, `o` and `y` do on the focused row is in `row-actions.ts`, the
 * comment prompt's keys in `comment-input.ts`. The panel controller does
 * the moving and folding; leaving the view is delegated through the deps,
 * which the app wires.
 */

import type { AppState } from "../../state"
import type { PRInfoPanelClass } from "../../components"
import type { PreviewRow } from "../../utils/previews"
import { foldStep, type FoldOp } from "../../components/pr-info-tree"
import { closePRInfoPanel, setReactionTarget } from "../../state"
import type { ToastState } from "../toast/state"
import type { PrCommentInputState } from "./comment-input-state"
import type { PrInfoFilterState } from "./filter-state"

export interface PRInfoPanelDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  toast: Pick<ToastState, "show" | "clear">
  commentInput: PrCommentInputState
  prInfoFilter: Pick<PrInfoFilterState, "filterInput" | "start" | "commit" | "clear">
  getPanel: () => PRInfoPanelClass | null
  onJumpToFile?: (filename: string) => void
  // Callback to open a specific file at a specific line in $EDITOR,
  // bypassing the diff view (spec 043). Used for check annotations —
  // the file may not even be in the PR diff.
  onOpenFileAtLine?: (filename: string, line: number) => void
  onActivateCommit?: (sha: string) => void
  /** Act on the preview row the cursor is on — open it, or copy it. When
   *  the row has several links, riff asks which (spec 068). */
  onPreviewRow?: (action: "open" | "copy", row: PreviewRow) => void
  onToggleThreadResolved?: (rootCommentId: string) => void
  // Open the inline comment overlay (the thread view) on a review thread,
  // identified by its root comment id. Enter in the Conversation section
  // uses this so a thread opens the same surface here as it does from the
  // diff and from the comments picker.
  onOpenThread?: (rootCommentId: string) => void
  // Dispatch a global action by id. Used so chord shortcuts like `gr`
  // (refresh), `go` (open in browser), `gy` (copy PR URL) work inside the
  // panel even though the panel captures `r`/`o`/`y` standalone for its
  // own section-scoped semantics.
  executeAction?: (id: string) => void
  /** `gx` opens a link in the view, `gX` copies it (spec 077). */
  onOpenLinks?: (action: "open" | "copy") => void
  /** `g?` — the keymap, which every surface owes the reader. */
  onToggleHelp?: () => void
  /** `+` — react on the focused description, comment or review (spec 042). */
  onReact?: () => void
}

type Deps = PRInfoPanelDeps

/** `j`/`down`: header → items → the next section's header. */
export function moveDown(deps: Deps): void {
  const panel = deps.getPanel()
  if (!panel) return
  if (panel.isSectionExpanded()) {
    const moved = panel.moveCursor(1)
    if (!moved) {
      panel.cycleSection(1)
    }
  } else {
    panel.cycleSection(1)
  }
}

/** `k`/`up`: items → header → the previous section's last row. */
export function moveUp(deps: Deps): void {
  const panel = deps.getPanel()
  if (!panel) return
  if (panel.isSectionExpanded()) {
    const moved = panel.moveCursor(-1)
    if (!moved) {
      panel.cycleSectionToEnd(-1)
    }
  } else {
    panel.cycleSectionToEnd(-1)
  }
}

/**
 * `l`/`h` and `za`/`zo`/`zc`: one rule at every level, section headers
 * included (spec 067). The tree decides, the panel folds and moves.
 */
export function fold(deps: Deps, op: FoldOp): void {
  const panel = deps.getPanel()
  if (!panel) return
  const intent = foldStep(panel.rowNodes(), panel.getCursorIndex(), panel.isSectionExpanded(), op)
  if (!intent) return
  if ('openSection' in intent) panel.expandSection()
  else if ('closeSection' in intent) panel.collapseSection()
  else if ('openRow' in intent) panel.openRow(intent.openRow)
  else if ('closeRow' in intent) panel.closeRow(intent.closeRow)
  else panel.moveCursorTo(intent.cursor)
  deps.render()
}

/** `zM`/`zm`: every section. */
export function collapse(deps: Deps): void {
  deps.getPanel()?.collapseAllSections()
}

/** `zR`/`zr`: every section. */
export function expand(deps: Deps): void {
  deps.getPanel()?.expandAllSections()
}

/**
 * `x`: only a review-thread row has a resolution state — a pr-comment or a
 * review header does not, and the key does nothing there.
 */
export function toggleResolved(deps: Deps): void {
  const panel = deps.getPanel()
  if (!panel || panel.getActiveSection() !== 'conversation') return
  const flat = panel.getSelectedFlatItem?.()
  if (!flat || flat.type !== 'review-thread') return
  deps.onToggleThreadResolved?.(flat.data.id)
}

/** `c` in the conversation section. */
export function openCommentInput(deps: Deps): void {
  const panel = deps.getPanel()
  if (panel && panel.getActiveSection() === 'conversation' && deps.getState().prInfo) {
    deps.commentInput.open()
    deps.render()
  }
}

/**
 * Bare `d` is the diff: on a file row it opens the diff at that file (spec
 * 067). False anywhere else, where the view router takes it.
 */
export function jumpToFileOnRow(deps: Deps): boolean {
  const filename = fileOnRow(deps)
  if (filename === null || !deps.onJumpToFile) return false
  deps.setState(closePRInfoPanel)
  deps.render()
  deps.onJumpToFile(filename)
  return true
}

/** Whether a bare `d` acts here, asked before the key is taken. */
export function jumpsToFileOnRow(deps: Deps): boolean {
  return fileOnRow(deps) !== null && deps.onJumpToFile !== undefined
}

function fileOnRow(deps: Deps): string | null {
  const panel = deps.getPanel()
  if (!panel || panel.getActiveSection() !== 'files') return null
  return panel.getSelectedFile()?.filename ?? null
}

export function scrollTop(deps: Deps): void {
  deps.getPanel()?.getScrollBox().scrollTo(0)
}

export function scrollBottom(deps: Deps): void {
  const panel = deps.getPanel()
  if (panel) panel.getScrollBox().scrollTo(panel.getScrollBox().scrollHeight)
}

/**
 * `/` narrows the panel's rows (spec 065), the key the tree uses for the
 * same thing.
 */
export function startFilter(deps: Deps): void {
  deps.prInfoFilter.start()
  deps.render()
}

export function closeFilter(deps: Deps): void {
  deps.prInfoFilter.clear()
  deps.render()
}

export function commitFilter(deps: Deps): void {
  deps.prInfoFilter.commit()
  deps.render()
}

export function react(deps: Deps): void {
  deps.onReact?.()
}

export function toggleHelp(deps: Deps): void {
  deps.onToggleHelp?.()
}

/** The app's own action behind a `g` chord, which the panel's standalone `r`/`o`/`y` would otherwise shadow. */
export function runAction(deps: Deps, id: "refresh" | "open-in-browser" | "copy-pr-url" | "open-in-board"): void {
  deps.executeAction?.(id)
}

/** `gx`/`gX`: the links in the view — a rendered body has no column to put a cursor on (spec 077). */
export function openLinks(deps: Deps, action: "open" | "copy"): void {
  deps.onOpenLinks?.(action)
}

/**
 * Mirrors whatever the panel is focused on into state.reactionTarget, so
 * Ctrl+p → React… targets the visually-focused item (spec 042).
 */
export function syncReactionTarget(deps: Deps): void {
  const panel = deps.getPanel()
  const target = panel?.getReactionTarget?.() ?? null
  // setReactionTarget is identity-checked — it no-ops when the target
  // is the same, so we don't thrash renders on e.g. repeated `j`s that
  // land on the same item class.
  deps.setState(s => setReactionTarget(s, target))
}
