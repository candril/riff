/**
 * The jumplist's state (spec 038), the list Ctrl-o and Ctrl-i walk. The
 * feature owns it rather than AppState, which sheds one slice per feature
 * this way (spec 100, M6; ADR-003).
 */

import { createSignal } from "solid-js"
import { emptyJumpList, type Jump, type JumpList } from "./types"
import { pushJump, stepBack, stepForward, type Reach } from "./walk"

export type JumpListState = ReturnType<typeof createJumpListState>

export function createJumpListState() {
  const [list, setList] = createSignal<JumpList>(emptyJumpList())

  return {
    list,
    push(jump: Jump) {
      setList((current) => pushJump(current, jump))
    },
    back(reach: Reach, here: () => Jump): Jump | null {
      const step = stepBack(list(), reach, here)
      if (!step) return null
      setList(step.list)
      return step.jump
    },
    forward(reach: Reach): Jump | null {
      const step = stepForward(list(), reach)
      if (!step) return null
      setList(step.list)
      return step.jump
    },
    clear() {
      setList(emptyJumpList())
    },
  }
}
