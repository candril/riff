/**
 * Commit picker keys (spec 078). `/` is a mode: while it is open every key
 * is the query's, bar the two that close it. A list of forty commits is
 * read, not searched, so the letters belong to the list the rest of the time.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
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
import { getFilteredCommits, markedCommits } from "./filter"

export interface CommitPickerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  /**
   * sha is null for "all commits", otherwise the newest commit in scope;
   * `scope` lists every commit in it when more than one was marked.
   */
  onCommitSelected: (sha: string | null, filename?: string, scope?: readonly string[] | null) => void
}

export function registerCommitPickerKeys(riffKeymap: RiffKeymap, deps: CommitPickerKeyDeps): () => void {
  const picker = () => deps.getState().commitPicker
  const update = (updater: (s: AppState) => AppState) => {
    deps.setState(updater)
    deps.render()
  }
  // Row 0 is "All commits", so the commit under the cursor is one row up the filtered list.
  const highlighted = () => {
    const state = deps.getState()
    return getFilteredCommits(state)[state.commitPicker.selectedIndex - 1]
  }

  /** Move, and drag the run along when `V` is extending one. */
  const move = (delta: number) => {
    const maxIndex = getFilteredCommits(deps.getState()).length
    update((s) => {
      const moved = moveCommitPickerSelection(s, delta, maxIndex)
      return moved.commitPicker.rangeAnchor ? markCommitRange(moved, rangeShas(moved, getFilteredCommits(moved))) : moved
    })
  }

  const select = () => {
    if (picker().selectedIndex === 0) {
      deps.setState(closeCommitPicker)
      deps.onCommitSelected(null)
      deps.render()
      return
    }
    const row = highlighted()
    if (!row) return
    // What is marked, or the row under the cursor when nothing is.
    const marked = markedCommits(deps.getState())
    const scope = marked.length > 0 ? marked : [row.commit.sha]
    deps.setState(closeCommitPicker)
    deps.onCommitSelected(scope[0]!, undefined, scope)
    deps.render()
  }

  const command = (name: string, title: string, run: () => void) => ({
    name: `commitPicker.${name}`,
    title,
    category: "Commit picker",
    palette: false,
    // Wrapped so no return value gets through: the keymap reads a `false`
    // as unhandled, and the chain these replaced prevented every key it acted on.
    run: () => {
      run()
    },
  })

  // The query belongs to the prompt field, which types every key left
  // unprevented (spec 065); outside `/` no field is open and the picker
  // owns the keyboard, so nothing it leaves falls through to the diff.
  const captured = riffKeymap.capture(() => picker().open, (key) => {
    if (!picker().queryInput) key.preventDefault()
  })

  const unregisterFilter = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && picker().queryInput,
    commands: [
      command("filterCancel", "Drop the query", () => update((s) => endCommitPickerFilter(s, false))),
      command("filterKeep", "Keep the query", () => update((s) => endCommitPickerFilter(s, true))),
    ],
    bindings: [
      ...anyModifiers("escape", "commitPicker.filterCancel"),
      ...anyModifiers("return", "commitPicker.filterKeep"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, and the chain took both.
      ...anyModifiers("enter", "commitPicker.filterKeep"),
    ],
  })

  const unregisterList = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds() && !picker().queryInput,
    commands: [
      command("close", "Close the picker", () => update(closeCommitPicker)),
      command("select", "Show the selected commits", select),
      command("up", "Select the previous commit", () => move(-1)),
      command("down", "Select the next commit", () => move(1)),
      command("mark", "Mark the selected commit", () => {
        const row = highlighted()
        if (row) update((s) => toggleCommitMark(s, row.commit.sha))
      }),
      command("filter", "Search the commits", () => update(startCommitPickerFilter)),
      // `V` extends a run from here; `V` again keeps it and lets j/k move without changing it.
      command("range", "Mark a run of commits", () => {
        const row = highlighted()
        if (row) update((s) => toggleCommitRange(s, row.commit.sha))
      }),
    ],
    bindings: [
      ...anyModifiers("escape", "commitPicker.close"),
      ...anyModifiers("return", "commitPicker.select"),
      ...anyModifiers("enter", "commitPicker.select"),
      ...anyModifiers("j", "commitPicker.down"),
      ...anyModifiers("down", "commitPicker.down"),
      ...anyModifiers("ctrl+n", "commitPicker.down"),
      ...anyModifiers("k", "commitPicker.up"),
      ...anyModifiers("up", "commitPicker.up"),
      ...anyModifiers("ctrl+p", "commitPicker.up"),
      ...anyModifiers("space", "commitPicker.mark"),
      ...anyModifiers("/", "commitPicker.filter"),
      ...anyModifiers("shift+v", "commitPicker.range"),
    ],
  })
  return () => {
    captured()
    unregisterList()
    unregisterFilter()
  }
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
