/**
 * Global key handling
 *
 * Dispatches keyboard events to feature modules. Features are checked in priority order:
 * modal overlays first, then global shortcuts, then panel-specific handlers.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../state"
import { openActionMenu, openFilePicker, toggleFilePanel, toggleViewMode } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { VimMotionHandler } from "../vim-diff/motion-handler"
import type { SearchHandler } from "../vim-diff/search-handler"
import type { VimDiffView } from "../components"
import type { PRInfoPanelClass } from "../components"
import type { FileTreePanel } from "../components/FileTreePanel"
import type { CommentsViewPanel } from "../components/CommentsViewPanel"
import { createCursorState } from "../vim-diff/cursor-state"

import * as actionMenu from "../features/action-menu"
import * as filePicker from "../features/file-picker"
import * as prInfoPanelFeature from "../features/pr-info-panel"
import * as syncPreview from "../features/sync-preview"
import * as reviewPreview from "../features/review-preview"
import * as search from "../features/search"
import * as fileTreeFeature from "../features/file-tree"
import * as commentsView from "../features/comments-view"
import * as diffView from "../features/diff-view"
import * as folds from "../features/folds"
import * as fileNavigation from "../features/file-navigation"
import * as commentsFeature from "../features/comments"
import * as externalTools from "../features/external-tools"
import * as prOperations from "../features/pr-operations"

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
  commentsViewPanel: CommentsViewPanel
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
        setState: ctx.setState,
        render: ctx.render,
        executeAction: ctx.executeAction,
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
      })
    ) {
      return
    }

    // ========== PR INFO PANEL (captures all input when open) ==========
    if (
      prInfoPanelFeature.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: ctx.getPrInfoPanel,
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

    // ========== SEARCH INPUT (captures input when search prompt is active) ==========
    if (search.handleInput(key, { searchState: ctx.getSearchState(), searchHandler: ctx.searchHandler })) {
      return
    }

    // ========== GLOBAL KEYS (work in any mode) ==========
    const state = ctx.getState()
    switch (key.name) {
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

      case "q":
        ctx.quit()
        return

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

      case "tab":
        ctx.setState(toggleViewMode)
        ctx.render()
        return

      case "backspace":
        // Ctrl+h produces backspace in most terminals
        if (state.showFilePanel && state.mode === "normal" && state.focusedPanel !== "tree") {
          ctx.setState((s) => ({ ...s, focusedPanel: "tree" }))
          ctx.render()
          return
        }
        break

      case "l":
        if (key.ctrl) {
          ctx.setState((s) => ({
            ...s,
            focusedPanel: s.viewMode === "diff" ? "diff" : "comments",
          }))
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
        fileNavigation.navigateFileSelection(1, ctx.fileNavContext)
        return
      } else if (sequence === "[f") {
        fileNavigation.navigateFileSelection(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]u") {
        fileNavigation.navigateToUnviewedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[u") {
        fileNavigation.navigateToUnviewedFile(-1, ctx.fileNavContext)
        return
      } else if (sequence === "]o") {
        fileNavigation.navigateToOutdatedFile(1, ctx.fileNavContext)
        return
      } else if (sequence === "[o") {
        fileNavigation.navigateToOutdatedFile(-1, ctx.fileNavContext)
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
      } else if (sequence === "gR!" || sequence === "gr!") {
        ctx.refreshContext.handleRefresh()
        return
      } else if (sequence === "gg") {
        folds.handleGoToTop(ctx.foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
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

    if (key.name === "]" || key.name === "[" || key.name === "g" || key.name === "z") {
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
      })
    ) {
      return
    }

    // ========== COMMENTS VIEW FOCUSED ==========
    if (
      commentsView.handleInput(key, {
        state: ctx.getState(),
        setState: ctx.setState,
        render: ctx.render,
        getPanel: () => ctx.commentsViewPanel,
        getVimState: ctx.getVimState,
        setVimState: ctx.setVimState,
        getLineMapping: ctx.getLineMapping,
        rebuildLineMapping: () => {
          ctx.setVimState(createCursorState())
          ctx.rebuildLineMapping()
          return ctx.getLineMapping()
        },
        ensureCursorVisible: ctx.ensureCursorVisible,
        handleAddComment: () => commentsFeature.handleAddComment(ctx.commentsContext),
        handleSubmitSingleComment: (comment) =>
          commentsFeature.handleSubmitSingleComment(ctx.commentsContext, comment),
        handleToggleThreadResolved: () =>
          prOperations.handleToggleThreadResolved(ctx.prOperationsContext),
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
    })
  }
}
