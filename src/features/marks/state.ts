/**
 * Global marks' state (spec 101): the marks set in this review, and the two
 * last visited for `''`. The feature owns it rather than AppState, which
 * sheds one slice per feature this way (spec 100, M6; ADR-003). It knows
 * nothing of marks.json: the callers that change the list save it.
 */

import { batch, createSignal } from "solid-js"
import { deleteMark, setMark, visitMark } from "./store"
import type { Mark, MarksState } from "./types"

export type GlobalMarksState = ReturnType<typeof createMarksState>

export function createMarksState() {
  const [marks, setMarks] = createSignal<readonly Mark[]>([])
  const [current, setCurrent] = createSignal<string | null>(null)
  const [previous, setPrevious] = createSignal<string | null>(null)

  const snapshot = (): MarksState => ({ marks: marks(), current: current(), previous: previous() })

  const adopt = (next: MarksState) => {
    batch(() => {
      setMarks(next.marks)
      setCurrent(next.current)
      setPrevious(next.previous)
    })
  }

  return {
    marks,
    current,
    previous,
    /** For the pure readers in store.ts and list.ts, which take a MarksState. */
    snapshot,
    set(mark: Mark) {
      adopt(setMark(snapshot(), mark))
    },
    /** Also forgets the letter as current or previous, so `''` cannot go to it. */
    remove(letter: string) {
      adopt(deleteMark(snapshot(), letter))
    },
    visit(letter: string) {
      adopt(visitMark(snapshot(), letter))
    },
    /** The same marks, followed to where their lines moved: current and previous stay. */
    replace(next: readonly Mark[]) {
      setMarks(next)
    },
    /** Another review's marks: what was visited in this one means nothing there. */
    reset(next: readonly Mark[]) {
      adopt({ marks: next, current: null, previous: null })
    },
  }
}
