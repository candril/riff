/**
 * Commit picker input handling.
 *
 * The commit picker captures all input when open. It provides fuzzy search
 * over commits and triggers commit selection on Enter.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { FilteredCommit } from "../../components/CommitPicker"
import {
  closeCommitPicker,
  moveCommitPickerSelection,
  toggleCommitPickerAnchor,
} from "../../state"
import { fuzzyFilter } from "../../utils/fuzzy"

export interface CommitPickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /**
   * Called when a commit is selected (or "all commits").
   * sha is null for "all commits", otherwise the newest commit in scope;
   * `from` names the oldest when a span was marked (spec 078).
   */
  onCommitSelected: (sha: string | null, filename?: string, from?: string | null) => void
}

/**
 * Build the list of filtered commits for the picker.
 */
export function getFilteredCommits(state: AppState): FilteredCommit[] {
  const allCommits: FilteredCommit[] = state.commits.map((commit, index) => ({
    commit,
    index,
  }))

  return state.commitPicker.query
    ? fuzzyFilter(state.commitPicker.query, allCommits, (f) => [f.commit.message, f.commit.sha, f.commit.author])
    : allCommits
}

/**
 * The span the picker has marked, in list positions: the anchored row and
 * the highlighted one. Null when nothing is anchored, or when the anchor is
 * a row the query has filtered away (spec 078).
 */
function spanBounds(
  state: AppState,
  filtered: FilteredCommit[],
): { from: number; to: number } | null {
  const anchor = state.commitPicker.anchorSha
  if (!anchor) return null

  const anchorRow = filtered.find((row) => row.commit.sha === anchor)
  const cursorRow = filtered[state.commitPicker.selectedIndex - 1]
  if (!anchorRow || !cursorRow) return null

  return {
    from: Math.min(anchorRow.index, cursorRow.index),
    to: Math.max(anchorRow.index, cursorRow.index),
  }
}

/**
 * The two ends of the marked span, oldest named separately — `state.commits`
 * is newest-first, so the older end is the higher index. Null when the span
 * is one commit, which is what `Enter` alone already does.
 */
export function markedSpan(
  state: AppState,
  filtered: FilteredCommit[],
): { oldest: string; newest: string } | null {
  const bounds = spanBounds(state, filtered)
  if (!bounds || bounds.from === bounds.to) return null

  const oldest = state.commits[bounds.to]
  const newest = state.commits[bounds.from]
  return oldest && newest ? { oldest: oldest.sha, newest: newest.sha } : null
}

/** Whether a row falls inside the span being marked, for the picker's bar. */
export function inMarkedSpan(state: AppState, filtered: FilteredCommit[], index: number): boolean {
  const bounds = spanBounds(state, filtered)
  const row = filtered[index]
  return bounds !== null && row !== undefined && row.index >= bounds.from && row.index <= bounds.to
}

/**
 * Handle input when commit picker is open.
 *
 * The query belongs to the shared prompt field, which sees every key this
 * handler does not `preventDefault` (spec 065).
 *
 * Returns true if the key was handled (picker is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: CommitPickerInputContext
): boolean {
  if (!ctx.state.commitPicker.open) {
    return false
  }

  const filteredCommits = getFilteredCommits(ctx.state)
  // Total items: 1 ("All commits") + filtered commits
  const maxIndex = filteredCommits.length  // 0 = All commits, 1..N = commits

  const consume = (): void => key.preventDefault()

  switch (key.name) {
    case "escape":
      consume()
      ctx.setState(closeCommitPicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      consume()
      const selectedIndex = ctx.state.commitPicker.selectedIndex

      if (selectedIndex === 0) {
        // "All commits" selected
        ctx.setState(closeCommitPicker)
        ctx.onCommitSelected(null)
        ctx.render()
      } else {
        const selectedCommit = filteredCommits[selectedIndex - 1]
        if (selectedCommit) {
          // The span runs from the anchor to the cursor; which of the two is
          // the older end is the list's business, not the reader's.
          const span = markedSpan(ctx.state, filteredCommits)
          ctx.setState(closeCommitPicker)
          ctx.onCommitSelected(
            span ? span.newest : selectedCommit.commit.sha,
            undefined,
            span?.oldest
          )
          ctx.render()
        }
      }
      return true
    }

    case "v": {
      // Ctrl-v, not a bare `v`: every letter here belongs to the query.
      // Only on a commit row — "all commits" is not one end of anything.
      if (!key.ctrl) return true
      const highlighted = filteredCommits[ctx.state.commitPicker.selectedIndex - 1]
      if (!highlighted) return true
      consume()
      ctx.setState((s) => toggleCommitPickerAnchor(s, highlighted.commit.sha))
      ctx.render()
      return true
    }

    case "up":
      consume()
      ctx.setState((s) => moveCommitPickerSelection(s, -1, maxIndex))
      ctx.render()
      return true

    case "down":
      consume()
      ctx.setState((s) => moveCommitPickerSelection(s, 1, maxIndex))
      ctx.render()
      return true

    case "p":
      // Ctrl-p moves up; a bare `p` is a letter of the query.
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveCommitPickerSelection(s, -1, maxIndex))
        ctx.render()
      }
      return true

    case "n":
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveCommitPickerSelection(s, 1, maxIndex))
        ctx.render()
      }
      return true

    default:
      // Everything else is typing, and belongs to the prompt field.
      return true
  }
}
