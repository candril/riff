/**
 * App render coordination
 *
 * Creates the main render function that orchestrates all UI updates.
 */

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import {
  Header,
  StatusBar,
  ActionMenu,
  ReviewPreview,
  ThreadPreview,
  Toast,
  FilePicker,
  CommitPicker,
  SyncPreview,
  SearchPrompt,
  ConfirmDialog,
  HelpOverlay,
  gatherSyncItems,
} from "../components"
import type { VimDiffView } from "../components"
import type { FileTreePanel } from "../components/FileTreePanel"
import type { CommentsViewPanel } from "../components/CommentsViewPanel"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import { getSelectedFile, getVisibleComments, getReviewProgress } from "../state"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import { getAvailableActions } from "../actions"
import { fuzzyFilter } from "../utils/fuzzy"
import * as filePicker from "../features/file-picker"
import * as commitPicker from "../features/commit-picker"
import * as commentsFeature from "../features/comments"

export interface RenderContext {
  // Mutable state accessors
  getState: () => AppState
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getCachedCurrentUser: () => string | null
  getPrInfoPanel: () => PRInfoPanelClass | null
  setPrInfoPanel: (panel: PRInfoPanelClass | null) => void
  // UI panels
  renderer: CliRenderer
  fileTreePanel: FileTreePanel
  vimDiffView: VimDiffView
  commentsViewPanel: CommentsViewPanel
  // Helper
  updateFileTreePanel: () => void
}

/**
 * Create the main render function
 */
export function createRenderFunction(ctx: RenderContext): () => void {
  return function render() {
    const state = ctx.getState()
    const vimState = ctx.getVimState()
    const lineMapping = ctx.getLineMapping()
    const searchState = ctx.getSearchState()

    const selectedFile = getSelectedFile(state)
    const visibleComments = getVisibleComments(state)

    // Build hints based on context and view mode
    const hints: string[] = []

    if (searchState.active) {
      hints.push("Enter: confirm", "Esc: cancel", "Type to search...")
    } else if (searchState.pattern && state.viewMode === "diff") {
      hints.push("n: next", "N: prev", "Esc: clear")
    } else {
      hints.push("Tab: view")

      if (state.viewMode === "diff") {
        if (state.files.length > 0) {
          if (vimState.mode === "visual-line") {
            hints.push("c: comment selection", "Esc: cancel")
          } else {
            const currentLine = lineMapping.getLine(vimState.line)
            if (currentLine?.type === "divider") {
              hints.push("Enter: expand")
            }
            hints.push("V: select", "c: comment", "/: search")
          }
        }
        hints.push("j/k/w/b: move")
      } else {
        hints.push("j/k: navigate", "Enter: jump", "x: resolve", "h/l: collapse")
      }

      if (state.showFilePanel) {
        if (state.focusedPanel === "tree") {
          hints.push("Ctrl+l: content")
          if (state.selectedFileIndex !== null) {
            hints.push("Esc: all files")
          }
        } else {
          hints.push("Ctrl+h: tree")
        }
        hints.push("Ctrl+b: hide panel")
      } else {
        hints.push("Ctrl+b: panel")
      }
      hints.push("q: quit")
    }

    // Add hidden files indicator
    const hiddenCount = state.ignoredFiles.size
    if (hiddenCount > 0 && !state.showHiddenFiles) {
      hints.push(`+${hiddenCount} hidden`)
    }

    // Update file tree panel state
    ctx.updateFileTreePanel()

    // Main content based on view mode
    let content
    if (state.error) {
      content = Text({ content: `Error: ${state.error}`, fg: colors.error })
    } else if (state.files.length === 0) {
      content = Text({ content: "No changes to display", fg: colors.textDim })
    } else if (state.viewMode === "comments") {
      ctx.commentsViewPanel.update(
        visibleComments,
        state.selectedCommentIndex,
        selectedFile?.filename ?? null,
        state.collapsedThreadIds
      )

      content = Box(
        {
          id: "main-content-row",
          width: "100%",
          height: "100%",
          flexDirection: "row",
        },
        ctx.commentsViewPanel.getContainer()
      )
    } else {
      // Diff view
      const loadingFiles = new Set<string>()
      for (const [filename, cache] of Object.entries(state.fileContentCache)) {
        if (cache.loading) {
          loadingFiles.add(filename)
        }
      }

      ctx.vimDiffView.update(
        state.files,
        state.selectedFileIndex,
        lineMapping,
        vimState,
        state.comments,
        state.fileStatuses,
        loadingFiles,
        searchState
      )

      content = Box(
        {
          id: "main-content-row",
          width: "100%",
          height: "100%",
          flexDirection: "row",
        },
        ctx.vimDiffView.getContainer()
      )
    }

    // Clear and re-render (preserve indicator renderables and file tree panel)
    const children = ctx.renderer.root.getChildren()
    for (const child of children) {
      if (child.id === "cursor-indicator" || child.id?.startsWith("comment-indicator-")) {
        continue
      }
      if (child.id === "file-tree-panel") {
        continue
      }
      ctx.renderer.root.remove(child.id)
    }

    // Get filtered actions for action menu
    const availableActions = getAvailableActions(state)
    const filteredActions = state.actionMenu.query
      ? fuzzyFilter(state.actionMenu.query, availableActions, (a) => [a.label, a.id, a.description])
      : availableActions

    // Get filtered files for file picker
    const filteredFiles = filePicker.getFilteredFiles(state)

    // Get filtered commits for commit picker
    const filteredCommits = commitPicker.getFilteredCommits(state)

    const cachedCurrentUser = ctx.getCachedCurrentUser()

    ctx.renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        Header({
          title: "riff",
          selectedFile,
          totalFiles: state.files.length,
          prInfo: state.prInfo,
          reviewProgress: getReviewProgress(state),
          branchInfo: state.branchInfo,
          viewingCommit: state.viewingCommit,
          commits: state.commits,
        }),
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        (searchState.active || searchState.pattern) && state.viewMode === "diff"
          ? SearchPrompt({ searchState })
          : null,
        StatusBar({
          hints,
          searchInfo:
            searchState.pattern && state.viewMode === "diff"
              ? {
                  current: searchState.currentMatchIndex + 1,
                  total: searchState.matches.length,
                  pattern: searchState.pattern,
                  wrapped: searchState.wrapped,
                }
              : null,
        }),
        state.actionMenu.open
          ? ActionMenu({
              query: state.actionMenu.query,
              actions: filteredActions,
              selectedIndex: state.actionMenu.selectedIndex,
            })
          : null,
        state.toast.message
          ? Toast({
              message: state.toast.message,
              type: state.toast.type,
            })
          : null,
        state.reviewPreview.open
          ? ReviewPreview({
              comments: commentsFeature.validateCommentsForSubmit(
                state.comments.filter(
                  (c) => (c.status === "local" || c.status === "pending") && !c.inReplyTo
                ),
                state.files
              ),
              state: state.reviewPreview,
              isOwnPr: state.prInfo !== null && cachedCurrentUser === state.prInfo.author,
            })
          : null,
        state.syncPreview.open
          ? SyncPreview({
              items: gatherSyncItems(state.comments),
              state: state.syncPreview,
            })
          : null,
        state.threadPreview.open
          ? ThreadPreview({
              comments: state.threadPreview.comments,
              filename: state.threadPreview.filename,
              line: state.threadPreview.line,
              renderer: ctx.renderer,
            })
          : null,
        state.filePicker.open
          ? FilePicker({
              query: state.filePicker.query,
              files: filteredFiles,
              selectedIndex: state.filePicker.selectedIndex,
            })
          : null,
        state.commitPicker.open
          ? CommitPicker({
              query: state.commitPicker.query,
              commits: filteredCommits,
              selectedIndex: state.commitPicker.selectedIndex,
              viewingCommit: state.viewingCommit,
            })
          : null,
        state.confirmDialog
          ? ConfirmDialog({
              title: state.confirmDialog.title,
              message: state.confirmDialog.message,
              details: state.confirmDialog.details,
            })
          : null,
        state.showHelp ? HelpOverlay({}) : null,
      )
    )

    // Insert file tree panel into the content row as first child
    if (state.files.length > 0) {
      const contentRow = ctx.renderer.root.findDescendantById("main-content-row")
      if (contentRow && ctx.fileTreePanel.getContainer().parent !== contentRow) {
        const firstChild = contentRow.getChildren()[0]
        if (firstChild) {
          contentRow.insertBefore(ctx.fileTreePanel.getContainer(), firstChild)
        } else {
          contentRow.add(ctx.fileTreePanel.getContainer())
        }
      }
    }

    // Add PR info panel overlay if open
    const prInfoPanel = ctx.getPrInfoPanel()
    if (state.prInfoPanel.open && prInfoPanel) {
      if (!prInfoPanel.getContainer().parent) {
        ctx.renderer.root.add(prInfoPanel.getContainer())
      }
    } else if (prInfoPanel && prInfoPanel.getContainer().parent) {
      prInfoPanel.destroy()
      ctx.setPrInfoPanel(null)
    }
  }
}
