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
  InlineCommentOverlay,
  Toast,
  FilePicker,
  CommentsPicker,
  CommitPicker,
  SyncPreview,
  SearchPrompt,
  FlashPrompt,
  HelpOverlay,
  LinePeek,
  TablePeek,
  DiagramPeek,
  HunkPeek,
  ConfirmDialog,
  DraftNotification,
  FeedView,
  gatherSyncItems,
} from "../components"
import { syncComposerSession, endComposerSession } from "../components/CommentComposer"
import { syncPromptSession, endPromptSession } from "../components/PromptInput"
import { reviewCandidates } from "../utils/publishable"
import {
  collectMentionCandidates,
  detectMentionTrigger,
} from "../utils/mentions"
import {
  setMentionPicker,
  setActionMenuQuery,
  setFilePickerQuery,
  setCommentsPickerQuery,
  setCommitPickerQuery,
  setViewFilter,
  markCommentsSeen,
  unseenIn,
  visibleFeedEvents,
  visibleFeedRows,
} from "../state"
import { requestMentionSearch } from "../features/mentions"
import {
  syncReviewSummarySession,
  endReviewSummarySession,
} from "../components/ReviewSummaryComposer"
import type { VimDiffView } from "../components"
import { getFiletypeFromPath } from "../components/VimDiffView"
import { buildTablePeek } from "../features/diff-view/table-peek"
import { mergeReading } from "../utils/merge-verdict"
import { buildMermaidPeek } from "../features/diff-view/mermaid-peek"
import { commentHunk } from "../features/inline-comment-overlay/hunk"
import type { FileTreePanel } from "../components/FileTreePanel"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import { getSelectedFile, getVisibleComments, getReviewProgress, getInlineCommentOverlayComments, getCommentsPanelScopeFilename, commentDraftFor } from "../state"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { getSelectionRange } from "../vim-diff/cursor-state"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import type { FlashState } from "../vim-diff/flash-state"
import { getAvailableActions } from "../actions"
import { fuzzyFilter } from "../utils/fuzzy"
import * as filePicker from "../features/file-picker"
import * as commentsPickerFeature from "../features/comments-picker"
import * as commitPicker from "../features/commit-picker"
import * as commentsFeature from "../features/comments"
import { getSubmenuRows } from "../features/action-menu"
import type { ActionMenuMode } from "../components"

export interface RenderContext {
  // Mutable state accessors
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  getVimState: () => VimCursorState
  getLineMapping: () => DiffLineMapping
  getSearchState: () => SearchState
  getFlashState: () => FlashState
  getCachedCurrentUser: () => string | null
  /** Returns the persistent PRInfoPanel instance (PR mode only; null in local mode). */
  getPrInfoPanel: () => PRInfoPanelClass | null
  // UI panels
  renderer: CliRenderer
  fileTreePanel: FileTreePanel
  vimDiffView: VimDiffView
  // Helper
  updateFileTreePanel: () => void
  /** Incremental search reacting to what the prompt field reports (spec 065). */
  updateSearchPattern: (value: string) => void
}

/**
 * Which prompt is typing right now, and what it does with what is typed.
 * Every one-line prompt in riff shares a single input field, so at most one
 * of these can be open (spec 065).
 */
function openPrompt(
  state: AppState,
  ctx: RenderContext,
  render: () => void
): { key: string; initialValue: string; placeholder?: string; onChange: (value: string) => void } | null {
  const typeInto = (
    set: (s: AppState, value: string) => AppState
  ): ((value: string) => void) => (value) => {
    ctx.setState((s) => set(s, value))
    render()
  }

  if (state.actionMenu.open) {
    return {
      key: `action-menu:${state.actionMenu.submenu?.kind ?? ""}`,
      initialValue: state.actionMenu.query,
      placeholder: "Search",
      onChange: typeInto(setActionMenuQuery),
    }
  }
  if (state.filePicker.open) {
    return {
      key: "file-picker",
      initialValue: state.filePicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setFilePickerQuery),
    }
  }
  if (state.commentsPicker.open) {
    return {
      key: "comments-picker",
      initialValue: state.commentsPicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setCommentsPickerQuery),
    }
  }
  if (state.commitPicker.open) {
    return {
      key: "commit-picker",
      initialValue: state.commitPicker.query,
      placeholder: "Type to search commits…",
      onChange: typeInto(setCommitPickerQuery),
    }
  }

  if (state.inlineCommentOverlay.filterInput) {
    return {
      key: "comments-filter",
      initialValue: state.inlineCommentOverlay.filter,
      placeholder: "filter comments…",
      onChange: typeInto(setViewFilter),
    }
  }
  if (state.feed.filterInput) {
    return {
      key: "feed-filter",
      initialValue: state.feed.filter,
      placeholder: "filter the feed…",
      onChange: typeInto(setViewFilter),
    }
  }

  const searchState = ctx.getSearchState()
  if (searchState.active) {
    return {
      // A fresh prompt seeds the field; typing into the same one does not.
      key: `search:${searchState.direction}:${searchState.originalLine}:${searchState.originalCol}`,
      initialValue: searchState.promptValue,
      onChange: (value) => ctx.updateSearchPattern(value),
    }
  }

  return null
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
    const flashState = ctx.getFlashState()

    ctx.vimDiffView.setFlashState(flashState)

    const selectedFile = getSelectedFile(state)
    const visibleComments = getVisibleComments(state)

    // Update file tree panel state
    ctx.updateFileTreePanel()

    // Main content based on view mode
    let content
    const prInfoPanelInstance = ctx.getPrInfoPanel()
    if (state.error) {
      content = Text({ content: `Error: ${state.error}`, fg: colors.error })
    } else if (state.viewMode === "state" && prInfoPanelInstance) {
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
    } else if (state.viewMode === "feed") {
      const feedEvents = visibleFeedEvents(state)
      const feedRows = visibleFeedRows(state)
      content = Box(
        {
          id: "main-content-row",
          width: "100%",
          height: "100%",
          flexDirection: "row",
        },
        FeedView({
          events: feedEvents,
          rows: feedRows,
          feed: state.feed,
          unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
          flashLabels:
            flashState.active && flashState.surface === "feed"
              ? new Map(flashState.rows.map((row) => [Number(row.id), row.label]))
              : new Map(),
          renderer: ctx.renderer,
          loading: state.feed.loading,
        })
      )
    } else if (state.files.length === 0) {
      content = Text({ content: "No changes to display", fg: colors.textDim })
    } else {
      // Diff view
      ctx.vimDiffView.setWrap(state.wrapLines)
      ctx.vimDiffView.update(
        state.files,
        state.selectedFileIndex,
        lineMapping,
        vimState,
        state.comments,
        state.fileStatuses,
        state.expandingDivider,
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
    const submenu = state.actionMenu.submenu
    const actionMenuMode: ActionMenuMode = submenu
      ? {
          kind: "submenu",
          title: submenu.title,
          // A list of links can do two things with the one you pick, and
          // only one of them is Enter — which one depends on the key that
          // opened the list (spec 077).
          hint:
            submenu.kind === "links"
              ? submenu.action === "copy"
                ? "enter copy · esc"
                : "enter open · ctrl-y copy · esc"
              : undefined,
          rows: getSubmenuRows(state),
        }
      : { kind: "actions", actions: filteredActions }

    // Get filtered files for file picker
    const filteredFiles = filePicker.getFilteredFiles(state)

    // Get filtered commits for commit picker
    const filteredCommits = commitPicker.getFilteredCommits(state)

    const cachedCurrentUser = ctx.getCachedCurrentUser()

    // Drive the composer textarea's lifecycle from overlay state. We do
    // this BEFORE building the next tree so the textarea is focused /
    // seeded by the time it's mounted into the layout. Suspending the
    // diff view's terminal-cursor post-process keeps the textarea's
    // cursor visible — otherwise the diff would re-claim it after the
    // textarea's renderCursor pass.
    {
      const ov = state.inlineCommentOverlay
      const composerActive =
        ov.open && (ov.mode === "compose" || ov.mode === "edit")
      if (composerActive) {
        const key = `${ov.filename}:${ov.line}:${ov.mode}:${ov.editingId ?? ""}`
        syncComposerSession(
          ctx.renderer,
          key,
          ov.input,
          ov.mode as "compose" | "edit",
          (text, cursorOffset) => {
            // Detect `@<query>` against the live textarea state. The
            // mention picker is feature-gated to PR mode (no candidates
            // in local diff review) — `setMentionPicker` short-circuits
            // when there's nothing to set.
            const trigger = detectMentionTrigger(text, cursorOffset)
            ctx.setState((s) => setMentionPicker(s, trigger))
            if (trigger) {
              // Widen the pool for fragments the cached roster can't cover
              // (large orgs) — debounced, so this is a no-op most keystrokes.
              requestMentionSearch(
                { setState: ctx.setState, render },
                trigger.query,
                collectMentionCandidates(ctx.getState()),
              )
            }
            render()
          }
        )
      } else {
        endComposerSession()
      }

      // Same dance for the review summary textarea — it owns the live
      // value while the modal is open, and mirrors back into
      // `state.reviewPreview.body` so canSubmit stays accurate.
      const reviewActive = state.reviewPreview.open
      if (reviewActive) {
        syncReviewSummarySession(
          ctx.renderer,
          // The session resets only when the modal closes/reopens;
          // section toggles just flip focus.
          "review-preview-open",
          state.reviewPreview.body,
          state.reviewPreview.focusedSection === "input",
          (value) => {
            ctx.setState((s) =>
              s.reviewPreview.open && s.reviewPreview.body !== value
                ? { ...s, reviewPreview: { ...s.reviewPreview, body: value } }
                : s
            )
            // Trigger a re-render so the footer's submit-enabled state
            // reflects the new body. The session-key short-circuit
            // prevents this from looping back into setText.
            render()
          }
        )
      } else {
        endReviewSummarySession()
      }

      // What is on screen has been read (spec 069): the comments the panel
      // is showing, and the threads of an open Conversation section. Being
      // in the PR is not the same as having read it, so nothing else counts.
      if (state.visit) {
        const seen: string[] = []
        if (state.inlineCommentOverlay.open) {
          for (const comment of getInlineCommentOverlayComments(state)) seen.push(comment.id)
        }
        if (state.viewMode === "state" && prInfoPanelInstance?.isSectionExpandedNamed("conversation")) {
          for (const comment of state.comments) seen.push(comment.id)
        }
        ctx.setState((s) => markCommentsSeen(s, seen))
      }

      // Flash labels, painted by whichever surface is being labelled
      // (spec 066). The diff draws its own, straight onto the frame.
      prInfoPanelInstance?.setFlashLabels(
        flashState.active && flashState.surface === "state"
          ? new Map(flashState.rows.map((row) => [row.id, row.label]))
          : new Map()
      )

      // The info panel's filter box is the panel's own, like the tree's:
      // both are persistent panels rather than overlays rebuilt per render.
      prInfoPanelInstance?.syncFilterInput(
        state.prInfoPanel.filterInput,
        state.prInfoPanel.filter
      )
      prInfoPanelInstance?.setFilter(state.prInfoPanel.filter)

      // And the one-line prompts (spec 065). They all type into the same
      // field, so exactly one session can be open — whichever prompt is.
      const prompt = openPrompt(state, ctx, render)
      if (prompt) syncPromptSession({ renderer: ctx.renderer, ...prompt })
      else endPromptSession()

      ctx.vimDiffView.setSuspendCursor(composerActive || reviewActive || prompt !== null)
    }

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
          viewingCommitFrom: state.viewingCommitFrom,
          branchPr: state.branchPr,
          commits: state.commits,
          lastRefreshedAt: state.lastRefreshedAt,
          merge: state.prInfo
            ? mergeReading(state.prInfo, state.prInfo.checks ?? [], state.comments)
            : null,
        }),
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        flashState.active && state.viewMode === "diff"
          ? FlashPrompt({ flashState })
          : (searchState.active || searchState.pattern) && state.viewMode === "diff"
            ? SearchPrompt({ searchState, renderer: ctx.renderer })
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
          columnInfo:
            state.viewMode === "diff"
              ? ctx.vimDiffView.getColumnStatus(vimState.line, vimState.col)
              : null,
          selectionInfo: selectionStatus(vimState),
          commitScoped: state.viewMode === "diff" && state.viewingCommit !== null,
        }),
        state.actionMenu.open
          ? ActionMenu({
              renderer: ctx.renderer,
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
                reviewCandidates(state.comments),
                state.files
              ),
              state: state.reviewPreview,
              isOwnPr: state.prInfo !== null && cachedCurrentUser === state.prInfo.author,
              renderer: ctx.renderer,
            })
          : null,
        state.syncPreview.open
          ? SyncPreview({
              items: gatherSyncItems(state.comments),
              state: state.syncPreview,
            })
          : null,
        state.inlineCommentOverlay.open
          ? InlineCommentOverlay({
              comments: getInlineCommentOverlayComments(state),
              scopeFilename: getCommentsPanelScopeFilename(state),
              composeFilename: state.inlineCommentOverlay.filename,
              line: state.inlineCommentOverlay.line,
              mode: state.inlineCommentOverlay.mode,
              appMode: state.appMode,
              highlightedIndex: state.inlineCommentOverlay.highlightedIndex,
              editingId: state.inlineCommentOverlay.editingId,
              draft: commentDraftFor(
                state,
                state.inlineCommentOverlay.filename,
                state.inlineCommentOverlay.line,
                state.inlineCommentOverlay.side
              ),
              focused: state.focusedPanel === "comments",
              expanded: state.inlineCommentOverlay.expanded,
              mentionPicker: state.inlineCommentOverlay.mentionPicker,
              mentionCandidates: collectMentionCandidates(state),
              mentionSearchQuery: state.mentionSearchQuery,
              expandedThreadIds: state.inlineCommentOverlay.expandedThreadIds,
              unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
              filter: state.inlineCommentOverlay.filter,
              filterInput: state.inlineCommentOverlay.filterInput,
              flashLabels:
                flashState.active && flashState.surface === "comments"
                  ? new Map(flashState.rows.map((row) => [row.id, row.label]))
                  : new Map(),
              renderer: ctx.renderer,
            })
          : null,
        state.filePicker.open
          ? FilePicker({
              renderer: ctx.renderer,
              files: filteredFiles,
              selectedIndex: state.filePicker.selectedIndex,
            })
          : null,
        state.commentsPicker.open
          ? CommentsPicker({
              renderer: ctx.renderer,
              entries: commentsPickerFeature.getFilteredEntries(state),
              selectedIndex: state.commentsPicker.selectedIndex,
            })
          : null,
        state.commitPicker.open
          ? CommitPicker({
              renderer: ctx.renderer,
              commits: filteredCommits,
              selectedIndex: state.commitPicker.selectedIndex,
              viewingCommit: state.viewingCommit,
              marked: (index) => commitPicker.inMarkedSpan(state, filteredCommits, index),
            })
          : null,
        state.showHelp ? HelpOverlay() : null,
        state.showLinePeek && state.viewMode === "diff"
          ? (() => {
              // A mermaid block is source for a picture; the peek draws the
              // picture (spec 058).
              const diagram = buildMermaidPeek(lineMapping, vimState.line, state.peekSide)
              if (diagram) {
                return DiagramPeek({
                  lines: diagram.lines,
                  source: diagram.source,
                  kind: diagram.kind,
                  side: diagram.side,
                  hasOther: diagram.hasOther,
                  note: diagram.note,
                  scroll: state.peekScroll,
                  terminalWidth: ctx.renderer.width,
                  terminalHeight: ctx.renderer.height,
                })
              }

              // A table row on its own is the least readable line in the
              // file; the peek shows the table it belongs to instead.
              const table = buildTablePeek(
                lineMapping,
                vimState.line,
                Math.max(24, ctx.renderer.width - 8),
                state.peekSide
              )
              if (table) {
                return TablePeek({
                  lines: table.lines,
                  rowCount: table.rowCount,
                  side: table.side,
                  hasOther: table.hasOther,
                  scroll: state.peekScroll,
                  terminalWidth: ctx.renderer.width,
                  terminalHeight: ctx.renderer.height,
                })
              }

              const line = lineMapping.getLine(vimState.line)
              return line
                ? LinePeek({
                    // The file's own text: the padding an aligned table
                    // carries is there to line up columns in the diff, and
                    // in a wrapped overlay it is only whitespace.
                    content: line.sourceContent ?? line.content,
                    lineNumber: line.newLineNum ?? line.oldLineNum,
                    filetype: line.filename ? getFiletypeFromPath(line.filename) : undefined,
                    terminalWidth: ctx.renderer.width,
                    terminalHeight: ctx.renderer.height,
                  })
                : null
            })()
          : null,
        state.inlineCommentOverlay.open && state.inlineCommentOverlay.codePeekId !== null
          ? (() => {
              // Over the panel, not the diff: the comment is in the panel and
              // the code it was written against may be nowhere else (spec 060).
              const hunk = commentHunk(
                getInlineCommentOverlayComments(state),
                state.inlineCommentOverlay.codePeekId
              )
              return hunk
                ? HunkPeek({
                    hunk: hunk.hunk,
                    filename: hunk.filename,
                    line: hunk.line,
                    outdated: hunk.outdated,
                    fromRoot: hunk.fromRoot,
                    terminalWidth: ctx.renderer.width,
                    terminalHeight: ctx.renderer.height,
                  })
                : null
            })()
          : null,
        state.confirmDialog
          ? ConfirmDialog({
              title: state.confirmDialog.title,
              message: state.confirmDialog.message,
              details: state.confirmDialog.details,
            })
          : null,
        state.draftNotification
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

/**
 * What the status bar says about a live selection, or nothing when there
 * isn't one.
 */
function selectionStatus(
  vimState: VimCursorState
): { mode: "visual" | "visual-line"; lines: number } | null {
  const range = getSelectionRange(vimState)
  if (!range || vimState.mode === "normal") return null
  return { mode: vimState.mode, lines: range[1] - range[0] + 1 }
}
