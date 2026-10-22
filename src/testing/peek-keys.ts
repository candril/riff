import type { BlamePeekState } from "../features/blame/peek-state"
import { registerBlamePeekKeys } from "../features/blame/peek-keys"
import { registerLinePeekKeys } from "../features/line-peek/keys"
import { pendingMarkChordGivesWay } from "../features/marks"
import { createInitialState, type AppState } from "../state"
import { createLinePeekState } from "../features/line-peek/state"
import { createCursorState } from "../vim-diff/cursor-state"
import type { VimCursorState } from "../vim-diff/types"
import { keymapHarness } from "./keymap-keys"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"

export const BLAME_PEEK: BlamePeekState = { target: { path: "a.ts", side: "head", line: 1 }, request: 1, status: "loading" }

/** riff on the diff, local, with `patch` on top. */
export function peekState(patch: Partial<AppState> = {}): AppState {
  return { ...createInitialState([], [], "test", ""), ...patch }
}

/**
 * Both peeks' layers on a real keymap in front of a recording leftover,
 * the blame peek's hand-offs in `calls`. `chord` simulates a pending chord
 * for the layers under test only: composeKeys' chordPending does not count
 * it. The dispatch entry settles it the way the mark layer does outside
 * the diff. Call it inside a test.
 */
export async function peekKeys(initial: AppState, options: { height?: number } = {}) {
  let state = initial
  let vim: VimCursorState = createCursorState()
  let chord: string | null = null
  const harness = await keymapHarness({
    settle: (key) => {
      if (pendingMarkChordGivesWay(chord, key, false)) chord = null
    },
  })
  const calls: string[] = []
  const linePeek = createLinePeekState()
  const peek = {
    getState: () => state,
    getVimState: () => vim,
    searchActive: () => false,
    filePicker: createFilePickerState(),
    commentsPicker: createCommentsPickerState(),
    occurrencePicker: createOccurrencePickerState(),
    marksPicker: createMarksPickerState(),
    commitPicker: createCommitPickerState(),
    actionMenu: createActionMenuState(),
    chordPending: () => chord !== null,
  }
  registerLinePeekKeys(harness.riffKeymap, {
    ...peek,
    linePeek,
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
    linePeek,
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
