/**
 * The comments picker's state (spec 044). The feature owns it rather than
 * AppState, which sheds one slice per feature this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export interface CommentsPickerSnapshot {
  query: string
  selectedIndex: number
}

export type CommentsPickerState = ReturnType<typeof createCommentsPickerState>

export function createCommentsPickerState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  return {
    open,
    query,
    selectedIndex,
    snapshot(): CommentsPickerSnapshot {
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
