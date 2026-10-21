/**
 * Occurrence picker keys (spec 088). Ctrl-g switches the prompt between the
 * search and the narrowing filter (spec 099).
 */

import type { RiffKeymap } from "../../app/keymap"
import { registerQueryPickerKeys } from "../../app/query-picker-keys"
import type { AppState } from "../../state"
import {
  closeOccurrencePicker,
  moveOccurrencePickerSelection,
  toggleOccurrencePickerNarrowing,
} from "../../state"
import { getOccurrenceResults, type OccurrenceHit } from "./filter"

export interface OccurrencePickerKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  onSelectHit: (hit: OccurrenceHit) => void
}

export function registerOccurrencePickerKeys(riffKeymap: RiffKeymap, deps: OccurrencePickerKeyDeps): () => void {
  return registerQueryPickerKeys(riffKeymap, {
    name: "occurrencePicker",
    category: "Occurrence picker",
    active: () => deps.getState().occurrencePicker.open,
    close: () => {
      deps.setState(closeOccurrencePicker)
      deps.render()
    },
    pick: () => {
      const state = deps.getState()
      const hit = getOccurrenceResults(state).hits[state.occurrencePicker.selectedIndex]
      if (!hit) return
      deps.setState(closeOccurrencePicker)
      deps.onSelectHit(hit)
    },
    move: (delta) => {
      // Read at run time, so the bound is the list on screen.
      const maxIndex = Math.max(0, getOccurrenceResults(deps.getState()).hits.length - 1)
      deps.setState((s) => moveOccurrencePickerSelection(s, delta, maxIndex))
      deps.render()
    },
    extra: [
      {
        key: "ctrl+g",
        name: "narrow",
        title: "Switch the prompt between the search and the filter",
        run: () => {
          deps.setState(toggleOccurrencePickerNarrowing)
          deps.render()
        },
      },
    ],
  })
}
