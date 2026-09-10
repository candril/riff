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
} from "../../state"
import { fuzzyFilter } from "../../utils/fuzzy"

export interface CommitPickerInputContext {
  readonly state: AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /**
   * Called when a commit is selected (or "all commits").
   * sha is null for "all commits", otherwise the commit SHA.
   */
  onCommitSelected: (sha: string | null) => void
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
          ctx.setState(closeCommitPicker)
          ctx.onCommitSelected(selectedCommit.commit.sha)
          ctx.render()
        }
      }
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
