import type { KeyEvent } from "@opentui/core"
import type { BlamePeekState } from "../features/blame/peek-state"
import { registerBlamePeekKeys } from "../features/blame/peek-keys"
import { registerLinePeekKeys } from "../features/line-peek/keys"
import { pendingMarkChordGivesWay } from "../features/marks"
import { createInitialState, type AppState } from "../state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { VimCursorState } from "../vim-diff/types"
import { keymapHarness } from "./keymap-keys"

export const BLAME_PEEK: BlamePeekState = { target: { path: "a.ts", side: "head", line: 1 }, request: 1, status: "loading" }

/** riff on the diff, local, with `patch` on top. */
export function peekState(patch: Partial<AppState> = {}): AppState {
  return { ...createInitialState([], [], "test", ""), ...patch }
}

/**
 * Both peeks' layers on a real keymap in front of a recording chain, the
 * blame peek's hand-offs in `calls`. The chain's pending chord is `chord`,
 * which it settles the way it does outside the diff. Call it inside a test.
 */
export async function peekKeys(initial: AppState, options: { height?: number } = {}) {
  let state = initial
  let vim: VimCursorState = createCursorState()
  let chord: string | null = null
  const harness = await keymapHarness({ chordPending: () => chord !== null })
  const calls: string[] = []
  const givesWay = (key: KeyEvent) => pendingMarkChordGivesWay(chord, key, false)
  const settleChainChord = (key: KeyEvent) => {
    if (givesWay(key)) chord = null
  }
  const peek = {
    getState: () => state,
    getVimState: () => vim,
    searchActive: () => false,
    chainChordPending: (key: KeyEvent) => chord !== null && !givesWay(key),
    settleChainChord,
  }
  registerLinePeekKeys(harness.riffKeymap, {
    ...peek,
    setState: (update) => {
      state = update(state)
    },
    render() {},
    height: () => options.height ?? 40,
  })
  registerBlamePeekKeys(harness.riffKeymap, {
    ...peek,
    blame: { close: () => void calls.push("close"), copySha: () => void calls.push("copySha") },
  })
  return {
    ...harness,
    calls,
    state: () => state,
    setVim: (patch: Partial<VimCursorState>) => {
      vim = { ...vim, ...patch }
    },
    chord: () => chord,
    setChord: (next: string | null) => {
      chord = next
    },
  }
}
