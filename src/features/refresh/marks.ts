import type { AppState } from "../../state"
import { followMarks } from "../marks/follow"
import type { GlobalMarksState } from "../marks/state"
import type { Mark } from "../marks/types"

export interface FollowMarksContext {
  getState: () => AppState
  marks: Pick<GlobalMarksState, "marks" | "replace">
  saveMarks: (marks: readonly Mark[]) => void
}

/**
 * Moves the marks onto the lines their text went to in the diff just
 * loaded. Commits pushed since a mark was set shift its file under it, and
 * a mark left on its old number would name different code. Saved only when
 * one moved, so an unchanged reload writes nothing.
 */
export function followReloadedMarks(ctx: FollowMarksContext, head: string | undefined): void {
  const { marks, moved } = followMarks(ctx.marks.marks(), ctx.getState().allFiles, head)
  if (!moved) return
  ctx.marks.replace(marks)
  ctx.saveMarks(marks)
}
