import type { ViewMode } from "../../state"

export interface Jump {
  fileIndex: number | null
  filename: string | null
  viewingCommit: string | null
  viewMode: ViewMode
  cursorLine: number
}

export interface JumpListState {
  entries: Jump[]
  index: number
}

export function createJumpListState(): JumpListState {
  return { entries: [], index: -1 }
}
