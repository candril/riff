import type { ViewMode } from "../../state"

export interface Jump {
  fileIndex: number | null
  filename: string | null
  viewingCommit: string | null
  viewMode: ViewMode
  cursorLine: number
  /** The column too: a jump that lands in column one is not where you were. */
  cursorCol?: number
}

export interface JumpListState {
  entries: Jump[]
  index: number
}

export function createJumpListState(): JumpListState {
  return { entries: [], index: -1 }
}
