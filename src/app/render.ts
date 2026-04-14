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
  DraftNotification,
  DraftReviewDialog,
  gatherSyncItems,
} from "../components"
import type { VimDiffView } from "../components"
import type { FileTreePanel } from "../components/FileTreePanel"
import type { CommentsViewPanel } from "../components/CommentsViewPanel"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import { getSelectedFile, getVisibleComments, getReviewProgress, getThreadPreviewComments } from "../state"
import type { AppState } from "../state"
import { filterCommentsBySearch } from "../features/comments-view/search"
import type { VimCursorState } from "../vim-diff/types"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { CommentsSearchState } from "../state"
import { theme } from "../theme"
import { getAvailableActions } from "../actions"
import { fuzzyFilter } from "../utils/fuzzy"
import * as filePicker from "../features/file-picker"
import * as commitPicker from "../features/commit-picker"
import * as commentsFeature from "../features/comments"
import { getSubmenuRows } from "../features/action-menu"
import type { ActionMenuMode } from "../components"

export interface RenderContext {
  // Mutable state accessors
  getState: () => AppState
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getCachedCurrentUser: () => string | null
  /** Returns the persistent PRInfoPanel instance (PR mode only; null in local mode). */
  getPrInfoPanel: () => PRInfoPanelClass | null
  // UI panels
  renderer: CliRenderer
  fileTreePanel: FileTreePanel
  vimDiffView: VimDiffView
  commentsViewPanel: CommentsViewPanel
  // Helper
  updateFileTreePanel: () => void
}

/**
 * Comments search prompt — shown at the bottom of the screen (like diff SearchPrompt)
 */
function CommentsSearchPrompt({ searchState }: { searchState: CommentsSearchState }) {
  const prefix = "/"
  const displayText = searchState.active
    ? `${prefix}${searchState.query}`
    : `${prefix}${searchState.query}`

  return Box(
    {
      height: 1,
      width: "100%",
      backgroundColor: theme.surface0,
      flexDirection: "row",
      paddingLeft: 1,
    },
    Text({
      content: displayText,
      fg: theme.text,
    }),
    searchState.active
      ? Text({ content: "█", fg: theme.text })
      : null,
  )
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
    let visibleComments = getVisibleComments(state)

    // Apply comment search filter
    if (state.commentsSearch.query) {
      visibleComments = filterCommentsBySearch(visibleComments, state.commentsSearch.query)
    }

    // Update file tree panel state
    ctx.updateFileTreePanel()

    // Main content based on view mode
    let content
    const prInfoPanelInstance = ctx.getPrInfoPanel()
    if (state.error) {
      content = Text({ content: `Error: ${state.error}`, fg: colors.error })
    } else if (state.viewMode === "pr" && prInfoPanelInstance) {
      // PR overview (spec 041): mount the panel inline next to the tree.
      content = Box(
        {
          id: "main-content-row",
          width: "100%",
          height: "100%",
          flexDirection: "row",
        },
        prInfoPanelInstance.getContainer()
      )
    } else if (state.files.length === 0) {
      content = Text({ content: "No changes to display", fg: colors.textDim })
    } else if (state.viewMode === "comments") {
      ctx.commentsViewPanel.update(
        visibleComments,
        state.selectedCommentIndex,
        selectedFile?.filename ?? null,
        state.commentsSearch.query ? new Set() : state.collapsedThreadIds,
        state.commentsSearch
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
    const availableActions = getAvailableActions(state, ctx.getVimState())
    const filteredActions = state.actionMenu.query
      ? fuzzyFilter(state.actionMenu.query, availableActions, (a) => [a.label, a.id, a.description])
      : availableActions

    // Resolve the palette's render mode. In submenu mode we swap out the
    // action list for the submenu rows (already filtered by query inside
    // getSubmenuRows).
    const actionMenuMode: ActionMenuMode = state.actionMenu.submenu
      ? { kind: "submenu", title: state.actionMenu.submenu.title, rows: getSubmenuRows(state) }
      : { kind: "actions", actions: filteredActions }

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
          : (state.commentsSearch.active || state.commentsSearch.query) && state.viewMode === "comments"
            ? CommentsSearchPrompt({ searchState: state.commentsSearch })
            : null,
        StatusBar({
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
              mode: actionMenuMode,
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
              comments: getThreadPreviewComments(state),
              filename: state.threadPreview.filename,
              line: state.threadPreview.line,
              highlightedIndex: state.threadPreview.highlightedIndex,
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
        state.draftReview
          ? DraftReviewDialog({ review: state.draftReview })
          : null,
        // Hide the corner notification while the review dialog is up so
        // the two overlays don't stack on top of each other.
        state.draftNotification && !state.draftReview
          ? DraftNotification({ notification: state.draftNotification })
          : null,

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

    // Keep the PR-level comment input overlay (a modal *inside* the PR
    // panel) in sync whenever the panel exists — it renders itself only
    // when `commentInputOpen` is true.
    if (prInfoPanelInstance) {
      prInfoPanelInstance.updateCommentInput(
        state.prInfoPanel.commentInputOpen,
        state.prInfoPanel.commentInputText,
        state.prInfoPanel.commentInputLoading,
        state.prInfoPanel.commentInputError
      )
    }
  }
}
