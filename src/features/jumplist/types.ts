import type { ViewMode } from "../../state"
import type { LineAnchor } from "../marks/types"

export interface Jump {
  fileIndex: number | null
  filename: string | null
  viewingCommit: string | null
  viewMode: ViewMode
  /**
   * Where the cursor stood, as a mark keeps it (spec 101): folds, wrap,
   * split and a refresh renumber the mapping's lines but leave this where
   * it was. Null off the diff, where a row has no file.
   */
  anchor: LineAnchor | null
  /** The mapping line, which an entry without an anchor comes back to. */
  cursorLine: number
  /** The column too: a jump that lands in column one is not where you were. */
  cursorCol?: number
}

export interface JumpListState {
  entries: Jump[]
  /** `entries.length` after a jump: one past the newest entry, on none of them. */
  index: number
}

export function createJumpListState(): JumpListState {
  return { entries: [], index: 0 }
}
