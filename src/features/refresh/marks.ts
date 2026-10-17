import type { AppState } from "../../state"
import { followMarks } from "../marks/follow"
import type { Mark } from "../marks/types"

export interface FollowMarksContext {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  saveMarks: (marks: readonly Mark[]) => void
}

/**
 * Moves the marks onto the lines their text went to in the diff just
 * loaded. Commits pushed since a mark was set shift its file under it, and
 * a mark left on its old number would name different code. Saved only when
 * one moved, so an unchanged reload writes nothing.
 */
export function followReloadedMarks(ctx: FollowMarksContext, head: string | undefined): void {
  const state = ctx.getState()
  const { marks, moved } = followMarks(state.marks.marks, state.allFiles, head)
  if (!moved) return
  ctx.setState((s) => ({ ...s, marks: { ...s.marks, marks } }))
  ctx.saveMarks(marks)
}
