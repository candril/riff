/**
 * Marks picker keys (spec 101). Ctrl-x deletes the selected mark; a bare x
 * is a letter of the query.
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import { marksPickerEntries } from "./list"
import type { MarksPickerState } from "./picker-state"
import type { GlobalMarksState } from "./state"
import type { Mark } from "./types"

export interface MarksPickerKeyDeps {
  getState: () => AppState
  marksPicker: MarksPickerState
  marks: Pick<GlobalMarksState, "marks" | "remove">
  render: () => void
  /** The jump itself, wired by the app, so this module stays clear of the line mapping and the cursor. */
  onJump: (letter: string) => void
  save: (marks: readonly Mark[]) => void
}

export function registerMarksPickerKeys(riffKeymap: RiffKeymap, deps: MarksPickerKeyDeps): () => void {
  // Read at run time, so the row a key acts on is the row on screen.
  const selected = () => {
    const entries = marksPickerEntries({ marks: deps.marks.marks() }, deps.getState().files, deps.marksPicker.query())
    return { entries, entry: entries[deps.marksPicker.selectedIndex()] }
  }

  return registerQueryPickerKeys(riffKeymap, {
    name: "marksPicker",
    category: "Marks picker",
    active: () => deps.marksPicker.open(),
    close: () => {
      deps.marksPicker.close()
      deps.render()
    },
    pick: () => {
      const { entry } = selected()
      deps.marksPicker.close()
      if (entry) deps.onJump(entry.mark.letter)
      else deps.render()
    },
    move: (delta) => {
      const maxIndex = Math.max(0, selected().entries.length - 1)
      deps.marksPicker.move(delta, maxIndex)
      deps.render()
    },
    extra: [
      {
        key: "ctrl+x",
        name: "delete",
        title: "Delete the selected mark",
        run: () => {
          const { entries, entry } = selected()
          if (entry) deleteEntry(entry.mark.letter, entries.length - 2, deps)
        },
      },
    ],
  })
}

/** The filter keeps or drops each mark on its own, so the rows left are the same rows less this one. */
function deleteEntry(letter: string, lastIndex: number, deps: MarksPickerKeyDeps): void {
  deps.marks.remove(letter)
  deps.marksPicker.clampSelection(lastIndex)
  deps.save(deps.marks.marks())
  deps.render()
}
