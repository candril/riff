import type { LineSpans } from "../diff-rows/line-spans"
import type { RowLineSource } from "../diff-rows/row-source"
import type { Side } from "../diff-rows/rows"
import type { CommentSign } from "../diff-rows/signs"
import type { Comment, FileReviewStatus } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { WordSpan } from "../vim-diff/word-diff"
import type { SearchHit, SplitSearch, SplitSelection } from "./overlays"

export interface SplitDiffViewProps {
  mapping: DiffLineMapping
  source: RowLineSource
  files: readonly DiffFile[]
  lineSpans: LineSpans
  /** Bumped when a parse lands; LineSpans answers from a cache Solid cannot see into. */
  highlightVersion: number
  comments: readonly Comment[]
  fileStatuses: ReadonlyMap<string, FileReviewStatus>
  expandingDivider: string | null
  /** `row` indexes the source's rows; `col` is a column of the active side's line. */
  cursor: { row: number; col: number }
  side: Side
  scrollTop: number
  columns: { left: number; right: number }
  width: number
  height: number
  focused: boolean
  selection: SplitSelection | null
  /** Null when nothing matches. */
  search: SplitSearch | null
  /** Null unless flash is active; its backdrop dims every row, matches or not. */
  flash: readonly FlashMatch[] | null
}

/** What every row reads, worked out once per view rather than once per row. */
export interface SplitEnv {
  props: SplitDiffViewProps
  gutter: () => number
  panes: () => { left: number; right: number }
  signs: () => ReadonlyMap<number, CommentSign>
  words: () => ReadonlyMap<number, readonly WordSpan[]>
  files: () => ReadonlyMap<string, DiffFile>
  searchHits: () => ReadonlyMap<number, readonly SearchHit[]>
  flashHits: () => ReadonlyMap<number, readonly FlashMatch[]> | null
}
