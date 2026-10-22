/**
 * Occurrence picker keys (spec 088). Ctrl-g switches the prompt between the
 * search and the narrowing filter (spec 099).
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { DiffFile } from "../../utils/diff-parser"
import { getOccurrenceResults, type OccurrenceHit } from "./filter"
import type { OccurrencePickerState } from "./state"

export interface OccurrencePickerKeyDeps {
  getFiles: () => readonly DiffFile[]
  /** The occurrence picker's state, the same instance the frame pass reads. */
  occurrencePicker: OccurrencePickerState
  render: () => void
  onSelectHit: (hit: OccurrenceHit) => void
}

export function registerOccurrencePickerKeys(riffKeymap: RiffKeymap, deps: OccurrencePickerKeyDeps): () => void {
  const { occurrencePicker } = deps
  const results = () => getOccurrenceResults(deps.getFiles(), occurrencePicker.query(), occurrencePicker.filter())
  return registerQueryPickerKeys(riffKeymap, {
    name: "occurrencePicker",
    category: "Occurrence picker",
    active: () => occurrencePicker.open(),
    close: () => {
      occurrencePicker.close()
      deps.render()
    },
    pick: () => {
      const hit = results().hits[occurrencePicker.selectedIndex()]
      if (!hit) return
      occurrencePicker.close()
      deps.onSelectHit(hit)
    },
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = Math.max(0, results().hits.length - 1)
      occurrencePicker.move(delta, maxIndex)
      deps.render()
    },
    extra: [
      {
        key: "ctrl+g",
        name: "narrow",
        title: "Switch the prompt between the search and the filter",
        run: () => {
          occurrencePicker.toggleNarrowing()
          deps.render()
        },
      },
    ],
  })
}
