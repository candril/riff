/**
 * Global key handling
 *
 * Dispatches keyboard events to feature modules. Features are checked in priority order:
 * modal overlays first, then global shortcuts, then panel-specific handlers.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import { openActionMenu, openFilePicker, openCommitPicker, openInlineCommentOverlay, closeInlineCommentOverlay, toggleFilePanel, toggleFilePanelExpanded, toggleViewMode, setViewingCommit, showToast, clearToast } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { SearchHandler } from "../vim-diff/search-handler"
import type { VimDiffView } from "../components"
import type { PRInfoPanelClass } from "../components"
import type { FileTreePanel } from "../components/FileTreePanel"
import { createCursorState } from "../vim-diff/cursor-state"
import { getVisibleFlatTreeItems } from "../components"

import * as actionMenu from "../features/action-menu"
import * as filePicker from "../features/file-picker"
import * as commentsPicker from "../features/comments-picker"
import * as commitPicker from "../features/commit-picker"
import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as inlineCommentOverlay from "../features/inline-comment-overlay"
import * as search from "../features/search"
import * as fileTreeFeature from "../features/file-tree"
import * as diffView from "../features/diff-view"
import * as folds from "../features/folds"
import * as fileNavigation from "../features/file-navigation"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as prOperations from "../features/pr-operations"
import * as aiReview from "../features/ai-review"
import * as threadMotion from "../features/thread-motion"
import * as jumplist from "../features/jumplist"
import type { ReactionTarget } from "../types"
import { groupIntoThreads } from "../utils/threads"

export interface GlobalKeyContext {
  // State access
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  // Vim state
  getVimState: () => VimCursorState
  setVimState: (s: VimCursorState) => void
  // Line mapping
  getLineMapping: () => DiffLineMapping
  rebuildLineMapping: () => void
  // Search state
  getSearchState: () => SearchState
  // UI
  renderer: { console: { toggle: () => void } }
  vimDiffView: VimDiffView
  fileTreePanel: FileTreePanel
  getPrInfoPanel: () => PRInfoPanelClass | null
  // Vim handlers
  vimHandler: VimMotionHandler
  searchHandler: SearchHandler
  // Helpers
  render: () => void
  quit: () => void
  ensureCursorVisible: () => void
  updateFileTreePanel: () => void
  handleExpandDivider: () => Promise<boolean>
  executeAction: (id: string) => void
  /** Toggle a reaction on a target — fired when the user presses Enter
   *  on a React… submenu row (spec 042). */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  // Commit selection handler
  onCommitSelected: (sha: string | null) => void
  // Feature contexts (passed through for delegation)
  foldsContext: folds.FoldsContext
  fileNavContext: fileNavigation.FileNavigationContext
  commentsContext: commentsFeature.CommentsContext
  externalToolsContext: externalTools.ExternalToolsContext
  prOperationsContext: prOperations.PrOperationsContext
  refreshContext: { handleRefresh: () => Promise<void> }
  reviewPreviewOpenContext: reviewPreview.ReviewPreviewOpenContext
  syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext
  prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext
  aiReviewContext: aiReview.AiReviewContext
  threadMotionContext: threadMotion.ThreadMotionContext
}

/**
 * Get the current file path based on context (like nvim's Ctrl+g).
 * Returns the full path from:
 * - File tree: highlighted file path
 * - Single file view: selected file path
 * - All files view: file at cursor position
 */
function getCurrentFilePath(ctx: GlobalKeyContext): string | null {
  const state = ctx.getState()
  const lineMapping = ctx.getLineMapping()
  const vimState = ctx.getVimState()

  if (state.focusedPanel === "tree") {
    // From file tree - use highlighted item
    const flatItems = getVisibleFlatTreeItems(state.fileTree, state.files, state.ignoredFiles, state.showHiddenFiles)
    const highlightedItem = flatItems[state.treeHighlightIndex]
    if (highlightedItem) {
      return highlightedItem.node.path
    }
  } else if (state.selectedFileIndex !== null) {
    // Single file view - use selected file
    const file = state.files[state.selectedFileIndex]
    if (file) {
      return file.filename
    }
  } else {
    // All files view - use file at cursor
    const currentLine = lineMapping.getLine(vimState.line)
    if (currentLine?.filename) {
      return currentLine.filename
    }
  }

  return null
}

export function createKeyHandler(ctx: GlobalKeyContext): (key: KeyEvent) => void {
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

  // Snapshot the current location into the jumplist. Call BEFORE a
  // navigation mutates state — the entry is the location we'll jump back
  // to with Ctrl-O (spec 038).
  function recordJump() {
    ctx.setState((s) => jumplist.pushCurrent(s, ctx.getVimState()))
  }

  const jumpApplyCtx: jumplist.JumpApplyContext = {
    setState: ctx.setState,
    setVimState: ctx.setVimState,
    rebuildLineMapping: ctx.rebuildLineMapping,
    ensureCursorVisible: ctx.ensureCursorVisible,
    render: ctx.render,
    onCommitSelected: ctx.onCommitSelected,
  }

  return function handleKeypress(key: KeyEvent) {
    // F12 toggles debug console
    if (key.name === "f12") {
      ctx.renderer.console.toggle()
      return
    }

    // ========== ACTION MENU (captures all input when open) ==========
    if (
      actionMenu.handleInput(key, {
        state: ctx.getState(),
        getVimState: ctx.getVimState,
        setState: ctx.setState,
        render: ctx.render,
        executeAction: ctx.executeAction,
        onToggleReaction: ctx.onToggleReaction,
      })
    ) {
      return
    }

    // ========== FILE PICKER (captures all input when open) ==========
    if (
      filePicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onFileSelected: () => {
          ctx.setVimState(createCursorState())
          ctx.rebuildLineMapping()
        },
        recordJump,
      })
    ) {
      return
    }

    // ========== COMMENTS PICKER (captures all input when open, spec 044) ==========
    if (
      commentsPicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        recordJump,
        onSelectComment: (comment) => {
          commentsPicker.jumpToComment(comment, {
            getState: ctx.getState,
            setState: ctx.setState,
            getVimState: ctx.getVimState,
            setVimState: ctx.setVimState,
            getLineMapping: ctx.getLineMapping,
            ensureCursorVisible: ctx.ensureCursorVisible,
            render: ctx.render,
            fileNavContext: ctx.fileNavContext,
          })
        },
      })
    ) {
      return
    }

    // ========== COMMIT PICKER (captures all input when open) ==========
    if (
      commitPicker.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onCommitSelected: (sha) => {
          recordJump()
          ctx.onCommitSelected(sha)
        },
      })
    ) {
      return
    }

    // ========== SYNC PREVIEW (captures all input when open) ==========
    if (
      syncPreview.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        onExecuteSync: () => prOperations.handleExecuteSync(ctx.prOperationsContext),
      })
    ) {
      return
    }

    // ========== REVIEW PREVIEW (captures all input when open) ==========
    const currentState = ctx.getState()
    if (
      reviewPreview.handleInput(key, {
        state: currentState,
        setState: ctx.setState,
        render: ctx.render,
        getValidatedComments: () =>
          commentsFeature.validateCommentsForSubmit(
            currentState.comments.filter(
              (c) => (c.status === "local" || c.status === "pending") && !c.inReplyTo
            ),
            currentState.files
          ),
        isOwnPr:
          currentState.prInfo !== null &&
          ctx.reviewPreviewOpenContext.getCachedCurrentUser() === currentState.prInfo.author,
        onConfirmReview: () => prOperations.handleConfirmReview(ctx.prOperationsContext),
      })
    ) {
      return
    }

    // ========== INLINE COMMENT OVERLAY (captures all input when open) ==========
    if (
      inlineCommentOverlay.handleInput(key, {
        getState: ctx.getState,
        setState: ctx.setState,
        render: ctx.render,
        source: ctx.commentsContext.source,
        getCachedCurrentUser: ctx.commentsContext.getCachedCurrentUser,
        handleReplyExternal: () =>
          commentsFeature.handleAddComment(ctx.commentsContext),
        handleEditExternal: () =>
          commentsFeature.handleAddComment(ctx.commentsContext),
        handleDelete: (comment) =>
          commentsFeature.handleDeleteComment(ctx.commentsContext, comment),
        handleSubmit: (comment) =>
          commentsFeature.handleSubmitSingleComment(ctx.commentsContext, comment),
        handleToggleResolved: (thread) =>
          prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread),
        handleJumpAdjacent: (direction) =>
          threadMotion.jumpOverlayToAdjacentThread(direction, ctx.threadMotionContext),
        handleStartNewComment: () => {
          // Start a new comment for the diff cursor's current line.
          // Silently no-op when the cursor isn't on a commentable line —
          // the panel hint footer already advertises `n`, so the user
          // can move the cursor and try again.
          const lineMapping = ctx.getLineMapping()
          const vimState = ctx.getVimState()
          const anchor = lineMapping.getCommentAnchor(vimState.line)
          if (!anchor) {
            ctx.setState((s) =>
              showToast(s, "Move cursor to a commentable line first", "info")
            )
            ctx.render()
            setTimeout(() => {
              ctx.setState(clearToast)
              ctx.render()
            }, 2500)
            return
          }
          ctx.setState((s) =>
            openInlineCommentOverlay(
              s,
              anchor.filename,
              anchor.line,
              anchor.side,
              "compose"
            )
          )
          ctx.render()
        },
      })
    ) {
      return
    }

    // ========== PR INFO PANEL (captures input while viewing PR overview) ==========
    // Runs after all modal overlays so they get first crack at keys like 1/2/3.
    if (
      prInfoPanelFeature.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: ctx.getPrInfoPanel,
        onJumpToFile: (filename) => {
          // Jump to file by filename. recordJump runs inside the panel
          // input handler BEFORE closePRInfoPanel, so the jump captures
          // viewMode="pr" — back-jump can return to the PR view.
          const state = ctx.getState()
          const fileIndex = state.files.findIndex((f) => f.filename === filename)
          if (fileIndex !== -1) {
            fileNavigation.handleSelectFile(fileIndex, ctx.fileNavContext)
          }
        },
        onJumpToLocation: (filename, line) => {
          // Jump to file:line (for code comments). See note on
          // onJumpToFile re: jumplist push timing.
          const state = ctx.getState()
          const fileIndex = state.files.findIndex((f) => f.filename === filename)
          if (fileIndex !== -1) {
            fileNavigation.handleSelectFile(fileIndex, ctx.fileNavContext)
            // TODO: Also scroll to the specific line
          }
        },
        onOpenFileAtLine: (filename, line) => {
          void externalTools.handleOpenFileAtLine(ctx.externalToolsContext, filename, line)
        },
        onActivateCommit: (sha) => {
          // Activate commit (set viewing commit). Jump push happens in
          // the panel input handler before closePRInfoPanel.
          ctx.onCommitSelected(sha)
        },
        onToggleThreadResolved: (rootCommentId) => {
          // Resolve the review thread whose root has this id. Built from
          // live state.comments so mutations/refresh reflect immediately.
          const state = ctx.getState()
          const threads = groupIntoThreads(state.comments)
          const thread = threads.find((t) => t.id === rootCommentId)
          if (!thread) return
          void prOperations.handleToggleThreadResolved(ctx.prOperationsContext, thread)
        },
        executeAction: ctx.executeAction,
        recordJump,
      })
    ) {
      return
    }

    // ========== CONFIRMATION DIALOG (y/n to confirm/cancel) ==========
    {
      const dialogState = ctx.getState()
      if (dialogState.confirmDialog) {
        if (key.name === "y" || key.name === "Y") {
          dialogState.confirmDialog.onConfirm()
          return
        } else if (key.name === "n" || key.name === "N" || key.name === "escape") {
          dialogState.confirmDialog.onCancel()
          return
        }
        // Other keys are ignored while dialog is open
        return
      }
    }

    // ========== DRAFT REVIEW DIALOG (y/e/d/Esc, spec 036) ==========
    {
      const dialogState = ctx.getState()
      if (dialogState.draftReview) {
        if (key.name === "y" || key.name === "Y" || key.name === "return") {
          void aiReview.handleApproveDraftedComment(ctx.aiReviewContext)
          return
        } else if (key.name === "e" || key.name === "E") {
          void aiReview.handleEditDraftedComment(ctx.aiReviewContext)
          return
        } else if (key.name === "d" || key.name === "D") {
          void aiReview.handleDiscardDraftedComment(ctx.aiReviewContext)
          return
        } else if (key.name === "n" || key.name === "N" || key.name === "escape") {
          aiReview.handleCancelDraftReview(ctx.aiReviewContext)
          return
        }
        // Swallow all other keys — this is a modal dialog.
        return
      }
    }

    // ========== SEARCH INPUT (captures input when search prompt is active) ==========
    if (search.handleInput(key, { searchState: ctx.getSearchState(), searchHandler: ctx.searchHandler })) {
      return
    }


    // ========== GLOBAL KEYS (work in any mode) ==========
    // When a chord is mid-sequence (e.g. user typed `g` and we're
    // waiting for the second key), single-key handlers must NOT fire on
    // the second key — they'd steal it from the chord matcher below.
    // This is what previously broke `gC` (Shift+C → "add-pr-comment"),
    // `gi` (bare `i` → toggleViewMode), etc.
    const state = ctx.getState()
    if (!pendingKey) switch (key.name) {
      case "o":
        if (key.ctrl) {
          // Ctrl-O: back in jumplist (spec 038).
          const result = jumplist.back(ctx.getState(), ctx.getVimState())
          if (result) {
            ctx.setState(() => result.state)
            jumplist.apply(result.jump, jumpApplyCtx)
          }
          return
        }
        break

      case "p":
        if (key.ctrl) {
          ctx.setState(openActionMenu)
          ctx.render()
          return
        }
        break

      case "f":
        if (key.ctrl && state.files.length > 0) {
          ctx.setState(openFilePicker)
          ctx.render()
          return
        }
        break

      case "g":
        if (key.ctrl && state.files.length > 0) {
          // Show file path toast (like nvim Ctrl+g)
          const filePath = getCurrentFilePath(ctx)
          if (filePath) {
            ctx.setState((s) => showToast(s, filePath, "info"))
            ctx.render()
          }
          return
        }
        break

      case "q":
        ctx.quit()
        return

      case "c":
        // C (shift+c): Add an inline comment via $EDITOR. Falls back
        // silently if the cursor isn't on a commentable line. PR-level
        // conversation comments are command-palette only.
        if (key.shift) {
          void commentsFeature.handleAddComment(ctx.commentsContext)
          return
        }
        break

      case "escape":
        // Clear toast if visible
        if (state.toast.message) {
          ctx.setState(clearToast)
          ctx.render()
          return
        }
        break

      case "i":
        // Bare `i` toggles between PR overview and diff (PR mode only;
        // no-op in local mode). Ctrl-I arrives as `tab` and is forward-
        // jump (spec 038), so we explicitly require !key.ctrl here to
        // keep the two distinct. Use `gi` to jump straight to PR view.
        if (!key.ctrl) {
          recordJump()
          ctx.setState(toggleViewMode)
          ctx.render()
          return
        }
        break

      case "g":
      case "G":
        if ((key.name === "G" || key.shift) && state.focusedPanel !== "diff") {
          folds.handleGoToBottom(ctx.foldsContext)
          return
        }
        break

      case "b":
        if (key.ctrl) {
          ctx.setState((s) => {
            const toggled = toggleFilePanel(s)
            return toggled.showFilePanel ? { ...toggled, focusedPanel: "tree" } : toggled
          })
          ctx.render()
          setTimeout(() => {
            ctx.render()
          }, 0)
          return
        }
        break

      case "e":
        if (key.ctrl && state.showFilePanel) {
          ctx.setState(toggleFilePanelExpanded)
          ctx.render()
          return
        }
        // E (shift+e): Edit the comment thread on the current line via
        // $EDITOR. Same flow as `C` — handleAddComment shows the thread
        // for editing and includes a reply box. No-op when the cursor
        // isn't on a commented/commentable line.
        if (key.shift) {
          void commentsFeature.handleAddComment(ctx.commentsContext)
          return
        }
        break

      case "tab": {
        // Tab and Ctrl-I are indistinguishable in terminal input; both
        // mean forward-jump in the jumplist (spec 038). The previous
        // view-toggle binding moved to bare `i`.
        const result = jumplist.forward(ctx.getState())
        if (result) {
          ctx.setState(() => result.state)
          jumplist.apply(result.jump, jumpApplyCtx)
        }
        return
      }

      case "backspace":
        // Ctrl-h moves focus one panel left: comments → diff → tree.
        // Terminals deliver bare Ctrl-h as backspace.
        if (state.mode === "normal") {
          if (state.focusedPanel === "comments") {
            ctx.setState((s) => ({ ...s, focusedPanel: "diff" }))
            ctx.render()
            return
          }
          if (state.showFilePanel && state.focusedPanel === "diff") {
            ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
            ctx.render()
            return
          }
        }
        break

      case "l":
        if (key.ctrl) {
          // Ctrl-l moves focus one panel right: tree → diff → comments.
          // From tree we also drop any visual-line selection so it
          // doesn't linger as dormant state.
          ctx.setState((s) => {
            if (s.focusedPanel === "tree") {
              return { ...s, focusedPanel: "diff", treeSelectionAnchor: null }
            }
            if (s.focusedPanel === "diff" && s.inlineCommentOverlay.open) {
              return { ...s, focusedPanel: "comments" }
            }
            return s
          })
          ctx.render()
          setTimeout(() => {
            ctx.render()
          }, 0)
          return
        }
        break
    }

    // ========== KEY SEQUENCES (]f, [f, gS, etc.) ==========
    if (pendingKey) {
      const keyChar = key.name || (key.sequence?.length === 1 ? key.sequence : "")
      const sequence = `${pendingKey}${keyChar}${key.shift ? "!" : ""}`
      clearPendingKey()

      const s = ctx.getState()

      if (sequence === "]f") {
        recordJump()
        if (s.selectedFileIndex === null) {
          // All-files view: move cursor to next file header
          ctx.vimHandler.moveToFile("next")
          ctx.render()
        } else {
          // Single-file view: navigate to next file
          fileNavigation.navigateFileSelection(1, ctx.fileNavContext)
        }
        return
      } else if (sequence === "[f") {
        recordJump()
        if (s.selectedFileIndex === null) {
          // All-files view: move cursor to previous file header
          ctx.vimHandler.moveToFile("prev")
          ctx.render()
        } else {
          // Single-file view: navigate to previous file
          fileNavigation.navigateFileSelection(-1, ctx.fileNavContext)
        }
        return
      } else if (sequence === "]u") {
        recordJump()
        fileNavigation.navigateToUnviewedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[u") {
        recordJump()
        fileNavigation.navigateToUnviewedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]o") {
        recordJump()
        fileNavigation.navigateToOutdatedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[o") {
        recordJump()
        fileNavigation.navigateToOutdatedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]r") {
        recordJump()
        threadMotion.navigateToThread(1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "[r") {
        recordJump()
        threadMotion.navigateToThread(-1, false, ctx.threadMotionContext)
        return
      } else if (sequence === "]R!") {
        recordJump()
        threadMotion.navigateToThread(1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "[R!") {
        recordJump()
        threadMotion.navigateToThread(-1, true, ctx.threadMotionContext)
        return
      } else if (sequence === "gS!" || sequence === "gs!") {
        reviewPreview.handleOpenReviewPreview(ctx.reviewPreviewOpenContext)
        return
      } else if (sequence === "gs") {
        syncPreview.handleOpenSyncPreview(ctx.syncPreviewOpenContext)
        return
      } else if (sequence === "go") {
        if (s.appMode === "pr" && s.prInfo) {
          const { owner, repo, number: prNumber } = s.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      } else if (sequence === "gi") {
        if (s.appMode === "pr" && s.prInfo) {
          recordJump()
          prInfoPanelFeature.handleOpenPRInfoPanel(ctx.prInfoPanelOpenContext)
        }
        return
      } else if (sequence === "gy") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("copy-pr-url")
        }
        return
      } else if (sequence === "gf") {
        externalTools.handleOpenFileInEditor(ctx.externalToolsContext)
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
          ctx.setState(commentsPicker.openCommentsPicker)
          ctx.render()
        }
        return
      } else if (sequence === "gd") {
        // spec 036: review the drafted inline comment. Silently no-op
        // when no draft is pending so the chord doesn't feel broken.
        if (ctx.getState().draftNotification) {
          void aiReview.handleReviewDraftedComment(ctx.aiReviewContext)
        }
        return
      } else if (sequence === "gD!") {
        // spec 036: discard the drafted inline comment.
        if (ctx.getState().draftNotification) {
          void aiReview.handleDiscardDraftedComment(ctx.aiReviewContext)
        }
        return
      } else if (sequence === "gP!" || sequence === "gp!") {
        if (s.appMode === "pr" && s.prInfo) {
          ctx.executeAction("edit-pr")
        } else if (s.appMode === "local") {
          ctx.executeAction("create-pr")
        }
        return
      } else if (sequence === "gr") {
        ctx.refreshContext.handleRefresh()
        return
      } else if (sequence === "gg") {
        recordJump()
        folds.handleGoToTop(ctx.foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        recordJump()
        folds.handleGoToBottom(ctx.foldsContext)
        return
      } else if (sequence === "za") {
        folds.handleToggleFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "zR!" || sequence === "zr!") {
        folds.handleExpandAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zM!" || sequence === "zm!") {
        folds.handleCollapseAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zr") {
        folds.handleExpandAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zm") {
        folds.handleCollapseAllFolds(ctx.foldsContext)
        return
      } else if (sequence === "zo") {
        folds.handleOpenFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "zc") {
        folds.handleCloseFoldAtCursor(ctx.foldsContext)
        return
      } else if (sequence === "g?" || sequence === "g?!") {
        // Open action menu (single source of truth for keybindings)
        ctx.setState(openActionMenu)
        ctx.render()
        return
      }
      if (sequence === "]g") {
        // Next commit
        if (s.commits.length > 0) {
          recordJump()
          if (s.viewingCommit === null) {
            // All → first commit
            ctx.onCommitSelected(s.commits[0]!.sha)
          } else {
            const idx = s.commits.findIndex(c => c.sha === s.viewingCommit)
            if (idx >= s.commits.length - 1) {
              // Last commit → wrap to all
              ctx.onCommitSelected(null)
            } else {
              ctx.onCommitSelected(s.commits[idx + 1]!.sha)
            }
          }
        }
        return
      } else if (sequence === "[g") {
        // Prev commit
        if (s.commits.length > 0) {
          recordJump()
          if (s.viewingCommit === null) {
            // All → last commit
            ctx.onCommitSelected(s.commits[s.commits.length - 1]!.sha)
          } else {
            const idx = s.commits.findIndex(c => c.sha === s.viewingCommit)
            if (idx <= 0) {
              // First commit → wrap to all
              ctx.onCommitSelected(null)
            } else {
              ctx.onCommitSelected(s.commits[idx - 1]!.sha)
            }
          }
        }
        return
      }
      if (sequence === "]c") {
        ctx.vimHandler.moveToHunk("next")
        ctx.render()
        return
      } else if (sequence === "[c") {
        ctx.vimHandler.moveToHunk("prev")
        ctx.render()
        return
      }
      // Other sequences handled by vim handler
    }

    if (key.name === "]" || key.name === "[" || (key.name === "g" && !key.shift) || (key.name === "z" && !key.shift)) {
      pendingKey = key.name
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return
    }

    // ========== TREE PANEL FOCUSED ==========
    if (
      fileTreeFeature.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: () => ctx.fileTreePanel,
        updatePanel: ctx.updateFileTreePanel,
        onFileSelected: () => {
          ctx.setVimState(createCursorState())
          ctx.rebuildLineMapping()
        },
        toggleViewedForFile: (filename: string) =>
          fileNavigation.toggleViewedForFile(filename, ctx.fileNavContext),
        recordJump,
      })
    ) {
      return
    }


    // ========== DIFF VIEW FOCUSED ==========
    diffView.handleInput(key, {
      state: ctx.getState(),
      getVimState: ctx.getVimState,
      setVimState: ctx.setVimState,
      vimHandler: ctx.vimHandler,
      vimDiffView: ctx.vimDiffView,
      searchState: ctx.getSearchState(),
      searchHandler: ctx.searchHandler,
      getCurrentComment: () => commentsFeature.getCurrentComment(ctx.commentsContext),
      handleAddComment: () => commentsFeature.handleAddComment(ctx.commentsContext),
      handleExpandDivider: ctx.handleExpandDivider,
      handleToggleViewed: (advanceToNext: boolean) =>
        fileNavigation.handleToggleViewed(advanceToNext, ctx.fileNavContext),
      handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(ctx.commentsContext),
      handleOpenInlineOverlay: (mode) => {
        // spec 039: Enter opens the overlay in view mode if there's an
        // existing thread on this anchor; `c` opens it in compose mode
        // on any commentable line. Returns true when the overlay was
        // opened so the caller can fall back (e.g. Enter → expand
        // divider) when this is a no-op.
        const s = ctx.getState()
        const lineMapping = ctx.getLineMapping()
        const vimState = ctx.getVimState()
        const anchor = lineMapping.getCommentAnchor(vimState.line)
        if (!anchor) return false

        if (mode === "view") {
          const hasRoot = s.comments.some(
            (c) =>
              c.filename === anchor.filename &&
              c.line === anchor.line &&
              c.side === anchor.side &&
              !c.inReplyTo
          )
          if (!hasRoot) return false
        }

        ctx.setState((st) =>
          openInlineCommentOverlay(st, anchor.filename, anchor.line, anchor.side, mode)
        )
        ctx.render()
        return true
      },
      handleOpenPanelView: () => {
        // Open in view mode without an anchor — use the cursor's file
        // (or the currently selected file) so the panel scopes
        // correctly. Anchor line is 0; compose actions inside the
        // panel will re-anchor to the highlighted thread.
        const s = ctx.getState()
        const lineMapping = ctx.getLineMapping()
        const vimState = ctx.getVimState()
        const cursorLine = lineMapping.getLine(vimState.line)
        const filename =
          cursorLine?.filename ??
          (s.selectedFileIndex !== null
            ? s.files[s.selectedFileIndex]?.filename ?? ""
            : "")
        ctx.setState((st) =>
          openInlineCommentOverlay(st, filename, 0, "RIGHT", "view")
        )
        ctx.render()
      },
      handleClosePanel: () => {
        ctx.setState((st) => closeInlineCommentOverlay(st))
        ctx.render()
      },
    })
  }
}
