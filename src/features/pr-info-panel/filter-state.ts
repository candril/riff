/**
 * The overview's filter (`/` or `Ctrl-f`, spec 065): the text its rows are
 * narrowed to, and whether the prompt for it is open. It is the overview's
 * own sub-modal, not review state, so the feature owns it rather than
 * AppState (spec 100, M6; ADR-003). Besides the reader's Esc, two paths
 * clear it: handleOpenPRInfoPanel, on entering the overview, and
 * closeFeatureOverlays, on switching to another PR. A reload leaves it
 * alone, so the rows stay narrowed across `gr`.
 */

import { createSignal } from "solid-js"

export type PrInfoFilterState = ReturnType<typeof createPrInfoFilterState>

export function createPrInfoFilterState() {
  const [filter, setFilter] = createSignal("")
  const [filterInput, setFilterInput] = createSignal(false)

  return {
    filter,
    filterInput,
    /** Open the prompt, keeping what the filter already has. */
    start() {
      setFilterInput(true)
    },
    set(value: string) {
      setFilter(value)
    },
    /** Enter: keep what the filter left and hand navigation back. */
    commit() {
      setFilterInput(false)
    },
    /** Escape: drop the filter entirely. */
    clear() {
      setFilter("")
      setFilterInput(false)
    },
  }
}
