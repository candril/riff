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
  endCommitPickerFilter,
  markCommitRange,
  moveCommitPickerSelection,
  startCommitPickerFilter,
  toggleCommitMark,
  toggleCommitRange,
} from "../../state"
import { fuzzyFilter } from "../../utils/fuzzy"

export interface CommitPickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /**
   * Called when a commit is selected (or "all commits").
   * sha is null for "all commits", otherwise the newest commit in scope;
   * `scope` lists every commit in it when more than one was marked.
   */
  onCommitSelected: (sha: string | null, filename?: string, scope?: readonly string[] | null) => void
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

/** The commits marked for the next scope, newest first (spec 078). */
export function markedCommits(state: AppState): string[] {
  return state.commits.filter((commit) => state.commitPicker.marked.has(commit.sha)).map((c) => c.sha)
}

/** The rows between the anchor `V` set and the cursor, inclusive. */
function rangeShas(state: AppState, filtered: FilteredCommit[]): string[] {
  const anchor = state.commitPicker.rangeAnchor
  if (!anchor) return []

  const anchorRow = filtered.find((row) => row.commit.sha === anchor)
  const cursorRow = filtered[state.commitPicker.selectedIndex - 1]
  if (!anchorRow || !cursorRow) return []

  const from = Math.min(anchorRow.index, cursorRow.index)
  const to = Math.max(anchorRow.index, cursorRow.index)
  return state.commits.slice(from, to + 1).map((commit) => commit.sha)
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
  const picker = ctx.state.commitPicker
  const highlighted = filteredCommits[picker.selectedIndex - 1]

  const consume = (): void => key.preventDefault()

  // `/` is a mode: while it is open every key is the query's, bar the two
  // that close it. A list of forty commits is read, not searched, so the
  // letters belong to the list the rest of the time (spec 078).
  if (picker.queryInput) {
    if (key.name === "escape") {
      consume()
      ctx.setState((s) => endCommitPickerFilter(s, false))
      ctx.render()
    } else if (key.name === "return" || key.name === "enter") {
      consume()
      ctx.setState((s) => endCommitPickerFilter(s, true))
      ctx.render()
    }
    return true
  }

  /** Move, and drag the run along when `V` is extending one. */
  const move = (delta: number): void => {
    ctx.setState((s) => {
      const moved = moveCommitPickerSelection(s, delta, maxIndex)
      return moved.commitPicker.rangeAnchor
        ? markCommitRange(moved, rangeShas(moved, getFilteredCommits(moved)))
        : moved
    })
    ctx.render()
  }

  if (key.name === "/" || key.sequence === "/") {
    consume()
    ctx.setState(startCommitPickerFilter)
    ctx.render()
    return true
  }

  if (key.name === "space" || key.sequence === " ") {
    consume()
    if (highlighted) {
      ctx.setState((s) => toggleCommitMark(s, highlighted.commit.sha))
      ctx.render()
    }
    return true
  }

  switch (key.name) {
    case "escape":
      consume()
      ctx.setState(closeCommitPicker)
      ctx.render()
      return true

    case "return":
    case "enter": {
      consume()
      if (picker.selectedIndex === 0) {
        // "All commits" selected
        ctx.setState(closeCommitPicker)
        ctx.onCommitSelected(null)
        ctx.render()
        return true
      }
      if (!highlighted) return true

      // What is marked, or the row under the cursor when nothing is.
      const marked = markedCommits(ctx.state)
      const scope = marked.length > 0 ? marked : [highlighted.commit.sha]
      ctx.setState(closeCommitPicker)
      ctx.onCommitSelected(scope[0]!, undefined, scope)
      ctx.render()
      return true
    }

    case "v":
      // `V` extends a run from here; `V` again keeps it and lets j/k move
      // without changing it.
      if (!key.shift || !highlighted) return true
      consume()
      ctx.setState((s) => toggleCommitRange(s, highlighted.commit.sha))
      ctx.render()
      return true

    case "j":
    case "down":
      consume()
      move(1)
      return true

    case "k":
    case "up":
      consume()
      move(-1)
      return true

    case "p":
      if (key.ctrl) {
        consume()
        move(-1)
      }
      return true

    case "n":
      if (key.ctrl) {
        consume()
        move(1)
      }
      return true

    default:
      // The picker owns its keys; nothing here falls through to the diff.
      consume()
      return true
  }
}
