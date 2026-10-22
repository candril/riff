/**
 * The file picker's state. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export interface FilePickerSnapshot {
  query: string
  selectedIndex: number
}

export type FilePickerState = ReturnType<typeof createFilePickerState>

export function createFilePickerState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  return {
    open,
    query,
    selectedIndex,
    snapshot(): FilePickerSnapshot {
      return { query: query(), selectedIndex: selectedIndex() }
    },
    show() {
      batch(() => {
        setOpen(true)
        setQuery("")
        setSelectedIndex(0)
      })
    },
    close() {
      batch(() => {
        setOpen(false)
        setQuery("")
        setSelectedIndex(0)
      })
    },
    setQuery(next: string) {
      batch(() => {
        setQuery(next)
        setSelectedIndex(0)
      })
    },
    move(delta: number, maxIndex: number) {
      const next = selectedIndex() + delta
      batch(() => setSelectedIndex(next < 0 ? maxIndex : next > maxIndex ? 0 : next))
    },
  }
}
