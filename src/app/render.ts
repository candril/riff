/**
 * App render coordination
 *
 * Creates the main render function that orchestrates all UI updates.
 */

import { Box, Text } from "@opentui/core"
import type { CliRenderer } from "@opentui/core"
import {
  ActionMenu,
  ReviewPreview,
  InlineCommentOverlay,
  FilePicker,
  CommentsPicker,
  MarksPicker,
  OccurrencePicker,
  CommitPicker,
  SyncPreview,
  FeedView,
  gatherSyncItems,
} from "../components"
import { syncComposerSession, endComposerSession } from "../components/CommentComposer"
import { syncPromptSession, endPromptSession } from "../components/PromptInput"
import { discard } from "../utils/renderables"
import { reviewCandidates } from "../utils/publishable"
import {
  collectMentionCandidates,
  detectMentionTrigger,
} from "../utils/mentions"
import { detectEmojiTrigger } from "../utils/emoji"
import {
  setMentionPicker,
  setEmojiPicker,
  setActionMenuQuery,
  setFilePickerQuery,
  setCommentsPickerQuery,
  setOccurrencePickerQuery,
  setOccurrencePickerFilter,
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
import { mergeReading } from "../utils/merge-verdict"
import { version } from "../version"
import { headerModel } from "../components/header-model"
import type { HeaderIsland } from "./header"
import { flashPromptModel, searchPromptModel } from "../components/prompt-line-model"
import type { FlashPromptIsland, SearchPromptIsland } from "./prompt-line"
import { draftNotificationModel, toastModel } from "../components/notification-model"
import { DRAFT_INNER_WIDTH } from "../components/DraftNotification"
import type { DraftNotificationIsland, ToastIsland } from "./notifications"
import { confirmDialogModel } from "../components/confirm-dialog-model"
import type { ConfirmDialogIsland } from "./confirm-dialog"
import { helpOverlayModel } from "../components/help-overlay-model"
import type { HelpOverlayIsland } from "./help-overlay"
import type { PeekIsland } from "./peek-island"
import { diffPeekModel, hunkPeekModel } from "./peeks"
import { commentPanelWidth } from "../features/inline-comment-overlay"
import type { FileTreePanel } from "../components/FileTreePanel"
import type { StatusBarIsland } from "./status-bar"
import type { SplitDiff } from "./split-diff"
import type { UnifiedDiff } from "./unified-diff"
import type { PRInfoPanelClass } from "../components"
import { colors } from "../theme"
import { getSelectedFile, getVisibleComments, getReviewProgress, getInlineCommentOverlayComments, getCommentsPanelScopeFilename, commentDraftFor } from "../state"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { selectionStatus } from "./selection-status"
import type { FileParses } from "../vim-diff/file-parses"
import type { DiffLineMapping } from "../vim-diff/line-mapping"
import type { SearchState } from "../vim-diff/search-state"
import { flashLabelsOn, type FlashState } from "../vim-diff/flash-state"
import { getAvailableActions } from "../actions"
import { submenuOpenedFromPalette } from "../actions/types"
import { fuzzyFilter } from "../utils/fuzzy"
import * as filePicker from "../features/file-picker"
import * as commentsPickerFeature from "../features/comments-picker"
import { marksPickerEntries, setMarksPickerQuery } from "../features/marks"
import * as occurrencePickerFeature from "../features/occurrence-picker"
import * as commitPicker from "../features/commit-picker"
import * as commentsFeature from "../features/comments"
import { getSubmenuRows } from "../features/action-menu"
import type { ActionMenuMode } from "../components"
import { diffColumnStatus, splitOn as isSplitOn } from "./column-status"
import { composerOpen, diffCursorShown } from "./diff-focus"
import { mainContentRow } from "./content-row"

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
  statusBar: StatusBarIsland
  header: HeaderIsland
  searchPrompt: SearchPromptIsland
  flashPrompt: FlashPromptIsland
  toast: ToastIsland
  draftNotification: DraftNotificationIsland
  confirmDialog: ConfirmDialogIsland
  helpOverlay: HelpOverlayIsland
  diffPeek: PeekIsland
  hunkPeek: PeekIsland
  split: SplitDiff
  unified: UnifiedDiff
  /** The files' own text and their parses, which both diff views colour rows from. */
  parses: FileParses
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
  if (state.marksPicker.open) {
    return {
      key: "marks-picker",
      initialValue: state.marksPicker.query,
      placeholder: "Type to search…",
      onChange: typeInto(setMarksPickerQuery),
    }
  }
  if (state.occurrencePicker.open) {
    return state.occurrencePicker.narrowing
      ? {
          key: "occurrence-picker:narrow",
          initialValue: state.occurrencePicker.filter,
          placeholder: "Narrow by path or text, !term to drop…",
          onChange: typeInto(setOccurrencePickerFilter),
        }
      : {
          key: "occurrence-picker:search",
          initialValue: state.occurrencePicker.query,
          placeholder: "Search the diff…",
          onChange: typeInto(setOccurrencePickerQuery),
        }
  }
  if (state.commitPicker.open && state.commitPicker.queryInput) {
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

    const selectedFile = getSelectedFile(state)
    const visibleComments = getVisibleComments(state)

    // Update file tree panel state
    ctx.updateFileTreePanel()
    // After the panel update, which sets the width the diff pane is measured against.
    const splitOn = isSplitOn(state, ctx.split)

    const ov = state.inlineCommentOverlay
    const composerActive = composerOpen(state)
    const reviewActive = state.reviewPreview.open
    const prompt = openPrompt(state, ctx, render)
    const diffFocused = diffCursorShown(state, prompt !== null)

    // Main content based on view mode. The row around it is built once the
    // thread panel is, which has to wait for the composer's session below.
    let view
    let withTree = true
    let unifiedOn = false
    const prInfoPanelInstance = ctx.getPrInfoPanel()
    if (state.error) {
      view = Text({ content: `Error: ${state.error}`, fg: colors.error })
      withTree = false
    } else if (state.viewMode === "state" && prInfoPanelInstance) {
      // PR overview (spec 041): mount the panel inline next to the tree.
      view = prInfoPanelInstance.getContainer()
    } else if (state.viewMode === "feed") {
      const feedEvents = visibleFeedEvents(state)
      const feedRows = visibleFeedRows(state)
      view = FeedView({
        events: feedEvents,
        rows: feedRows,
        feed: state.feed,
        unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
        flashLabels: flashLabelsOn(flashState, "feed"),
        renderer: ctx.renderer,
        loading: state.feed.loading,
      })
    } else if (state.files.length === 0) {
      view = Text({ content: "No changes to display", fg: colors.textDim })
      withTree = false
    } else {
      // The text of the files riff has already read, so they can be
      // highlighted as files rather than as the rows on screen (spec 080).
      ctx.parses.set(
        new Map(
          Object.entries(state.fileContentCache).flatMap(([filename, entry]) =>
            entry?.newContent
              ? [[filename, { new: entry.newContent, old: entry.oldContent }] as const]
              : []
          )
        )
      )
      // Fed while split is drawn too, so toggling back has nothing to rebuild.
      ctx.unified.draw({
        mapping: lineMapping,
        state,
        vimState,
        searchState,
        flashState,
        emptyMessage: state.treeFilter ? `No files match /${state.treeFilter}` : "No changes to display",
        focused: diffFocused,
      })
      if (splitOn) ctx.split.draw({ mapping: lineMapping, state, vimState, searchState, flashState })

      view = splitOn ? ctx.split.island.host : ctx.unified.island.host
      unifiedOn = !splitOn
    }
    ctx.unified.syncDrawn(unifiedOn)
    ctx.split.syncDrawn(splitOn, ctx.unified.viewportHeight())

    // Clear and re-render (preserve indicator renderables and file tree panel)
    const children = ctx.renderer.root.getChildren()
    for (const child of children) {
      if (child.id === "cursor-indicator" || child.id?.startsWith("comment-indicator-")) {
        continue
      }
      if (child.id === "file-tree-panel") {
        continue
      }
      discard(child)
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
              : submenuOpenedFromPalette(submenu)
                ? undefined
                : "esc",
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
    // seeded by the time it's mounted into the layout. With the composer
    // open the diff's cursor is not shown (diffFocused false), which keeps
    // the textarea's cursor visible; otherwise the diff would re-claim it
    // after the textarea's renderCursor pass.
    {
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
            // And `:shortcode`, which needs nothing fetched (spec 082).
            ctx.setState((s) => setEmojiPicker(s, detectEmojiTrigger(text, cursorOffset)))
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
      // (spec 066). The diff draws its own in its rows.
      prInfoPanelInstance?.setFlashLabels(flashLabelsOn(flashState, "state"))

      // The info panel's filter box is the panel's own, like the tree's:
      // both are persistent panels rather than overlays rebuilt per render.
      prInfoPanelInstance?.syncFilterInput(
        state.prInfoPanel.filterInput,
        state.prInfoPanel.filter
      )
      prInfoPanelInstance?.setFilter(state.prInfoPanel.filter)

      // And the one-line prompts (spec 065). They all type into the same
      // field, so exactly one session can be open — whichever prompt is.
      if (prompt) syncPromptSession({ renderer: ctx.renderer, ...prompt })
      else endPromptSession()

      if (splitOn) ctx.split.island.update({ focused: diffFocused })
    }

    ctx.statusBar.update({
      searchInfo:
        searchState.pattern && state.viewMode === "diff"
          ? {
              current: searchState.currentMatchIndex + 1,
              total: searchState.matches.length,
              pattern: searchState.pattern,
              wrapped: searchState.wrapped,
            }
          : null,
      columnInfo: diffColumnStatus(splitOn, {
        viewMode: state.viewMode,
        split: ctx.split,
        unified: ctx.unified,
      }),
      // Split counts the rows it draws: a pair row holds a removal and an addition.
      selectionInfo: splitOn ? ctx.split.selectionStatus(vimState) : selectionStatus(vimState),
    })

    const commentPanel = state.inlineCommentOverlay.open
      ? InlineCommentOverlay({
        comments: getInlineCommentOverlayComments(state),
        scopeFilename: getCommentsPanelScopeFilename(state),
        composeFilename: state.inlineCommentOverlay.filename,
        line: state.inlineCommentOverlay.line,
        replyToThread: state.inlineCommentOverlay.replyToThread === true,
        note: state.inlineCommentOverlay.note === true,
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
        width: commentPanelWidth(ctx.renderer.width, state.inlineCommentOverlay.expanded),
        mentionPicker: state.inlineCommentOverlay.mentionPicker,
        emojiPicker: state.inlineCommentOverlay.emojiPicker,
        mentionCandidates: collectMentionCandidates(state),
        mentionSearchQuery: state.mentionSearchQuery,
        expandedThreadIds: state.inlineCommentOverlay.expandedThreadIds,
        unseenIds: new Set(unseenIn(state, state.comments).map((comment) => comment.id)),
        filter: state.inlineCommentOverlay.filter,
        filterInput: state.inlineCommentOverlay.filterInput,
        flashLabels: flashLabelsOn(flashState, "comments"),
        renderer: ctx.renderer,
      })
      : null
    const content = mainContentRow(view, commentPanel, { withTree })

    ctx.header.update({
      ...headerModel({
        title: "riff",
        selectedFile,
        totalFiles: state.files.length,
        prInfo: state.prInfo,
        reviewProgress: getReviewProgress(state),
        branchInfo: state.branchInfo,
        viewingCommit: state.viewingCommit,
        viewingCommitScope: state.viewingCommitScope,
        branchPr: state.branchPr,
        commits: state.commits,
        lastRefreshedAt: state.lastRefreshedAt,
        merge: state.prInfo
          ? mergeReading(state.prInfo, state.prInfo.checks ?? [], state.comments)
          : null,
      }),
      version,
    })

    const searchShown = (searchState.active || !!searchState.pattern) && state.viewMode === "diff"
    ctx.searchPrompt.update(searchShown ? searchPromptModel(searchState) : null)
    const flashShown = flashState.active && state.viewMode === "diff"
    ctx.flashPrompt.update(flashShown ? flashPromptModel(flashState) : null)
    ctx.toast.update(state.toast.message ? toastModel(state.toast.message, state.toast.type) : null)
    ctx.draftNotification.update(
      state.draftNotification ? draftNotificationModel(state.draftNotification, DRAFT_INNER_WIDTH) : null
    )
    ctx.confirmDialog.update(state.confirmDialog ? confirmDialogModel(state.confirmDialog) : null)
    ctx.helpOverlay.update(state.showHelp ? helpOverlayModel(version, state.helpScroll, ctx.renderer.height) : null)
    const diffPeek =
      state.showLinePeek && state.viewMode === "diff"
        ? diffPeekModel(lineMapping, vimState.line, state.peekSide, state.peekScroll, ctx.renderer.width, ctx.renderer.height)
        : null
    const codePeekId = state.inlineCommentOverlay.open ? state.inlineCommentOverlay.codePeekId : null
    const hunkPeek =
      codePeekId !== null
        ? hunkPeekModel(getInlineCommentOverlayComments(state), codePeekId, ctx.renderer.width, ctx.renderer.height)
        : null
    ctx.diffPeek.update(diffPeek)
    ctx.hunkPeek.update(hunkPeek)

    ctx.renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        ctx.header.host,
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        searchShown ? ctx.searchPrompt.host : null,
        // Flash takes the status bar's row rather than a row of its own:
        // growing the footer would shrink every panel by a line, and the
        // labels would land on rows that had just moved.
        flashShown ? ctx.flashPrompt.host : ctx.statusBar.host,
        state.actionMenu.open
          ? ActionMenu({
              renderer: ctx.renderer,
              mode: actionMenuMode,
              selectedIndex: state.actionMenu.selectedIndex,
            })
          : null,
        state.toast.message ? ctx.toast.host : null,
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
        state.marksPicker.open
          ? MarksPicker({
              renderer: ctx.renderer,
              entries: marksPickerEntries(state),
              selectedIndex: state.marksPicker.selectedIndex,
              anyMarks: state.marks.marks.length > 0,
            })
          : null,
        state.occurrencePicker.open
          ? OccurrencePicker({
              renderer: ctx.renderer,
              query: state.occurrencePicker.query,
              narrowing: state.occurrencePicker.narrowing,
              results: occurrencePickerFeature.getOccurrenceResults(state),
              selectedIndex: state.occurrencePicker.selectedIndex,
            })
          : null,
        state.commitPicker.open
          ? CommitPicker({
              renderer: ctx.renderer,
              commits: filteredCommits,
              selectedIndex: state.commitPicker.selectedIndex,
              viewingCommit: state.viewingCommit,
              marked: state.commitPicker.marked,
              filtering: state.commitPicker.queryInput,
              query: state.commitPicker.query,
              extending: state.commitPicker.rangeAnchor !== null,
            })
          : null,
        state.showHelp ? ctx.helpOverlay.host : null,
        diffPeek ? ctx.diffPeek.host : null,
        hunkPeek ? ctx.hunkPeek.host : null,
        state.confirmDialog ? ctx.confirmDialog.host : null,
        state.draftNotification ? ctx.draftNotification.host : null,

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
