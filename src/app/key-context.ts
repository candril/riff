/**
 * The app as every keymap layer sees it: each layer's deps are built from
 * this context (ADR-002).
 */

import type { TextareaRenderable } from "@opentui/core"
import type { ComposerHandle } from "./island-composer"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { SearchHandler } from "../vim-diff/search-handler"
import type { FlashHandler } from "../vim-diff/flash-handler"
import type { CommentScope } from "../diff-rows/comment-scope"
import type { DiffViewport } from "./diff-viewport"
import type { ChatState } from "../features/chat/state"
import type { ChatAtPicker } from "../features/chat/at-picker"
import type { HelpState } from "../features/help/state"
import type { ConfirmState } from "../features/confirm/state"
import type { SyncPreviewState } from "../features/sync-preview/state"
import type { ReviewPreviewState } from "../features/review-preview/state"
import type { FilePickerState } from "../features/file-picker/state"
import type { CommentsPickerState } from "../features/comments-picker/state"
import type { OccurrencePickerState } from "../features/occurrence-picker/state"
import type { MarksPickerState } from "../features/marks/picker-state"
import type { CommitPickerState } from "../features/commit-picker/state"
import type { ActionMenuState } from "../features/action-menu/state"
import type { LinePeekState } from "../features/line-peek/state"
import type { BlamePeekState } from "../features/blame/peek-state"
import type { BlameColumnsState } from "../features/blame/column-state"
import type { PRInfoPanelClass } from "../components"
import type { FileTreeIsland } from "./file-tree"
import type { ThreadPanelLayout } from "../features/inline-comment-overlay/motions"

import type * as prInfoPanelFeature from "../features/pr-info-panel"
import type * as syncPreview from "../features/sync-preview"
import type * as reviewPreview from "../features/review-preview"
import type * as feed from "../features/feed"
import type * as folds from "../features/folds"
import type * as fileNavigation from "../features/file-navigation"
import type * as commentsFeature from "../features/comments"
import type * as externalTools from "../features/external-tools"
import type * as prOperations from "../features/pr-operations"
import type * as threadMotion from "../features/thread-motion"
import type * as marks from "../features/marks"
import type { BlameDeps } from "../features/blame/keys"
import type { Comment, ReactionTarget } from "../types"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"

export interface AppKeyContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  getCommentScope: () => CommentScope
  rebuildLineMapping: () => void
  getPane: () => "left" | "right" | null
  setPane: (pane: "left" | "right") => void
  // Search state
  getSearchState: () => SearchState
  // Flash jump state (spec 022)
  getFlashState: () => FlashState
  // UI
  renderer: { height: number }
  cursorView: DiffViewport
  fileTreePanel: FileTreeIsland
  threadPanelLayout: () => ThreadPanelLayout | null
  getPrInfoPanel: () => PRInfoPanelClass | null
  // Vim handlers
  vimHandler: VimMotionHandler
  searchHandler: SearchHandler
  flashHandler: FlashHandler
  // Helpers
  render: () => void
  quit: () => void
  ensureCursorVisible: () => void
  /** `\`: side by side where it fits, unified otherwise. */
  toggleSplitView: () => void
  updateFileTreePanel: () => void
  handleExpandDivider: () => Promise<boolean>
  handleYank: (options: { raw: boolean }) => void
  handleCopyCommentLink: (comment?: Comment | null) => Promise<void>
  executeAction: (id: string) => void
  /** `H` in the thread panel: open threads only, saved with the review. */
  toggleOpenThreadsOnly: () => void
  /** `H` in the file tree: unviewed files only, saved with the review. */
  toggleUnviewedFilesOnly: () => void
  /** Toggle a reaction on a target — fired when the user presses Enter
   *  on a React… submenu row (spec 042). */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  // Commit selection handler
  /** Scope the diff to a commit — and, when named, scroll to one of its files. */
  onCommitSelected: (sha: string | null, filename?: string, scope?: readonly string[] | null) => void
  /** Load the pull request the branch already has and read it as one
   *  (spec 095). Only meaningful in local mode with a `branchPr`. */
  openBranchPr: (view: "state" | "feed") => void
  // Feature contexts (passed through for delegation)
  foldsContext: folds.FoldsContext
  fileNavContext: fileNavigation.FileNavigationContext
  commentsContext: commentsFeature.CommentsContext
  externalToolsContext: externalTools.ExternalToolsContext
  prOperationsContext: prOperations.PrOperationsContext
  refreshContext: { handleRefresh: () => Promise<void> }
  /** Loading the feed's own data (spec 070). */
  feedLoadContext: feed.FeedLoadContext
  reviewPreviewOpenContext: reviewPreview.ReviewPreviewOpenContext
  /** Read from the textarea, not the factory's `body`: that mirror
   *  is updated asynchronously and can lag the last keystroke. */
  readReviewSummary: () => string
  /** The comment composer's textarea, which the overlay's keys read and fill. */
  composer: ComposerHandle
  syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext
  prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext
  threadMotionContext: threadMotion.ThreadMotionContext
  marksContext: marks.MarksContext
  /** `gb`'s blame source and the browser and clipboard its peek hands off to (spec 103). */
  blame: BlameDeps
  /** The chat column's conversation and its input (spec 102). */
  chat: { state: ChatState; input: () => TextareaRenderable | null; atPicker: ChatAtPicker }
  /** The help overlay's state, the same instance the frame pass reads. */
  help: HelpState
  /** The confirm dialog's state, the same instance the frame pass reads. */
  confirm: ConfirmState
  /** The sync preview's state, the same instance the frame pass reads. */
  syncPreview: SyncPreviewState
  /** Submit Review's state, the same instance the frame pass reads. */
  reviewPreview: ReviewPreviewState
  /** The file picker's state, the same instance the frame pass reads. */
  filePicker: FilePickerState
  /** The comments picker's state, the same instance the frame pass reads. */
  commentsPicker: CommentsPickerState
  /** The occurrence picker's state, the same instance the frame pass reads. */
  occurrencePicker: OccurrencePickerState
  /** The marks picker's state, the same instance the frame pass reads. */
  marksPicker: MarksPickerState
  /** The commit picker's state, the same instance the frame pass reads. */
  commitPicker: CommitPickerState
  /** The command palette's state, the same instance the frame pass reads. */
  actionMenu: ActionMenuState
  /** The line peek's state, the same instance the frame pass reads. */
  linePeek: LinePeekState
  /** The blame peek's state, the same instance the frame pass reads. */
  blamePeek: BlamePeekState
  /** The zB blame columns, the same instance the diff passes read. */
  blameColumns: BlameColumnsState
  /** How the thread panel's composer closed, for a proposal of the agent's that is open in it. */
  composerSettled?: (outcome: ComposerOutcome) => void
}
