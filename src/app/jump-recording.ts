import type { KeyEvent } from "@opentui/core"
import type { AppState, PromptPickers } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import * as jumplist from "../features/jumplist"
import { createJumpRecorder, type Moment } from "../features/jumplist/recorder"
import type { JumpListState } from "../features/jumplist/state"
import { interactionSettled } from "./jump-settled"
import { threadPanelHoldsKeys } from "./diff-focus"
import type { DiffOptionsState } from "../features/diff-view/options-state"

export interface JumpRecordingDeps extends PromptPickers {
  getState: () => AppState
  diffOptions: Pick<DiffOptionsState, "splitView">
  jumpList: Pick<JumpListState, "push">
  getVimState: () => VimCursorState
  getLineMapping: () => Pick<DiffLineMapping, "getLine">
  getPane: () => "left" | "right" | null
  searchActive: () => boolean
  flashActive: () => boolean
  chordPending: () => boolean
  /** Brings the cursor's line to the upper half of the diff once everything the interaction drew is drawn. */
  landCursor: () => void
}

export interface JumpRecording {
  around(key: KeyEvent, dispatch: () => void): void
  retake(key: KeyEvent): void
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
 *
 * Where the cursor lands hangs off the same judgement, so every kind of
 * jump, and every one added later, brings its target to where the eye
 * reads next without a reveal of its own.
 */
export function createJumpRecording(deps: JumpRecordingDeps): JumpRecording {
  const recorder = createJumpRecorder()

  const moment = (): Moment => {
    const state = deps.getState()
    const vim = deps.getVimState()
    const mapping = deps.getLineMapping()
    return {
      place: jumplist.capture(state, vim, mapping, { split: deps.diffOptions.splitView(), pane: deps.getPane() }),
      file: jumplist.cursorFile(mapping, vim.line),
      settled: interactionSettled({
        state,
        filePicker: deps.filePicker,
        commentsPicker: deps.commentsPicker,
        marksPicker: deps.marksPicker,
        commitPicker: deps.commitPicker,
        actionMenu: deps.actionMenu,
        activityFeed: deps.activityFeed,
        prInfoFilter: deps.prInfoFilter,
        occurrencePicker: deps.occurrencePicker,
        vim,
        searchActive: deps.searchActive(),
        flashActive: deps.flashActive(),
        chordPending: deps.chordPending(),
      }),
      stepsMoveTheDiff: threadPanelHoldsKeys(state),
    }
  }

  return {
    around(key, dispatch) {
      const { push, landed } = recorder.around(key, moment(), dispatch, moment)
      if (push) deps.jumpList.push(push)
      if (landed) deps.landCursor()
    },
    retake: (key) => recorder.retake(key),
  }
}
