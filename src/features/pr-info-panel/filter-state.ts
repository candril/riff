/**
 * The overview's filter (`/` or `Ctrl-f`, spec 065): the text its rows are
 * narrowed to, and whether the prompt for it is open. It is the overview's
 * own sub-modal, not review state, so the feature owns it rather than
 * AppState (spec 100, M6; ADR-003). It lives for one visit to the
 * overview of one PR: a reload leaves it alone, so the rows stay narrowed
 * across `gr`, and entering the overview or switching to another PR clears
 * it.
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
