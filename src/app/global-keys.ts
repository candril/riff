/**
 * Global key handling
 *
 * Dispatches the keys the keymap's layers leave (ADR-002) to feature modules:
 * the `g`, `z` and mark chords first, then the split toggle and the chord
 * openers, the tree for a key that broke off a chord or a slash its layer
 * cannot name, and the diff.
 */

import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import type { ComposerHandle } from "./island-composer"
import type { AppState } from "../state"
import { expandFiles } from "../state"
import { toggleHelp, toggleLinePeek } from "../state"
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
import { createOpenLink } from "./open-link"
import { createLinksPicker } from "./links-picker"
import { blameKeysContext } from "./blame-key-deps"
import { createCommentsOverlayOpen } from "./comments-overlay-open"
import { treeInputContext } from "./tree-key-deps"
import { chordSuffix } from "./chord-stroke"
import { diffTakesMarkChord } from "./mark-chord-gate"
import { Z_SEQUENCES, zChordCommands } from "./z-chord-commands"
import { zChordDeps } from "./z-chord-key-deps"

import * as commentsPicker from "../features/comments-picker"
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
import * as followLink from "../features/follow-link"
import * as prOperations from "../features/pr-operations"
import * as threadMotion from "../features/thread-motion"
import * as marks from "../features/marks"
import { createBlameKeys, type BlameDeps, type BlameKeys } from "../features/blame/keys"
import { chordAllowedUnderPeek } from "./peek-leaves"
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
 * first key was pressed. `clearChord` and `settleChord` are for the keymap
 * layers that take keys ahead of the chain, since a chord left pending
 * under a key a layer took would swallow the next key.
 */
export type GlobalKeyHandler = ((key: KeyEvent, chordBroken?: boolean) => void) & {
  chordPending(): boolean
  clearChord(): void
  /** Whether a chord is still pending once `key` settles it, without settling it. */
  chordPendingAfter(key: KeyEvent): boolean
  /** Drops a pending mark chord that `key` gives way to. */
  settleChord(key: KeyEvent): void
}

export interface KeyHandlerOptions {
  /**
   * The one `gb` shares with its peek's keymap layer, so a single object
   * owns every blame request.
   */
  blame?: BlameKeys
  /**
   * Hands a `]` or `[` to the keymap's bracket layer, which holds those
   * sequences. It reaches the chain when it broke off a chord, as in `]]f`
   * or `g]f`, and still opens one.
   */
  keymapChord: { start(key: KeyEvent): void }
}

export function createKeyHandler(ctx: GlobalKeyContext, options: KeyHandlerOptions): GlobalKeyHandler {
  const { blame = createBlameKeys(blameKeysContext(ctx)), keymapChord } = options
  const openLink = createOpenLink(ctx)
  const { linksTitle, openLinksPicker } = createLinksPicker(ctx)
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
  const zChords = zChordCommands(zChordDeps(ctx))

  const followLinkContext: followLink.FollowLinkContext = {
    setState: ctx.setState,
    getVimState: ctx.getVimState,
    getLineMapping: ctx.getLineMapping,
    render: ctx.render,
    jumpToFile: (candidates, line) => {
      const state = ctx.getState()
      const filename = candidates.find((candidate) =>
        state.files.some((file) => file.filename === candidate)
      )
      if (!filename) return false
      const fileIndex = state.files.findIndex((file) => file.filename === filename)

      // A file marked viewed is folded shut; a link to it means to read it.
      if (state.collapsedFiles.has(filename)) {
        ctx.setState((s) => expandFiles(s, [filename]))
        ctx.rebuildLineMapping()
      }
      fileNavigation.revealFile(fileIndex, ctx.fileNavContext)

      if (line !== undefined) {
        const visualLine = ctx.getLineMapping().findVisualLineForFileLine(filename, line)
        if (visualLine !== null) {
          ctx.setVimState({ ...ctx.getVimState(), line: visualLine, col: 0, desiredCol: null })
          ctx.ensureCursorVisible()
        }
      }

      ctx.render()
      return true
    },
    openPath: (candidates, line, tmux) => {
      void (async () => {
        // The reading that exists on disk wins; with neither there, the first
        // is the one the fetch-from-GitHub fallback should ask for.
        let target = candidates[0]!
        for (const candidate of candidates) {
          if (await Bun.file(candidate).exists()) {
            target = candidate
            break
          }
        }

        if (tmux) {
          await externalTools.handleOpenPathInTmuxWindow(ctx.externalToolsContext, target, line)
          return
        }
        await externalTools.handleOpenFileAtLine(ctx.externalToolsContext, target, line ?? 0)
      })()
    },
    openUrl: (url) => {
      const opener =
        process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
      Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" })
    },
    copyUrl: (url) => openLink("copy", { label: "link", url }),
  }

  return Object.assign(handleKeypress, {
    chordPending: () => pendingKey !== null,
    chordPendingAfter: (key: KeyEvent) =>
      pendingKey !== null && !marks.pendingMarkChordGivesWay(pendingKey, key, takesMarkChord()),
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
    settleChord(key)

    // ========== KEY SEQUENCES (gS, za, etc.) ==========
    const chordPending = pendingKey !== null || chordBroken
    if (pendingKey === "m" || pendingKey === "'") {
      const action = marks.markChordAction(pendingKey, key, takesMarkChord())
      clearPendingKey()
      if (action.kind === "set") marks.setMarkAtCursor(action.letter, ctx.marksContext)
      else if (action.kind === "jump") marks.jumpToMark(action.letter, ctx.marksContext)
      else if (action.kind === "flip") marks.flipMark(ctx.marksContext)
      return
    }
    if (pendingKey) {
      const sequence = `${pendingKey}${chordSuffix(key)}`
      clearPendingKey()

      const s = ctx.getState()
      if (!chordAllowedUnderPeek(sequence, s)) return

      const zChord = Z_SEQUENCES[sequence as keyof typeof Z_SEQUENCES]
      if (zChord && zChords[zChord]()) return

      if (sequence === "gS!" || sequence === "gs!") {
        reviewPreview.handleOpenReviewPreview(ctx.reviewPreviewOpenContext)
        return
      } else if (sequence === "gs") {
        syncPreview.handleOpenSyncPreview(ctx.syncPreviewOpenContext)
        return
      } else if (sequence === "go") {
        if (s.viewMode === "diff" && blame.openLink()) return
        if (s.appMode === "pr" && s.prInfo) {
          const { owner, repo, number: prNumber } = s.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      } else if (sequence === "gi") {
        if (s.appMode === "pr" && s.prInfo) {
          prInfoPanelFeature.handleOpenPRInfoPanel(ctx.prInfoPanelOpenContext)
        }
        return
      } else if (sequence === "gy") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("copy-pr-url")
        }
        return
      } else if (sequence === "gB!" || sequence === "gb!") {
        ctx.executeAction("open-in-board")
        return
      } else if (sequence === "gY!" || sequence === "gy!") {
        // Copy a GitHub permalink for the selection / current line / file.
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        ctx.executeAction("copy-permalink")
        return
      } else if (sequence === "gf") {
        followLink.handleFollowLink(followLinkContext)
        return
      } else if (sequence === "gF!" || sequence === "gf!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        followLink.handleFollowLink(followLinkContext, { tmux: true })
        return
      } else if (sequence === "gx") {
        followLink.handleFollowLink(followLinkContext, { urlsOnly: true })
        return
      } else if (sequence === "gX!" || sequence === "gx!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        followLink.handleFollowLink(followLinkContext, { urlsOnly: true, copy: true })
        return
      } else if (sequence === "ge") {
        externalTools.handleOpenFileInEditor(ctx.externalToolsContext)
        return
      } else if (sequence === "gE!" || sequence === "ge!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        externalTools.handleOpenFileInTmuxWindow(ctx.externalToolsContext)
        return
      } else if (sequence === "gc") {
        externalTools.handleCheckoutAndEdit(ctx.externalToolsContext)
        return
      } else if (sequence === "gC!" || sequence === "gc!") {
        // spec 044: Open comments picker. Silent no-op when nothing to
        // search so the chord doesn't flash an empty modal. Both `gC!`
        // and `gc!` are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        if (s.comments.length > 0) {
          key.preventDefault()
          ctx.setState(commentsPicker.openCommentsPicker)
          ctx.render()
        }
        return
      } else if (sequence === "gd") {
        // Both versions of this file, side by side (spec 075).
        void externalTools.handleDiffFileInEditor(ctx.externalToolsContext)
        return
      } else if (sequence === "gD!" || sequence === "gd!") {
        // Both spellings are accepted because terminals differ in whether
        // shift+letter reports the key name as lower- or uppercase.
        void externalTools.handleDiffFileInEditor(ctx.externalToolsContext, { tmux: true })
        return
      } else if (sequence === "gP!" || sequence === "gp!") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("edit-pr")
        } else if (s.appMode === "local") {
          ctx.executeAction("create-pr")
        }
        return
      } else if (sequence === "gb") {
        // Who last changed the cursor's line, and the commit that says why (spec 103).
        if (s.viewMode === "diff") blame.toggle()
        return
      } else if (sequence === "gl") {
        // The whole line, wrapped, for when scrolling through it sideways
        // is more work than reading it is worth.
        ctx.setState(toggleLinePeek)
        ctx.render()
        return
      } else if (sequence === "gr") {
        ctx.refreshContext.handleRefresh()
        return
      } else if (sequence === "gg") {
        folds.handleGoToTop(ctx.foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        folds.handleGoToBottom(ctx.foldsContext)
        return
      } else if (sequence === "g?" || sequence === "g?!") {
        ctx.setState(toggleHelp)
        ctx.render()
        return
      }
      // Other sequences handled by vim handler
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

    if (key.name === "]" || key.name === "[") {
      keymapChord.start(key)
      return
    }

    if ((key.name === "g" && !key.shift) || (key.name === "z" && !key.shift)) {
      openChord(key.name)
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
