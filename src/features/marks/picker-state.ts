/**
 * The marks picker's state (spec 101). The feature owns it rather than
 * AppState, which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export interface MarksPickerSnapshot {
  query: string
  selectedIndex: number
}

export type MarksPickerState = ReturnType<typeof createMarksPickerState>

export function createMarksPickerState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const reset = (opened: boolean) => {
    batch(() => {
      setOpen(opened)
      setQuery("")
      setSelectedIndex(0)
    })
  }

  return {
    open,
    query,
    selectedIndex,
    snapshot(): MarksPickerSnapshot {
      return { query: query(), selectedIndex: selectedIndex() }
    },
    show() {
      reset(true)
    },
    close() {
      reset(false)
    },
    setQuery(next: string) {
      batch(() => {
        setQuery(next)
        setSelectedIndex(0)
      })
    },
    /** Stops at either end, unlike the other pickers, which wrap. */
    move(delta: number, maxIndex: number) {
      const next = selectedIndex() + delta
      batch(() => setSelectedIndex(Math.max(0, Math.min(maxIndex, next))))
    },
    /** Keeps the selection on a row after one was deleted under it. */
    clampSelection(lastIndex: number) {
      batch(() => setSelectedIndex(Math.max(0, Math.min(selectedIndex(), lastIndex))))
    },
  }
}
