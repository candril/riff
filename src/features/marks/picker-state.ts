import type { AppState } from "../../state"
import { markEntries, filterMarkEntries, type MarkEntry } from "./list"

export function openMarksPicker(state: AppState): AppState {
  return { ...state, marksPicker: { open: true, query: "", selectedIndex: 0 } }
}

export function closeMarksPicker(state: AppState): AppState {
  return { ...state, marksPicker: { open: false, query: "", selectedIndex: 0 } }
}

export function setMarksPickerQuery(state: AppState, query: string): AppState {
  return { ...state, marksPicker: { ...state.marksPicker, query, selectedIndex: 0 } }
}

export function moveMarksPickerSelection(state: AppState, delta: number, maxIndex: number): AppState {
  const selectedIndex = Math.max(0, Math.min(maxIndex, state.marksPicker.selectedIndex + delta))
  return { ...state, marksPicker: { ...state.marksPicker, selectedIndex } }
}

export function marksPickerEntries(state: AppState): MarkEntry[] {
  return filterMarkEntries(markEntries(state.marks, state.files), state.marksPicker.query)
}
