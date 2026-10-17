import type { LineSpans } from "../diff-rows/line-spans"
import type { CommentSign } from "../diff-rows/signs"
import type { VisualRows } from "../diff-rows/visual-rows"
import type { Comment, FileReviewStatus } from "../types"
import type { DiffFile } from "../utils/diff-parser"
import type { FlashMatch } from "../vim-diff/flash-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { WordSpan } from "../vim-diff/word-diff"
import type { RowEnv } from "./env"
import type { RowSpan } from "./held-rows"
import type { UnifiedLayout } from "./unified-layout"
import type { SearchHit, SplitSearch, SplitSelection } from "./overlays"

export interface UnifiedDiffViewProps {
  mapping: DiffLineMapping
  files: readonly DiffFile[]
  lineSpans: LineSpans
  /** Bumped when a parse lands; LineSpans answers from a cache Solid cannot see into. */
  highlightVersion: number
  comments: readonly Comment[]
  fileStatuses: ReadonlyMap<string, FileReviewStatus>
  expandingDivider: string | null
  /** `line` indexes the mapping's lines; `col` is a UTF-16 column of it, as the vim cursor keeps it. */
  cursor: { line: number; col: number }
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
  /** Null when nothing matches; a match's `line` indexes the mapping's lines. */
  search: SplitSearch | null
  /** Null unless flash is active; its backdrop dims every row, matches or not. */
  flash: readonly FlashMatch[] | null
  /** Read once, when the view mounts; without one it lays itself out. */
  layout?: UnifiedLayout
}

/** What every unified row reads, worked out once per view rather than once per row. */
export interface UnifiedEnv extends RowEnv {
  props: UnifiedDiffViewProps
  signs: () => ReadonlyMap<number, CommentSign>
  words: () => ReadonlyMap<number, readonly WordSpan[]>
  searchHits: () => ReadonlyMap<number, readonly SearchHit[]>
  visual: () => VisualRows
  /** The visual rows mounted: the window's, and any a wheel tick has scrolled out of it but held. */
  mounted: () => RowSpan
  /** Whether a visual row is in the window; a mounted row outside it is held, and hidden. */
  inWindow: (row: number) => boolean
}
