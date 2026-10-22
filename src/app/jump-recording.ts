import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import * as jumplist from "../features/jumplist"
import { createJumpRecorder, type Moment } from "../features/jumplist/recorder"
import { interactionSettled } from "./jump-settled"

export interface JumpRecordingDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => { getLine(i: number): { filename?: string } | undefined }
  searchActive: () => boolean
  flashActive: () => boolean
  chordPending: () => boolean
}

export interface JumpRecording {
  /** Runs `dispatch` for `key`, and pushes the place it left once the interaction is over. */
  around(key: KeyEvent, dispatch: () => void): void
}

/**
 * Every navigation records where it came from (spec 089).
 *
 * One place rather than a call in front of each navigation: the picker,
 * the tree, flash, thread motion and everything written after this are in
 * the jumplist without opting in, and none of them can forget.
 *
 * What is judged is an interaction, not a key. A search moves the cursor
 * while it is typed, a picker or flash takes letters that would otherwise
 * be steps, and a chord is two keys; judged key by key, each would leave
 * a half-finished place or none. The place before the first key is what
 * gets recorded, once nothing is waiting for more keys.
 */
export function createJumpRecording(deps: JumpRecordingDeps): JumpRecording {
  const recorder = createJumpRecorder()

  const moment = (): Moment => {
    const state = deps.getState()
    const vim = deps.getVimState()
    return {
      place: jumplist.capture(state, vim),
      file: jumplist.cursorFile(deps.getLineMapping(), vim.line),
      settled: interactionSettled({
        state,
        vim,
        searchActive: deps.searchActive(),
        flashActive: deps.flashActive(),
        chordPending: deps.chordPending(),
      }),
    }
  }

  return {
    around(key, dispatch) {
      const jump = recorder.around(key, moment(), dispatch, moment)
      if (jump) deps.setState((s) => jumplist.push(s, jump))
    },
  }
}
