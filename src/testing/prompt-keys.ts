import type { KeyEvent } from "@opentui/core"
import { registerTreeFilterKeys } from "../features/file-tree/filter-keys"
import { registerSearchKeys } from "../features/search"
import { pendingMarkChordGivesWay } from "../features/marks"
import { createInitialState, type AppState } from "../state"
import { createSearchState } from "../vim-diff/search-state"
import { keymapHarness } from "./keymap-keys"

/** riff on the diff, local, with `patch` on top. */
export function diffState(patch: Partial<AppState> = {}): AppState {
  return { ...createInitialState([], [], "test", ""), ...patch }
}

/**
 * The search prompt's and the tree filter's layers on a real keymap in
 * front of a recording chain, every hand-off to the app in `calls`. The
 * chain's pending chord is `chord`, which it settles the way it does
 * outside the diff. Call it inside a test.
 */
export async function promptKeys(initial: AppState) {
  let state = initial
  let search = createSearchState()
  let chord: string | null = null
  const harness = await keymapHarness({ chordPending: () => chord !== null })
  const calls: string[] = []
  const settleChainChord = (key: KeyEvent) => {
    if (pendingMarkChordGivesWay(chord, key, false)) chord = null
  }
  registerTreeFilterKeys(harness.riffKeymap, {
    getState: () => state,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    updatePanel: () => void calls.push("updatePanel"),
    settleChainChord,
  })
  registerSearchKeys(harness.riffKeymap, {
    searchState: () => search,
    searchHandler: () => ({
      cancelSearch: () => void calls.push("cancelSearch"),
      confirmSearch: () => void calls.push("confirmSearch"),
    }),
    settleChainChord,
  })
  return {
    ...harness,
    calls,
    state: () => state,
    setSearchActive: (active: boolean) => {
      search = { ...search, active }
    },
    chord: () => chord,
    setChord: (next: string | null) => {
      chord = next
    },
  }
}
