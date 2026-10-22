/**
 * Global key handling
 *
 * Dispatches the keys the keymap's layers leave (ADR-002) to feature modules:
 * the mark chords first, then the split toggle and the mark chords'
 * openers, the tree for a key that broke off a chord or a slash its layer
 * cannot name, and the diff. The `]`/`[`, `z` and `g` chords are keymap
 * sequences.
 */

import type { KeyEvent, TextareaRenderable } from "@opentui/core"
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
import { togglesSplit } from "./split-toggle-key"
import type { ChatState } from "../features/chat/state"
import type { PRInfoPanelClass } from "../components"
import type { FileTreeIsland } from "./file-tree"
import type { ThreadPanelLayout } from "../features/inline-comment-overlay/motions"
import { createCommentsOverlayOpen } from "./comments-overlay-open"
import { treeInputContext } from "./tree-key-deps"
import { diffTakesMarkChord } from "./mark-chord-gate"

import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as feed from "../features/feed"
import * as fileTreeFeature from "../features/file-tree"
import * as diffView from "../features/diff-view"
import * as folds from "../features/folds"
import * as fileNavigation from "../features/file-navigation"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as prOperations from "../features/pr-operations"
import * as threadMotion from "../features/thread-motion"
import * as marks from "../features/marks"
import type { BlameDeps } from "../features/blame/keys"
import type { Comment, ReactionTarget } from "../types"
import type { ComposerOutcome } from "../features/inline-comment-overlay/composer-keys"

export interface GlobalKeyContext {
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
  /** Read from the textarea, not `state.reviewPreview.body`: that mirror
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
  chat: { state: ChatState; input: () => TextareaRenderable | null }
  /** How the thread panel's composer closed, for a proposal of the agent's that is open in it. */
  composerSettled?: (outcome: ComposerOutcome) => void
}

/**
 * `chordPending` is exposed because the jump recorder judges a chord as one
 * interaction: a place reached by its second key is recorded from where the
 * first key was pressed. `clearChord` is for the keymap layers that take
 * keys ahead of the chain, since a chord left pending under a key a layer
 * took would swallow the next key. `settleChord` runs at the dispatch entry
 * (composeKeys), ahead of every layer.
 */
export type GlobalKeyHandler = ((key: KeyEvent, chordBroken?: boolean) => void) & {
  chordPending(): boolean
  clearChord(): void
  /** Drops a pending mark chord that `key` gives way to. */
  settleChord(key: KeyEvent): void
}

export function createKeyHandler(ctx: GlobalKeyContext): GlobalKeyHandler {
  const { openCommentsOverlay, openCommentsPanelForCursor } = createCommentsOverlayOpen(ctx)

  // Key sequence tracking
  let pendingKey: string | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function clearPendingKey() {
    pendingKey = null
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  function openChord(opener: string) {
    pendingKey = opener
    const timeout = marks.chordTimeoutMs(opener)
    if (timeout !== null) pendingTimeout = setTimeout(clearPendingKey, timeout)
  }

  const takesMarkChord = () => diffTakesMarkChord(ctx)

  return Object.assign(handleKeypress, {
    chordPending: () => pendingKey !== null,
    clearChord: clearPendingKey,
    settleChord,
  })

  // A click into the tree between `m` and its letter leaves the chord
  // pending; the next key was typed for the tree, and whatever stands aside
  // while a chord is pending, in the chain or in a layer ahead of it, would
  // otherwise never see it.
  function settleChord(key: KeyEvent) {
    if (marks.pendingMarkChordGivesWay(pendingKey, key, takesMarkChord())) clearPendingKey()
  }

  function handleKeypress(key: KeyEvent, chordBroken = false) {
    // ========== MARK CHORDS (ma, 'a) ==========
    const chordPending = pendingKey !== null || chordBroken
    if (pendingKey === "m" || pendingKey === "'") {
      const action = marks.markChordAction(pendingKey, key, takesMarkChord())
      clearPendingKey()
      if (action.kind === "set") marks.setMarkAtCursor(action.letter, ctx.marksContext)
      else if (action.kind === "jump") marks.jumpToMark(action.letter, ctx.marksContext)
      else if (action.kind === "flip") marks.flipMark(ctx.marksContext)
      return
    }

    if (togglesSplit(key, ctx.getState().viewMode, ctx.getVimState(), chordPending)) {
      ctx.toggleSplitView()
      return
    }

    const markChord = chordPending ? null : marks.markChordOpenedBy(key, takesMarkChord())
    if (markChord) {
      openChord(markChord)
      return
    }

    // A key that breaks off a chord without completing a sequence still goes
    // to the tree, whose layer stood aside for it while the chord was pending.
    // So does a slash the layer has no binding for: where `/` is a shifted key,
    // kitty names a modified slash after its base key ("7") and only its
    // sequence says "/", which the tree's filter opener matches.
    if ((chordPending || key.sequence === "/") && fileTreeFeature.handleInput(key, treeInputContext(ctx))) {
      return
    }

    // ========== DIFF VIEW FOCUSED ==========
    diffView.handleInput(key, {
      state: ctx.getState(),
      getVimState: ctx.getVimState,
      setVimState: ctx.setVimState,
      vimHandler: ctx.vimHandler,
      cursorView: ctx.cursorView,
      searchState: ctx.getSearchState(),
      searchHandler: ctx.searchHandler,
      flashHandler: ctx.flashHandler,
      getCurrentComment: () => commentsFeature.getCurrentComment(ctx.commentsContext),
      handleAddComment: () => commentsFeature.handleAddComment(ctx.commentsContext),
      handleYank: ctx.handleYank,
      handleExpandDivider: ctx.handleExpandDivider,
      showAllFiles: () => ctx.executeAction("show-all-files"),
      showAllCommits: () => ctx.onCommitSelected(null),
      handleToggleViewed: (advanceToNext: boolean) =>
        fileNavigation.handleToggleViewed(advanceToNext, ctx.fileNavContext),
      handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(ctx.commentsContext),
      handleOpenInlineOverlay: openCommentsOverlay,
      handleOpenPanelView: openCommentsPanelForCursor,
    })
  }
}
