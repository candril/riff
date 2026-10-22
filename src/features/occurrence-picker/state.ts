/**
 * The occurrence picker's state (spec 088, narrowing from spec 099). The
 * feature owns it rather than AppState, which sheds one slice per feature
 * this way (spec 100, M6; ADR-003).
 */

import { batch, createSignal } from "solid-js"

export interface OccurrencePickerSnapshot {
  query: string
  /** Narrows the query's hits by path and text (spec 099). */
  filter: string
  /** The prompt edits `filter` rather than `query`. */
  narrowing: boolean
  selectedIndex: number
}

export type OccurrencePickerState = ReturnType<typeof createOccurrencePickerState>

export function createOccurrencePickerState() {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [filter, setFilter] = createSignal("")
  const [narrowing, setNarrowing] = createSignal(false)
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  const reset = (opened: boolean, seed: string) => {
    batch(() => {
      setOpen(opened)
      setQuery(seed)
      setFilter("")
      setNarrowing(false)
      setSelectedIndex(0)
    })
  }

  return {
    open,
    query,
    filter,
    narrowing,
    selectedIndex,
    snapshot(): OccurrencePickerSnapshot {
      return { query: query(), filter: filter(), narrowing: narrowing(), selectedIndex: selectedIndex() }
    },
    show(seed = "") {
      reset(true, seed)
    },
    close() {
      reset(false, "")
    },
    setQuery(next: string) {
      batch(() => {
        setQuery(next)
        setSelectedIndex(0)
      })
    },
    setFilter(next: string) {
      batch(() => {
        setFilter(next)
        setSelectedIndex(0)
      })
    },
    toggleNarrowing() {
      batch(() => setNarrowing(!narrowing()))
    },
    move(delta: number, maxIndex: number) {
      const next = selectedIndex() + delta
      batch(() => setSelectedIndex(next < 0 ? maxIndex : next > maxIndex ? 0 : next))
    },
  }
}
