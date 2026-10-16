import type { LineSpans } from "../diff-rows/line-spans"
import type { CommentSign } from "../diff-rows/signs"
import type { VisualRows } from "../diff-rows/visual-rows"
import type { Comment, FileReviewStatus } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { WordSpan } from "../vim-diff/word-diff"
import type { RowEnv } from "./env"
import type { SplitSelection } from "./overlays"

export interface UnifiedDiffViewProps {
  mapping: DiffLineMapping
  files: readonly DiffFile[]
  lineSpans: LineSpans
  /** Bumped when a parse lands; LineSpans answers from a cache Solid cannot see into. */
  highlightVersion: number
  comments: readonly Comment[]
  fileStatuses: ReadonlyMap<string, FileReviewStatus>
  expandingDivider: string | null
  /** `line` indexes the mapping's lines. */
  cursor: { line: number }
  /** In visual rows, so a wrapped line can be cut off at the top. */
  scrollTop: number
  /** One sideways offset for every line, in cells; ignored while wrapped. */
  column: number
  wrap: boolean
  /** The diff pane's alone. */
  width: number
  height: number
  focused: boolean
  /** Rows are the mapping's lines. */
  selection: SplitSelection | null
}

/** What every unified row reads, worked out once per view rather than once per row. */
export interface UnifiedEnv extends RowEnv {
  props: UnifiedDiffViewProps
  signs: () => ReadonlyMap<number, CommentSign>
  words: () => ReadonlyMap<number, readonly WordSpan[]>
  visual: () => VisualRows
}
