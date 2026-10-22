import { createSignal, type Accessor } from "solid-js"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import type { ColumnStatus } from "./column-status"
import type { SelectionStatus } from "./selection-status"
import type { ConfirmDialogModel } from "../components/confirm-dialog-model"
import type { ReviewPreviewSnapshot } from "../features/review-preview/state"
import type { FilePickerSnapshot } from "../features/file-picker/state"
import type { CommentsPickerSnapshot } from "../features/comments-picker/state"
import type { OccurrencePickerSnapshot } from "../features/occurrence-picker/state"
import type { MarksPickerSnapshot } from "../features/marks/picker-state"
import type { Mark } from "../features/marks/types"
import type { FeedState } from "../features/feed/types"
import type { CommitPickerSnapshot } from "../features/commit-picker/state"
import type { ActionMenuSnapshot } from "../features/action-menu/state"
import type { LinePeekSnapshot } from "../features/line-peek/state"
import type { BlamePeekSnapshot } from "../features/blame/peek-state"

/**
 * What one render pass reads, published as a whole so views can derive
 * their own models from it. It bridges riff's plain-value state to Solid
 * until that state has accessors of its own (spec 100, M6), and it carries
 * a snapshot of the state that already lives in feature factories too, so
 * every island keeps following one frame until each reads its factory
 * itself (ADR-003).
 */
export interface Frame {
  state: AppState
  vimState: VimCursorState
  mapping: DiffLineMapping
  searchState: SearchState
  flashState: FlashState
  cachedCurrentUser: string | null
  width: number
  height: number
  /** The pass's clock, so every age drawn in one pass is measured from the same instant. */
  now: number
  /**
   * The status bar's readout of the diff. It is read off the views once the
   * pass has drawn them, since only their layout knows the columns and the
   * rows a selection spans; no function of the state alone can compute it.
   */
  diff: { columnInfo: ColumnStatus; selectionInfo: SelectionStatus }
  /** The help overlay's state, read off its factory as the frame was published. */
  help: { open: boolean; scroll: number }
  /** The confirm dialog's question, read off its factory; its answers stay there, where the keys reach them. */
  confirmDialog: ConfirmDialogModel | null
  /** The sync preview's state, read off its factory, or null while it is closed. */
  syncPreview: { loading: boolean } | null
  /** Submit Review's state, read off its factory, or null while it is closed. */
  reviewPreview: ReviewPreviewSnapshot | null
  /** The file picker's state, read off its factory, or null while it is closed. */
  filePicker: FilePickerSnapshot | null
  /** The comments picker's state, read off its factory, or null while it is closed. */
  commentsPicker: CommentsPickerSnapshot | null
  /** The occurrence picker's state, read off its factory, or null while it is closed. */
  occurrencePicker: OccurrencePickerSnapshot | null
  /** The marks picker's state, read off its factory, or null while it is closed. */
  marksPicker: MarksPickerSnapshot | null
  /** The global marks, read off their factory, for the marks picker's rows. */
  marks: readonly Mark[]
  /** The activity feed's row, filters and stream, read off its factory. */
  feed: FeedState
  /** The commit picker's state, read off its factory, or null while it is closed. */
  commitPicker: CommitPickerSnapshot | null
  /** The command palette's state, read off its factory, or null while it is closed. */
  actionMenu: ActionMenuSnapshot | null
  /** The line peek's side and scroll, read off its factory, or null while it is closed. */
  linePeek: LinePeekSnapshot | null
  /** The blame peek's line and answer, read off its factory, or null while it is closed. */
  blamePeek: BlamePeekSnapshot | null
  /** The @mention pool and the query being searched on GitHub, read off their factory. */
  mentions: { pool: readonly string[]; searching: string | null }
  /** The comment composer's kept drafts, read off their factory (spec 061). */
  commentDrafts: ReadonlyMap<string, string>
  /** Each keymap command's `keys`, the palette's hints; empty until the keys are built. */
  commandKeys: ReadonlyMap<string, string>
}

/** The pickers read off their factories, each null while it is closed. */
export type PickerSnapshots = Pick<Frame, "filePicker" | "commentsPicker" | "occurrencePicker" | "marksPicker" | "commitPicker" | "actionMenu">

/** What decides which prompt is typing: the pickers, and the feed, whose filter prompt is one of them. */
export type PromptSnapshots = PickerSnapshots & Pick<Frame, "feed">

// The last frame each followed accessor's followers finished drawing.
const drawn = new WeakMap<Accessor<Frame | null>, Frame | null>()

/** Called by a follower once every island has drawn `current`. */
export function markDrawn(frame: Accessor<Frame | null>, current: Frame | null): void {
  drawn.set(frame, current)
}

/** Called once nothing follows `frame` any more, so publishing to it is never checked. */
export function unmarkDrawn(frame: Accessor<Frame | null>): void {
  drawn.delete(frame)
}

export function createFrame(): { frame: Accessor<Frame | null>; publish(next: Frame): void } {
  // Never equal: a pass republishes even when nothing it holds is new, as each
  // pass pushed every model before.
  const [frame, setFrame] = createSignal<Frame | null>(null, { equals: false })
  return {
    frame,
    publish(next) {
      setFrame(() => next)
      // The composer and the prompts focus their fields here, as the first
      // followers, and the frame pass expects them to have done so and every
      // island to have drawn by the time this returns, which a batch or an
      // effect would defer. Checked in tests only, where it costs nothing to
      // be loud.
      if (process.env.NODE_ENV === "test" && drawn.has(frame) && drawn.get(frame) !== next) {
        throw new Error("render() ran inside a Solid batch or update, so the frame islands would draw after it returns")
      }
    },
  }
}
