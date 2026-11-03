import type { KeyEvent } from "@opentui/core"
import { PRInfoPanelClass } from "./components"
import { VERTICAL_SCROLL_OFF } from "./vim-diff/scroll-off"
import { getLocalCommitDiff, getLocalCommitRangeDiff, filesChangedBetween } from "./providers/local"
import { findCurrentPr } from "./providers/current-pr"
import { commentsWithRows } from "./utils/notes"
import { loadBranchPrReview } from "./features/branch-pr/review"
import { fetchBehindBy, fetchIssueComment, fetchRunJobs, fetchStackInfo, getPrCheckAnnotations } from "./providers/github/lookups"
import { updateIssueComment } from "./providers/github/mutations"
import { openerCommand } from "./app/open-link"
import { createPreviewDeploys } from "./features/preview-deploys"
import { getPendingReview } from "./providers/github/review"
import { fetchCommitDiff, fetchCommitRangeDiff } from "./providers/github/diff"
import { getCommitParentSha } from "./providers/github/content"
import {
  promptOpen,
  type AppState,
  setTreeFilter,
  highlightInlineComment,
  setFileDiff,
  toggleThreadPanelOpenOnly,
} from "./state"
import { toggleUnviewedFilesOnly } from "./app/tree-unviewed"
import { createCommitDiffsState } from "./features/commit-scope/diffs-state"
import { handleCommitSelected, type CommitSelectionContext } from "./features/commit-scope/handlers"
import type { CommitScopeLoadContext } from "./features/commit-scope/load"
import { scopeSpan } from "./features/commit-scope/span"
import { createTreeHighlightSync, followCursorInTree as followedInTree } from "./app/tree-highlight"
import { type AppMode, type Comment } from "./types"
import { openFileAsDiff, type FilesTarget } from "./providers/files"
import { setupFocusReporting } from "./utils/focus-reporting"
import { loadConfig } from "./config"
import { detectPreviews } from "./utils/previews"
import { filesWithUnseen, markVisit } from "./utils/visit"
import { openUrl } from "./utils/open-url"
import { copyToClipboard } from "./utils/clipboard"
import { getCurrentRepoRef } from "./providers/repo"
import { createBlameSource } from "./providers/blame/source"
import { demoBlameSource } from "./features/blame/demo-source"
import type { BlameDeps } from "./features/blame/keys"
import { saveVisitSync, saveMarks, updatePanelFilters } from "./storage/caches"
import { saveInfoSections } from "./storage/info-sections"
import { createHelpState } from "./features/help/state"
import { createConfirmState } from "./features/confirm/state"
import { createSyncPreviewState } from "./features/sync-preview/state"
import { createReviewPreviewState } from "./features/review-preview/state"
import { createFilePickerState } from "./features/file-picker/state"
import { createCommentsPickerState } from "./features/comments-picker/state"
import { createOccurrencePickerState } from "./features/occurrence-picker/state"
import { createMarksPickerState } from "./features/marks/picker-state"
import { createMarksState } from "./features/marks/state"
import { createFeedState } from "./features/feed/state"
import { createVisitState } from "./features/visit/state"
import { createPendingReviewState } from "./features/review-preview/pending-state"
import { createPrCommentInputState } from "./features/pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "./features/pr-info-panel/filter-state"
import { createDiffOptionsState } from "./features/diff-view/options-state"
import { createToastState } from "./features/toast/state"
import { createLastRefreshState } from "./features/refresh/last-refresh-state"
import { createFileContentState } from "./features/file-content/state"
import { createBlockFoldsState } from "./features/folds/block-folds-state"
import { createFileFoldsState } from "./features/folds/file-folds-state"
import { createRenderedMarkdownState } from "./features/rendered-markdown/state"
import { createChatColumnState } from "./features/chat/column-state"
import { loadFileContent as loadFileContentInto } from "./features/file-content/load"
import { createFileVersionsReader, liveFileVersionSources } from "./features/file-content/versions"
import { expandDividerAtCursor } from "./features/file-content/expand-divider"
import { createHighlightSourceReader } from "./features/file-content/highlight-source"
import { loadPendingReview, type LoadPendingReviewContext } from "./features/review-preview/load-pending"
import type { AnotherReviewFeatures } from "./features/refresh/another-review"
import { createBranchPrOpener, liveOpenBranchPrSources } from "./features/branch-pr/open"
import { handleCreatePr, liveCreatePrSources, type CreatePrContext } from "./features/branch-pr/create"
import { handleEditPr, liveEditPrSources, type EditPrContext } from "./features/pr-operations/edit-pr"
import { createReadySends, handleToggleReady, liveReadyStateSources, type ReadyStateContext } from "./features/pr-operations/ready-state"
import { handleMerge, liveMergeSources } from "./features/pr-operations/merge"
import { handleUpdateBranch, liveUpdateBranchSources } from "./features/pr-operations/update-branch"
import {
  handleDequeue,
  handleDisableAutoMerge,
  handleEnableAutoMerge,
  handleEnqueue,
  liveAutoMergeSources,
  type AutoMergeContext,
} from "./features/pr-operations/auto-merge"
import { handleAddPrComment, liveAddPrCommentSources, type AddPrCommentContext } from "./features/pr-operations/add-pr-comment"
import * as viewFilter from "./app/view-filter"
import { createCommitPickerState } from "./features/commit-picker/state"
import { createActionMenuState } from "./features/action-menu/state"
import { createLinePeekState } from "./features/line-peek/state"
import { createBlamePeekState } from "./features/blame/peek-state"
import { createBlameColumnsState } from "./features/blame/column-state"
import { createMentionsState } from "./features/mentions/state"
import { createCommentDraftsState } from "./features/inline-comment-overlay/drafts-state"
import { createComposerPickersState } from "./features/inline-comment-overlay/composer-pickers-state"
import { createCodePeekState } from "./features/inline-comment-overlay/code-peek-state"
import { createJumpListState } from "./features/jumplist/state"
import type { ViewerViewedState } from "./providers/github/viewed"
import type { PrInfo } from "./providers/github/types"

// App submodules
import { initializeAppState, initializeRenderer, buildLineMapping } from "./app/init"
import { createFramePass } from "./app/frame-pass"
import { columnWidthsOf } from "./app/column-widths"
import { createAppShell } from "./app/shell"
import { diffColumnStatus, splitOn } from "./app/column-status"
import { createStatusBarIsland } from "./app/status-bar"
import { createThreadPanelIsland } from "./app/thread-panel"
import { createChatColumnIsland } from "./app/chat-column"
import { chatAtCandidates } from "./features/chat/at-candidates"
import { createReviewChat, diffCursorPosition } from "./app/review-chat"
import { createProposals } from "./app/proposals"
import { createFeedIsland } from "./app/feed"
import { createFrameIslands, followFrame, frameIslandHosts } from "./app/overlays"
import { createPrInfoPanelFollower } from "./app/pr-info-panel-follower"
import { createComposerFollower } from "./app/composer-follower"
import { createPromptFollower } from "./app/prompt-follower"
import { writePrompt } from "./app/open-prompt"
import { promptIslandsOf } from "./app/prompt-routing"
import { createFrame } from "./app/frame"
import { createDiffHighlights } from "./app/diff-highlights"
import { createSplitDiff } from "./app/split-diff"
import { createUnifiedDiff } from "./app/unified-diff"
import { toLineState, toRowState } from "./app/split-cursor"
import { routeDiffViewport } from "./app/diff-viewport"
import { createAppKeys } from "./app/keys"

// Feature modules
import * as actionMenuFeature from "./features/action-menu"
import * as prInfoPanelFeature from "./features/pr-info-panel"
import { openFailingCheck } from "./features/pr-info-panel/check-annotations"
import { commentPollRebuild, type PanelRebuild } from "./features/pr-info-panel/rebuild"
import { createPrInfoPanelRecreate } from "./features/pr-info-panel/recreate"
import { createBaseLookups } from "./features/pr-info-panel/base-lookups"
import { createBaseLookupsState } from "./features/pr-info-panel/base-lookups-state"
import * as syncPreviewFeature from "./features/sync-preview"
import * as reviewPreviewFeature from "./features/review-preview"
import * as fileTreeFeature from "./features/file-tree"
import * as diffView from "./features/diff-view"
import * as folds from "./features/folds"
import * as fileNavigation from "./features/file-navigation"
import * as commentsFeature from "./features/comments"
import * as externalTools from "./features/external-tools"
import { getTreeMultiSelectionFilenames } from "./features/file-tree/multi-selection"
import * as permalink from "./features/permalink"
import { BOARD_SCHEMES, boardLocation, openPrInBoard } from "./features/riff-board"
import { startMentionPrefetch } from "./features/mentions"
import { startReferencePrefetch } from "./features/references"
import * as yank from "./features/yank"
import * as jumplist from "./features/jumplist"
import { createJumpRecording } from "./app/jump-recording"
import { paletteCommandRunner } from "./app/palette-commands"
import { createLeave, leaveOnDestroy } from "./app/leave"
import * as prOperations from "./features/pr-operations"
import * as threadMotion from "./features/thread-motion"
import * as marks from "./features/marks"
import * as refresh from "./features/refresh"
import * as feedFeature from "./features/feed"
import { startCommentPoll } from "./features/comment-poll"
import { focusHandler, reportsFocus } from "./features/comment-poll/focus"
import * as reactions from "./features/reactions"
import { reactionTargetOf } from "./features/reactions/target"
import { reactionContentFromRowId } from "./features/action-menu"
import type { ReactionTarget } from "./types"

// Vim navigation imports
import type { VimCursorState } from "./vim-diff/types"
import { VimMotionHandler } from "./vim-diff/motion-handler"
import { matchingBracketFor } from "./features/matching-bracket"
import { createSearchState, type SearchState } from "./vim-diff/search-state"
import { createFlashState, flashLabelsOn, type FlashState } from "./vim-diff/flash-state"
import { FlashHandler } from "./vim-diff/flash-handler"
import { SearchHandler } from "./vim-diff/search-handler"
import { createCursorState, isVisualMode } from "./vim-diff/cursor-state"
import type { DiffLineMapping } from "./vim-diff/line-mapping"

export interface AppOptions {
  mode?: AppMode
  target?: string
  // For file mode - the path riff was pointed at (spec 084)
  filesTarget?: FilesTarget
  // For PR mode - pre-loaded data
  diff?: string
  comments?: Comment[]
  prInfo?: PrInfo
  // GitHub viewed statuses (from PR load)
  githubViewedStatuses?: Map<string, ViewerViewedState>
  // PR head commit SHA (for tracking viewed at commit)
  headSha?: string
  // `--demo`: the chat runs on a canned agent rather than Claude
  demo?: boolean
}

export async function createApp(options: AppOptions = {}) {
  const { mode = "local", prInfo } = options

  // ===== INITIALIZATION =====
  // State first, renderer second: the renderer starts reading stdin as soon
  // as it exists, and a key typed before the keypress handler is wired up is
  // read and dropped. Loading first keeps that window shut.
  const { state: initialState, source, chatKey, headSha: initialHeadSha, prInfoOpenSections, savedChat, marks: initialMarks, visit: initialVisit, foldedFiles: initialFoldedFiles, config: initialConfig } = await initializeAppState({
    mode,
    target: options.target,
    filesTarget: options.filesTarget,
    diff: options.diff,
    comments: options.comments,
    prInfo: options.prInfo,
    githubViewedStatuses: options.githubViewedStatuses,
    headSha: options.headSha,
  })

  const { renderer, fileTreePanel, parses } = await initializeRenderer()
  const treeHighlight = createTreeHighlightSync(fileTreePanel)

  let stopFocusReporting: (() => void) | null = null

  // ===== MUTABLE STATE =====
  let state: AppState = initialState
  const toast = createToastState()
  const lastRefresh = createLastRefreshState()
  let vimState: VimCursorState = createCursorState()
  /** The mode the status bar was last drawn for. */
  let lastCursorMode = vimState.mode
  let searchState: SearchState = createSearchState()
  let flashState: FlashState = createFlashState()
  const diffOptions = createDiffOptionsState({ wrap: initialConfig.diff.wrap, alignMarkdownTables: initialConfig.diff.alignMarkdownTables })
  const fileContent = createFileContentState()
  const blockFolds = createBlockFoldsState()
  const fileFolds = createFileFoldsState()
  fileFolds.collapse(initialFoldedFiles)
  const renderedMarkdown = createRenderedMarkdownState()
  const chatColumnState = createChatColumnState()
  const commitDiffs = createCommitDiffsState()
  let lineMapping: DiffLineMapping = buildLineMapping(initialState, diffOptions, fileContent, blockFolds, fileFolds, renderedMarkdown)
  // Tree filter the current mapping was built against, so a filter change can
  // be spotted from the panel update every filter path already goes through.
  let mappedTreeFilter: string = initialState.treeFilter
  let currentHeadSha = initialHeadSha
  // A local review follows worktree edits by a mark's text alone; HEAD would
  // cost a git spawn and say nothing the text does not.
  const markHead = (): string | undefined => (state.appMode === "pr" && currentHeadSha ? currentHeadSha : undefined)
  let cachedCurrentUser: string | null = null
  // The panel is drawn in the diff column, between whichever of the tree,
  // the thread panel and the chat are open.
  const prInfoPanelWidth = () => columnWidthsOf({ ...state, chatOpen: chatColumnState.open(), chatExpanded: chatColumnState.expanded() }, renderer.width).diff
  // Persistent for PR sessions (spec 041); null in local mode.
  let prInfoPanel: PRInfoPanelClass | null =
    mode === "pr" && prInfo
      ? new PRInfoPanelClass(renderer, prInfo, initialState.files, initialState.comments, prInfoOpenSections, prInfoPanelWidth)
      : null

  const reactionTarget = () => reactionTargetOf(state, () => prInfoPanel?.getReactionTarget() ?? null)

  const baseLookups = createBaseLookups({
    state: createBaseLookupsState(),
    target: () => {
      if (!state.prInfo) return null
      const { owner, repo, number, baseRef } = state.prInfo
      return { owner, repo, baseRef, headSha: currentHeadSha, key: `${owner}/${repo}#${number} ${baseRef}...${currentHeadSha}` }
    },
    fetchStack: fetchStackInfo,
    fetchBehindBy,
    panel: () => prInfoPanel,
    onRewritten: (stack) => {
      toast.show(`Stacked on #${stack.basePr.number}, which was rewritten since you branched — rebase`, "info")
      setTimeout(() => { toast.clear(); render() }, 5000)
    },
    render: () => render(),
  })

  /**
   * Hooks a panel instance — the first or a replacement — up to the app.
   * `reread` asks the base lookups again.
   */
  function wirePrInfoPanel(panel: PRInfoPanelClass, { reread = true }: PanelRebuild = {}): void {
    baseLookups.wire(panel, { reread })
    panel.setOnOpenFailingCheck((check) => {
      if (!state.prInfo) return
      const { owner, repo } = state.prInfo
      void openFailingCheck(check, {
        fetch: () => getPrCheckAnnotations(owner, repo, check.id),
        currentPanel: () => prInfoPanel,
        render,
      })
    })
    panel.setOnFilterChange((value) => {
      viewFilter.setFilter({ getState: () => state, setState: (fn) => { state = fn(state) }, feed: activityFeed, prInfoFilter }, value)
      render()
    })
    panel.setOnSectionsChange((open) => {
      void saveInfoSections(state.source, open)
    })
    refreshPreviews(panel)
  }

  /**
   * Lift the deploy bot's preview links out of the conversation and into
   * their own section, folding the comment they came from away (spec 068).
   */
  function refreshPreviews(panel: PRInfoPanelClass): void {
    if (!state.prInfo) return
    const config = loadConfig().previews
    const previews = detectPreviews(
      state.prInfo.conversationComments ?? [],
      config,
      state.prInfo.number
    )
    panel.setPreviews(previews)
    panel.setHiddenConversation(
      previews && config.hideSource ? new Set([previews.commentId]) : new Set()
    )
    // A PR opened mid-build follows the build without a key pressed (spec 113).
    previewDeploys.watch()
  }

  // ===== HELPERS =====
  // searchHandler is defined later, but we need a reference in createLineMapping
  let searchHandlerRef: SearchHandler | null = null

  /**
   * Read the file riff is showing, once, when it is opened (spec 084).
   *
   * File mode lists a repository by name and opens one file at a time; the
   * read happens here rather than at startup so `riff .` is a list rather
   * than a thousand files off the disk.
   */
  const fileModeRead = new Set<string>()
  function requestFileModeContent(): void {
    if (!state.fileMode || state.selectedFileIndex === null) return
    const file = state.files[state.selectedFileIndex]
    if (!file || fileModeRead.has(file.filename)) return

    fileModeRead.add(file.filename)
    void (async () => {
      try {
        // Read first, then merge: `state` as an argument would be the one
        // from before the await, and assigning it back would undo whatever
        // the reader did while the file was loading.
        const content = await openFileAsDiff(file.filename)
        state = setFileDiff(state, file.filename, content)
        createLineMapping()
        render()
      } catch {
        // A file riff cannot read leaves the listing and every other file
        // exactly as they were.
      }
    })()
  }

  function createLineMapping() {
    requestFileModeContent()
    lineMapping = buildLineMapping(state, diffOptions, fileContent, blockFolds, fileFolds, renderedMarkdown)
    mappedTreeFilter = state.treeFilter
    // Refresh search matches for the new line mapping
    // This ensures search results are updated when switching files
    searchHandlerRef?.refreshMatches()
    return lineMapping
  }

  function quit(then?: () => void) {
    leave()
    chatColumn.dispose()
    statusBar.dispose()
    stopFollowing()
    for (const island of Object.values(islands)) island.dispose()
    feedIsland.dispose()
    split.dispose()
    unified.dispose()
    highlights.dispose()
    highlightSource.dispose()
    parses.dispose()
    renderer.destroy()
    // The terminal is riff's again to hand on — `then` is how a relaunch
    // takes it (spec 079).
    then?.()
    process.exit(0)
  }

  function writeVisitWatermark(): void {
    if (state.appMode !== "pr") return
    saveVisitSync(state.source, markVisit(state.comments, currentHeadSha, visit.seen()))
  }

  // ===== POST-PROCESS (cursor positioning) =====
  // Prompts draw their own cursor now that they are real input widgets
  // (spec 065); the views that have no cursor of their own park it. The
  // chat's input draws its own too, in whichever view the column is open.
  renderer.addPostProcessFn(() => {
    if (state.viewMode !== "diff" && !promptOpen(state, { filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, activityFeed, prInfoFilter }) && !(chatColumnState.open() && state.focusedPanel === "chat")) {
      renderer.setCursorPosition(0, 0, false)
    }
  })

  // ===== VIEWPORT & SCROLL =====
  const SCROLL_OFF = VERTICAL_SCROLL_OFF

  function getViewportHeight(): number {
    return (split.shown() ? split.island.viewportHeight() : unified.viewportHeight()) || 20
  }

  function ensureCursorVisible(): void {
    if (split.shown()) split.revealCursor()
    else unified.refreshCursor()
    followCursorInTree()
  }

  // The tree follows from here rather than from the render pass: a
  // motion updates the cursor and the viewport without re-rendering the
  // app, so `j` would never have reached the tree at all.
  function followCursorInTree(): void {
    const followed = followedInTree(state, cursorFile())
    if (followed === state) return
    state = followed
    refreshFileTreePanel()
    fileTreePanel.ensureHighlightVisible()
  }

  function cursorFile(): string | null {
    return lineMapping.getLine(vimState.line)?.filename ?? null
  }

  // vimState stays a mapping line for every reader; only drawing it in split needs a row.
  function refreshCursor(): void {
    if (split.shown()) split.refreshCursor()
    else unified.refreshCursor()
    // A motion takes this path without a render, so the frame pass alone would leave the readout behind.
    statusBar.patch({
      columnInfo: diffColumnStatus(splitOn(state, split), { viewMode: state.viewMode, split, unified }),
    })
  }

  function handleToggleSplitView(): void {
    diffOptions.toggleSplit()
    if (diffOptions.splitView()) split.enter()
    redrawDiff()
  }

  function redrawDiff(): void {
    render()
    ensureCursorVisible()
    refreshCursor()
  }

  // The filter box owns its text while typing; state mirrors every keystroke
  // so the tree narrows live and every highlight lookup sees the same list.
  fileTreePanel.setOnFilterChange((value: string) => {
    state = setTreeFilter(state, value)
    updateFileTreePanel()
    render()
  })

  /** Push the current state into the tree panel. */
  function refreshFileTreePanel(): void {
    treeHighlight.shown(state)
    fileTreePanel.update({
      files: state.files,
      fileTree: state.fileTree,
      highlightIndex: state.treeHighlightIndex,
      selectedFileIndex: state.selectedFileIndex,
      focused: state.focusedPanel === "tree",
      fileStatuses: state.fileStatuses,
      ignoredFiles: state.ignoredFiles,
      showHiddenFiles: state.showHiddenFiles,
      multiSelectedFilenames: getTreeMultiSelectionFilenames(state),
      treeFilter: state.treeFilter,
      treeFilterInput: state.treeFilterInput,
      flashLabels: flashLabelsOn(flashState, "tree"),
      unseenFiles: filesWithUnseen(state.comments, visit.watermark()),
      changedSinceVisit: visit.changedFiles(),
      unviewedOnly: state.treeUnviewedOnly ? { keep: state.treeKeptFile } : null,
    })
  }

  function updateFileTreePanel() {
    // The all-files diff lists the files the tree lists, so narrowing the
    // tree narrows it too — and the cursor goes back to the top, since the
    // line it sat on belongs to a different file now.
    if (mappedTreeFilter !== state.treeFilter) {
      createLineMapping()
      if (state.selectedFileIndex === null) {
        vimState = { ...vimState, line: 0, col: 0, desiredCol: null, selectionAnchor: null }
      }
    }

    if (state.showFilePanel) {
      fileTreePanel.setWidth(columnWidthsOf({ ...state, chatOpen: chatColumnState.open(), chatExpanded: chatColumnState.expanded() }, renderer.width).tree)
    }

    state = treeHighlight.sync(state, cursorFile(), (synced) => {
      state = synced
      refreshFileTreePanel()
    })
    fileTreePanel.visible = state.showFilePanel
  }

  // ===== RENDER =====
  function render(): void {
    if (renderedMarkdown.stale((filename) => fileContent.entry(filename)?.newContent || undefined)) createLineMapping()
    renderFrame()
    proposals.afterRender()
  }

  const statusBar = createStatusBarIsland(renderer)
  const threadPanel = createThreadPanelIsland(renderer)
  const help = createHelpState()
  const confirm = createConfirmState()
  const previewDeploys = createPreviewDeploys({
    target: () => {
      if (state.appMode !== "pr" || !state.prInfo) return null
      return { owner: state.prInfo.owner, repo: state.prInfo.repo, previews: prInfoPanel?.getPreviews() ?? null }
    },
    confirm,
    toast,
    render: () => render(),
    applyComment: (commentId, body) => {
      if (!state.prInfo) return
      const comments = state.prInfo.conversationComments ?? []
      state = {
        ...state,
        prInfo: {
          ...state.prInfo,
          conversationComments: comments.map((comment) => (String(comment.id) === commentId ? { ...comment, body } : comment)),
        },
      }
      if (prInfoPanel) refreshPreviews(prInfoPanel)
    },
    openUrl: (url) => {
      Bun.spawn([openerCommand(), url], { stdout: "ignore", stderr: "ignore" })
    },
    api: { fetchComment: fetchIssueComment, updateComment: updateIssueComment, fetchRunJobs },
  })
  const syncPreview = createSyncPreviewState()
  const reviewPreview = createReviewPreviewState()
  const pendingReview = createPendingReviewState()
  const prCommentInput = createPrCommentInputState()
  const prInfoFilter = createPrInfoFilterState()
  const pendingReviewLoad: LoadPendingReviewContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    pendingReview,
    fetch: getPendingReview,
  }
  const filePicker = createFilePickerState()
  const commentsPicker = createCommentsPickerState()
  const occurrencePicker = createOccurrencePickerState()
  const marksPicker = createMarksPickerState()
  const commitPicker = createCommitPickerState()
  const actionMenu = createActionMenuState()
  const linePeek = createLinePeekState()
  const blamePeek = createBlamePeekState()
  const blameColumns = createBlameColumnsState()
  const mentions = createMentionsState()
  const commentDrafts = createCommentDraftsState()
  const composerPickers = createComposerPickersState()
  const codePeek = createCodePeekState()
  const jumpList = createJumpListState()
  const globalMarks = createMarksState()
  globalMarks.reset(initialMarks)
  const activityFeed = createFeedState()
  const visit = createVisitState()
  visit.begin(initialVisit.watermark, initialVisit.rebased)
  const anotherReviewFeatures: AnotherReviewFeatures = {
    help,
    confirm,
    syncPreview,
    reviewPreview,
    filePicker,
    commentsPicker,
    occurrencePicker,
    marksPicker,
    commitPicker,
    actionMenu,
    linePeek,
    blamePeek,
    blameColumns,
    commentDrafts,
    composerPickers,
    codePeek,
    jumpList,
    pendingReview,
    prCommentInput,
    prInfoFilter,
    fileContent,
    commitDiffs,
    blockFolds,
    fileFolds,
    chatColumn: chatColumnState,
    renderedMarkdown,
  }
  const chat = createReviewChat({
    demo: options.demo === true,
    getState: () => state,
    target: options.target,
    headSha: () => currentHeadSha ?? null,
    chatKey,
    savedChat,
    position: diffCursorPosition({
      getState: () => state,
      getVimState: () => vimState,
      getMapping: () => lineMapping,
      // `split` is built below; a question is only ever sent once the app is running.
      getScope: () => split.commentScope(),
      getRows: () => split.splitRows(),
    }),
    proposer: () => proposals,
  })
  const leave = createLeave({
    // The watermark is the "last time I looked" the next visit measures
    // against (spec 069). Written on the way out and on refresh, never
    // continuously — a live watermark would answer "since a moment ago",
    // which is never useful.
    writeVisitWatermark,
    // Mode 1004 outlives the process if we don't turn it off — the shell that
    // gets the terminal back would start receiving focus escape sequences.
    // Read late: focus reporting is only switched on once the app is wired.
    stopFocusReporting: () => stopFocusReporting?.(),
    disposeChat: () => chat.dispose(),
  })
  // Ctrl-c (exitOnCtrlC) and the exit signals destroy the renderer without
  // going through quit(); "destroy" is the one event both paths emit.
  leaveOnDestroy(renderer, leave)
  const proposals = createProposals({
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    // Built below with the diff; a proposal only ever arrives once the app is running.
    reveal: (anchor) => threadMotion.revealAnchor(anchor, threadMotionContext),
    fillComposer: (text) => threadPanel.composer.setValue(text),
    note: chat.note,
    commentDrafts,
    composerPickers,
    codePeek,
  })
  chat.onSessionClosed(proposals.endConversation)
  const chatColumn = createChatColumnIsland(renderer, chat, () => chatAtCandidates(state))
  const blame: BlameDeps = {
    source: options.demo
      ? demoBlameSource()
      : createBlameSource({ state: () => state, target: options.target, headSha: () => currentHeadSha ?? null }),
    openUrl: (url) => void openUrl(url),
    copy: copyToClipboard,
    repoRef: async () =>
      state.appMode === "pr" && state.prInfo ? { owner: state.prInfo.owner, repo: state.prInfo.repo } : getCurrentRepoRef(),
    // `split` is built below; gb only ever runs once the app is. A jump may have
    // landed on the other half of a row, and the pane follows it, as for a comment.
    splitRows: () => {
      split.syncPane()
      return split.splitRows()
    },
  }
  const islands = createFrameIslands(renderer, {
    onSummaryChange(value) {
      if (reviewPreview.open()) reviewPreview.setBody(value)
      // The footer's submit button follows the body.
      render()
    },
  })
  const feedIsland = createFeedIsland(renderer)
  const highlights = createDiffHighlights(parses, () => render())
  const split = createSplitDiff({
    renderer,
    highlights,
    scrollOff: SCROLL_OFF,
    getState: () => state,
    diffOptions,
    fileContent,
    chatColumn: chatColumnState,
    getMapping: () => lineMapping,
    getVimState: () => vimState,
    onShownChanged: redrawDiff,
  })
  const unified = createUnifiedDiff({
    renderer,
    highlights,
    scrollOff: SCROLL_OFF,
    getState: () => state,
    diffOptions,
    fileContent,
    chatColumn: chatColumnState,
    getMapping: () => lineMapping,
    getVimState: () => vimState,
  })

  // A mouse wheel moves the viewport and nothing else — no key is pressed,
  // so no handler runs. Dragging the cursor along keeps it in the window
  // the way vim does, and carries the tree highlight with it.
  //
  // The cursor is moved to fit the view here, never the other way round:
  // calling ensureCursorVisible would scroll the view back and fight the
  // wheel.
  function dragCursorTo(line: number): void {
    const content = lineMapping.getLineContent(line)
    vimState = {
      ...vimState,
      line,
      col: Math.min(vimState.col, Math.max(0, content.length - 1)),
      selectionAnchor: isVisualMode(vimState) ? vimState.selectionAnchor : null,
    }
    refreshCursor()
    render()
  }
  unified.setOnCursorScrolledAway(dragCursorTo)
  split.island.setOnCursorScrolledAway(dragCursorTo)

  const diffViewport = routeDiffViewport(unified, {
    shown: split.shown,
    island: split.island,
    rowAtLine: split.rowAtLine,
    refreshCursor,
  })

  const shell = createAppShell(renderer, {
    ...frameIslandHosts(islands),
    tree: fileTreePanel.host,
    threadPanel: threadPanel.host,
    chat: chatColumn.host,
    statusBar: statusBar.host,
  })
  const frame = createFrame()
  const setAppState = (fn: (s: AppState) => AppState) => { state = fn(state) }
  const stopFollowing = followFrame(
    frame.frame,
    {
      ...islands,
      composer: createComposerFollower(threadPanel.compose, {
        getState: () => state,
        render: () => renderFrame(),
        mentions,
        composerPickers,
      }),
      prompt: createPromptFollower(
        promptIslandsOf(islands, feedIsland, threadPanel),
        writePrompt(
          { getState: () => state, setState: setAppState, feed: activityFeed, prInfoFilter, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, updateSearchPattern: (value) => searchHandler.updatePattern(value) },
          () => renderFrame()
        )
      ),
      threadPanel,
      prInfoPanel: createPrInfoPanelFollower(() => prInfoPanel),
      chatColumn,
      statusBar,
      feed: feedIsland,
    },
    shell
  )

  // The keys are built further down, and a pass may run before them.
  let paletteKeys: ReadonlyMap<string, string> = new Map()
  const renderFrame = createFramePass({
    getState: () => state,
    setState: setAppState,
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    getCachedCurrentUser: () => cachedCurrentUser,
    getPrInfoPanel: () => prInfoPanel,
    renderer,
    shell,
    feed: feedIsland,
    split,
    unified,
    parses,
    fileContent,
    help,
    confirm,
    syncPreview,
    reviewPreview,
    pendingReview,
    toast,
    lastRefresh,
    prCommentInput,
    prInfoFilter,
    filePicker,
    commentsPicker,
    occurrencePicker,
    marksPicker,
    commitPicker,
    actionMenu,
    linePeek,
    blamePeek,
    blameColumns,
    marks: globalMarks,
    activityFeed,
    visit,
    mentions,
    commentDrafts,
    composer: threadPanel.composer,
    composerPickers,
    codePeek,
    chatColumn: chatColumnState,
    getCommandKeys: () => paletteKeys,
    reactionTarget,
    updateFileTreePanel,
    publishFrame: frame.publish,
  })

  // Give the panel a way to request a re-render from async transitions
  // it owns (e.g., annotation fetches — spec 043), and somewhere to send
  // what is typed into its filter box.
  if (prInfoPanel) wirePrInfoPanel(prInfoPanel)

  // ===== VIM HANDLERS =====
  // Only the motions walk split rows; everything else reads the cursor as a mapping line.
  const vimHandler = new VimMotionHandler({
    getMapping: () => (split.shown() ? split.source() : lineMapping),
    getState: () => (split.shown() ? toRowState(vimState, split.source()) : vimState),
    setState: (newState) => {
      vimState = split.shown() ? toLineState(newState, split.source(), vimState) : newState
      ensureCursorVisible()
      refreshCursor()
    },
    getViewportHeight,
    onCursorMove: () => {
      ensureCursorVisible()
      refreshCursor()
      // Only the visual-mode name, the selection size and a mode change need
      // a full render of the status bar; the column readout reaches it through
      // refreshCursor's patch, so normal-mode motions can skip render().
      if (isVisualMode(vimState) || lastCursorMode !== vimState.mode) render()
      lastCursorMode = vimState.mode
    },
    matchBracket: matchingBracketFor({
      getSource: () => (split.shown() ? split.source() : lineMapping),
      getMapping: () => lineMapping,
      parses,
      fileContent,
      rebuildLineMapping: createLineMapping,
      getVimState: () => vimState,
      setVimState: (next) => { vimState = next },
      loadFileContent: (filename) => void loadFileContent(filename),
      toast,
      render,
    }),
  })

  const commitScopeLoadContext: CommitScopeLoadContext = {
    getState: () => state,
    target: options.target,
    fetchCommitDiff,
    fetchCommitRangeDiff,
    getLocalCommitDiff,
    getLocalCommitRangeDiff,
    getCommitParentSha,
  }

  const fetchFileVersions = createFileVersionsReader({
    sources: liveFileVersionSources,
    getState: () => state,
    head: () => currentHeadSha,
    target: options.target,
    getCommitParentSha,
  })

  const loadFileContent = (filename: string) => loadFileContentInto({ fileContent, fetchFileVersions, render }, filename)

  const highlightSource = createHighlightSourceReader({
    fileContent,
    fetchFileVersions,
    visibleFilenames: () => (split.shown() ? split.visibleFilenames() : unified.visibleFilenames()),
    scopeSpan: () => scopeSpan(state),
    head: () => currentHeadSha,
    target: options.target,
    appMode: () => state.appMode,
    render,
  })

  // Which files are on screen is known once a frame is laid out, not when
  // `render()` updates the tree — the rows it would walk then are the old
  // layout's, or none — and moving the cursor draws without calling it at
  // all (spec 080). The walk is cheap; the reads behind it are debounced.
  renderer.addPostProcessFn(() => highlightSource.request())

  const searchHandler = new SearchHandler({
    getMapping: () => lineMapping,
    getSearchState: () => searchState,
    setSearchState: (newState) => { searchState = newState },
    getCursor: () => vimState,
    setCursor: (line, col) => {
      vimState = { ...vimState, line, col }
      ensureCursorVisible()
      refreshCursor()
    },
    getFileContent: (filename) => fileContent.entry(filename)?.newContent ?? null,
    loadFileContent,
    expandDividerForLine: (filename, lineNum) => {
      const dividerKey = lineMapping.findDividerForLine(filename, lineNum)
      if (dividerKey) {
        fileContent.expand(dividerKey)
        createLineMapping()
      }
    },
    getCollapsedFiles: () =>
      state.files
        .filter((file) => fileFolds.isCollapsed(file.filename))
        .map((file) => ({ filename: file.filename, diff: file.content })),
    expandFiles: (filenames) => {
      fileFolds.expand(filenames)
      createLineMapping()
    },
    onUpdate: () => {
      render()
    },
  })

  // Assign searchHandler reference for use in createLineMapping
  searchHandlerRef = searchHandler

  const flashHandler = new FlashHandler({
    getMapping: () => lineMapping,
    getFlashState: () => flashState,
    setFlashState: (newState) => { flashState = newState },
    getCursor: () => vimState,
    setCursor: (line, col, pane) => {
      vimState = { ...vimState, line, col, desiredCol: null }
      // A line in both halves is labelled in each; syncPane leaves such a line alone, so the labelled pane sticks.
      if (pane && split.shown()) split.source().setSide(pane)
      ensureCursorVisible()
      refreshCursor()
    },
    getVisibleRegion: () => (split.shown() ? split.visibleRegion() : unified.visibleRegion()),
    jumpToRow: (surface, id) => {
      jumpList.push(jumplist.capture(state, vimState, lineMapping, { split: diffOptions.splitView(), pane: split.commentScope().pane }))
      if (surface === "tree") {
        state = { ...state, treeHighlightIndex: Number(id), focusedPanel: "tree" }
        updateFileTreePanel()
      } else if (surface === "state") {
        prInfoPanel?.flashJump(id)
      } else if (surface === "feed") {
        activityFeed.highlight(Number(id))
      } else if (surface === "comments") {
        state = highlightInlineComment(state, id)
      }
    },
    onUpdate: () => { render() },
  })

  // ===== EXPAND DIVIDER =====
  function handleExpandDivider(): Promise<boolean> {
    return expandDividerAtCursor({
      fileContent,
      fetchFileVersions,
      dividerKeyAtCursor: () => lineMapping.getDividerKey(vimState.line),
      rebuildLineMapping: createLineMapping,
      render,
      revealCursor: () => {
        ensureCursorVisible()
        refreshCursor()
      },
    })
  }

  // ===== FEATURE CONTEXTS =====

  const refreshContext: refresh.RefreshContext = {
    sources: refresh.liveRefreshSources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    lastRefresh,
    fileContent,
    renderedMarkdown,
    loadFileContent,
    commitDiffs,
    fileFolds,
    render,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getSearchState: () => searchState,
    setSearchState: (s) => { searchState = s },
    getMapping: () => lineMapping,
    rebuildLineMapping: () => { createLineMapping() },
    revealCursor: () => {
      ensureCursorVisible()
      refreshCursor()
    },
    refreshSearchMatches: () => { searchHandler.refreshMatches() },
    reloadFeed: () => { void feedFeature.loadFeed(feedLoadContext) },
    getHeadSha: () => currentHeadSha,
    setHeadSha: (sha) => { currentHeadSha = sha },
    saveMarks: (saved) => { void saveMarks(state.source, saved) },
    marks: globalMarks,
    feed: activityFeed,
    visit,
    help,
    confirm,
    syncPreview,
    reviewPreview,
    pendingReview,
    prCommentInput,
    filePicker,
    commentsPicker,
    occurrencePicker,
    marksPicker,
    commitPicker,
    actionMenu,
    linePeek,
    blamePeek,
    blameColumns,
    commentDrafts,
    composerPickers,
    codePeek,
    jumpList,
    recreatePrInfoPanel: createPrInfoPanelRecreate({
      getState: () => state,
      getPanel: () => prInfoPanel,
      setPanel: (panel) => { prInfoPanel = panel },
      build: (info, files, comments, openSections) =>
        new PRInfoPanelClass(renderer, info, files, comments, openSections, prInfoPanelWidth),
      saved: prInfoOpenSections,
      wire: wirePrInfoPanel,
      // Fresh PR data can carry references riff has never looked up.
      rebuilt: () => startReferencePrefetch(referenceContext),
    }),
    target: options.target,
  }

  const reviewPreviewOpenContext: reviewPreviewFeature.ReviewPreviewOpenContext = {
    getState: () => state,
    reviewPreview,
    render,
    getCachedCurrentUser: () => cachedCurrentUser,
    setCachedCurrentUser: (user) => { cachedCurrentUser = user },
  }

  const syncPreviewOpenContext: syncPreviewFeature.SyncPreviewOpenContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    render,
    syncPreview,
  }

  const prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    commentInput: prCommentInput,
    prInfoFilter,
    getPanel: () => prInfoPanel,
  }

  const foldsContext: folds.FoldsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    blockFolds,
    fileFolds,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    rebuildLineMapping: () => { createLineMapping() },
    getFileTreePanel: () => fileTreePanel,
    getCursorView: () => diffViewport,
    updateFileTreePanel,
    ensureCursorVisible,
    render,
  }

  const fileNavContext: fileNavigation.FileNavigationContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    fileFolds,
    toast,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    createLineMapping: () => { createLineMapping(); return lineMapping },
    getCursorView: () => diffViewport,
    ensureCursorVisible,
    render,
    getHeadSha: () => currentHeadSha,
    setHeadSha: (sha) => { currentHeadSha = sha },
  }

  const commentsContext: commentsFeature.CommentsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    getCommentScope: split.commentScope,
    render,
    suspendRenderer: () => renderer.suspend(),
    resumeRenderer: () => renderer.resume(),
    getCachedCurrentUser: () => cachedCurrentUser,
    setCachedCurrentUser: (user) => { cachedCurrentUser = user },
    confirm,
  }

  const externalToolsContext: externalTools.ExternalToolsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    render,
    suspendRenderer: () => renderer.suspend(),
    resumeRenderer: () => renderer.resume(),
    getHeadSha: () => currentHeadSha,
    options,
  }

  const yankContext: yank.YankContext = {
    setState: (fn) => { state = fn(state) },
    toast,
    getVimState: () => vimState,
    setVimState: (s) => {
      vimState = s
      refreshCursor()
    },
    getLineMapping: () => lineMapping,
    render,
  }

  const permalinkContext: permalink.PermalinkContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    getCommentScope: split.commentScope,
    render,
    getHeadSha: () => currentHeadSha,
    reactionTarget,
  }

  const prOperationsContext: prOperations.PrOperationsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    render,
    syncPreview,
    reviewPreview,
    pendingReview,
    reviewCalls: prOperations.githubReviewCalls,
  }

  const threadMotionContext: threadMotion.ThreadMotionContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    ensureCursorVisible,
    render,
    fileNavContext,
    visit,
    composerPickers,
    codePeek,
  }

  const marksContext: marks.MarksContext = {
    ...threadMotionContext,
    toast,
    blockFolds,
    getPane: () => split.commentScope().pane ?? null,
    setPane: (pane) => { if (split.shown()) split.source().setSide(pane) },
    marks: globalMarks,
    save: (saved) => { void saveMarks(state.source, saved) },
    getHead: markHead,
  }

  const toggleOpenThreadsOnly = () => {
    state = toggleThreadPanelOpenOnly(state)
    void updatePanelFilters(state.source, { openThreadsOnly: state.threadPanelOpenOnly })
    render()
  }

  const toggleUnviewedFiles = () => {
    state = toggleUnviewedFilesOnly(state, lineMapping.getLine(vimState.line)?.filename ?? null)
    render()
    fileTreePanel.ensureHighlightVisible()
  }

  // ===== ACTION EXECUTION =====
  const createPrContext: CreatePrContext = {
    sources: liveCreatePrSources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    suspend: () => renderer.suspend(),
    resume: () => renderer.resume(),
    later: (fn, ms) => { setTimeout(fn, ms) },
    setVimState: (s) => { vimState = s },
    setSearchState: (s) => { searchState = s },
    setHeadSha: (sha) => { currentHeadSha = sha },
    rebuildLineMapping: () => { lineMapping = buildLineMapping(state, diffOptions, fileContent, blockFolds, fileFolds, renderedMarkdown) },
    forgetBaseLookups: () => baseLookups.state.forget(),
    render,
    toast,
    lastRefresh,
    globalMarks,
    activityFeed,
    visit,
    features: anotherReviewFeatures,
    fileFolds,
  }

  const editPrContext: EditPrContext = {
    sources: liveEditPrSources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    suspend: () => renderer.suspend(),
    resume: () => renderer.resume(),
    later: (fn, ms) => { setTimeout(fn, ms) },
    render,
    toast,
  }

  const addPrCommentContext: AddPrCommentContext = { ...editPrContext, sources: liveAddPrCommentSources }

  const readyStateContext: ReadyStateContext = {
    sources: liveReadyStateSources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    confirm,
    toast,
    // The panel draws from its own copy of prInfo; handing it over keeps
    // its folds and cursor, where rebuilding it would not.
    render: () => {
      if (state.prInfo) prInfoPanel?.setPrInfo(state.prInfo)
      render()
    },
    later: (fn, ms) => { setTimeout(fn, ms) },
    sends: createReadySends(),
  }

  const autoMergeContext: AutoMergeContext = { ...readyStateContext, sources: liveAutoMergeSources }

  const actionHandlers: actionMenuFeature.ActionHandlers = {
    handleToggleOpenThreadsOnly: toggleOpenThreadsOnly,
    handleToggleUnviewedFilesOnly: toggleUnviewedFiles,
    handleShowFilePath: () => externalTools.showFilePath(externalToolsContext),
    quit,
    handleRefresh: () => refresh.handleRefresh(refreshContext),
    handleOpenReviewPreview: () => reviewPreviewFeature.handleOpenReviewPreview(reviewPreviewOpenContext),
    handleOpenSyncPreview: () => syncPreviewFeature.handleOpenSyncPreview(syncPreviewOpenContext),
    handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(commentsContext),
    handleDeleteComment: () => commentsFeature.handleDeleteComment(commentsContext),
    handleClearLocalComments: () => commentsFeature.handleClearLocalComments(commentsContext),
    handleOpenPRInfoPanel: () => prInfoPanelFeature.handleOpenPRInfoPanel(prInfoPanelOpenContext),
    handleOpenInBoard: () =>
      openPrInBoard({
        getState: () => state,
        setState: (fn) => { state = fn(state) },
        toast,
        render,
        openUrl: (url) => openUrl(url, BOARD_SCHEMES),
        boardUrl: loadConfig().board.url,
        location: () => boardLocation(state, permalink.diffTargetAt(permalinkContext)),
      }),
    handleOpenFileInEditor: () => externalTools.handleOpenFileInEditor(externalToolsContext),
    handleDiffFileInEditor: (opts) => externalTools.handleDiffFileInEditor(externalToolsContext, opts),
    handleOpenFileInTmuxWindow: () => externalTools.handleOpenFileInTmuxWindow(externalToolsContext),
    handleCheckoutAndEdit: () => externalTools.handleCheckoutAndEdit(externalToolsContext),
    handleOpenExternalDiff: (viewer) => externalTools.handleOpenExternalDiff(viewer, externalToolsContext),
    handleCopyPermalink: (opts) => permalink.handleCopyPermalink(permalinkContext, opts),
    handleCopyPrDiffLink: () => permalink.handleCopyPrDiffLink(permalinkContext),
    handleCopyCommentLink: () => permalink.handleCopyCommentLink(permalinkContext),
    handleExpandDivider,
    handleYank: (opts: { raw: boolean }) => yank.handleYank(yankContext, opts),
    handleShowAllFiles: () => {
      vimState = createCursorState()
      createLineMapping()
    },
    handleToggleSplitView,
    handleOpenFileAlone: () => {
      // The tree and the picker scroll the whole diff now, so this is the
      // way into the single-file view.
      const filename = lineMapping.getLine(vimState.line)?.filename
      const fileIndex = filename ? state.files.findIndex((f) => f.filename === filename) : -1
      if (fileIndex !== -1) {
        fileNavigation.handleSelectFile(fileIndex, fileNavContext)
      }
    },
    handleReviewBranchPr: (prNumber: number) => {
      // riff is built around one review per process, so switching to the PR
      // is a fresh riff on the same terminal — the same thing typing
      // `riff <n>` does, minus the typing.
      const script = process.argv[1]
      const command = script?.endsWith(".ts") || script?.endsWith(".js")
        ? [process.execPath, script, String(prNumber)]
        : [process.execPath, String(prNumber)]
      quit(() => {
        Bun.spawnSync(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
      })
    },
    handleEditPr: () => handleEditPr(editPrContext),
    handleToggleReady: () => handleToggleReady(readyStateContext),
    handleMerge: (method) => handleMerge({ ...readyStateContext, sources: liveMergeSources }, method),
    handleUpdateBranch: () =>
      handleUpdateBranch({
        ...readyStateContext,
        sources: liveUpdateBranchSources,
        behindBy: () => baseLookups.state.behindBy(),
        settleBehindBy: (behindBy) => baseLookups.settleBehindBy(behindBy),
      }),
    handleEnableAutoMerge: (method) => handleEnableAutoMerge(autoMergeContext, method),
    handleDisableAutoMerge: () => handleDisableAutoMerge(autoMergeContext),
    handleEnqueue: () => handleEnqueue(autoMergeContext),
    handleDequeue: () => handleDequeue(autoMergeContext),
    handleCreatePr: () => handleCreatePr(createPrContext),
    handleAddPrComment: () => handleAddPrComment(addPrCommentContext),
  }

  function executeAction(actionId: string) {
    actionMenuFeature.executeAction(actionId, {
      state,
      setState: (fn) => { state = fn(state) },
      toast,
      render,
      filePicker,
      commentsPicker,
      occurrencePicker,
      marksPicker,
      commitPicker,
      actionMenu,
      linePeek,
      feed: activityFeed,
      prInfoFilter,
      diffOptions,
      handlers: actionHandlers,
      commandKeys: paletteKeys,
      runCommand: paletteCommandRunner(dispatchKeypress.keymap, jumpRecording),
      reactionTarget,
    })
  }

  // Bridges the React… submenu's Enter key to the reaction toggle handler
  // (spec 042). Called from the action-menu input handler after the
  // palette has closed.
  async function handleToggleReaction(target: ReactionTarget, rowId: string) {
    const content = reactionContentFromRowId(rowId)
    if (!content) return
    await reactions.toggleReaction(
      {
        getState: () => state,
        setState: (fn) => { state = fn(state) },
        toast,
        // A reaction on the body, a conversation comment or a review lives
        // in `prInfo`, which the panel keeps its own copy of — hand the new
        // one over before drawing, or the pill never appears (spec 042).
        render: () => {
          if (state.prInfo) prInfoPanel?.setPrInfo(state.prInfo)
          render()
        },
      },
      target,
      content,
    )
  }

  // ===== COMMIT SELECTION =====
  const commitSelectionContext: CommitSelectionContext = {
    getState: () => state,
    setState: setAppState,
    commitDiffs,
    fileContent,
    fileFolds,
    toast,
    render,
    resetCursor: () => { vimState = createCursorState() },
    rebuildLineMapping: () => { createLineMapping() },
    // Drawing the new commit's mapping reveals the cursor wherever it is, so
    // the placement waits for revealFile to have moved it.
    revealFileAtTop: (fileIndex) => {
      diffViewport.onceRebuilt(() => diffViewport.scrollCursorTo(vimState.line, "top"))
      fileNavigation.revealFile(fileIndex, fileNavContext)
    },
    load: commitScopeLoadContext,
  }

  const feedLoadContext: feedFeature.FeedLoadContext = {
    getState: () => state,
    feed: activityFeed,
    render,
  }

  const openBranchPr = createBranchPrOpener({
    sources: liveOpenBranchPrSources,
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    setHeadSha: (sha) => { currentHeadSha = sha },
    setVimState: (s) => { vimState = s },
    rebuildLineMapping: createLineMapping,
    recreatePrInfoPanel: refreshContext.recreatePrInfoPanel,
    updateFileTreePanel,
    render,
    toast,
    lastRefresh,
    globalMarks,
    activityFeed,
    visit,
    features: anotherReviewFeatures,
    fileFolds,
    pendingReviewLoad,
  })

  // ===== KEYBOARD INPUT =====
  const dispatchKeypress = createAppKeys(renderer, {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    toast,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    getCommentScope: split.commentScope,
    rebuildLineMapping: createLineMapping,
    getPane: marksContext.getPane,
    setPane: marksContext.setPane,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    renderer,
    cursorView: diffViewport,
    fileTreePanel,
    threadPanelLayout: () => threadPanel.layout(),
    getPrInfoPanel: () => prInfoPanel,
    vimHandler,
    searchHandler,
    flashHandler,
    render,
    quit,
    ensureCursorVisible,
    toggleSplitView: handleToggleSplitView,
    updateFileTreePanel,
    handleExpandDivider,
    handleYank: (opts: { raw: boolean }) => yank.handleYank(yankContext, opts),
    handleCopyCommentLink: (comment) => permalink.handleCopyCommentLink(permalinkContext, comment),
    executeAction,
    toggleOpenThreadsOnly,
    toggleUnviewedFilesOnly: toggleUnviewedFiles,
    onToggleReaction: handleToggleReaction,
    reactionTarget,
    onCommitSelected: (sha, filename, scope) => { void handleCommitSelected(commitSelectionContext, sha, filename, scope) },
    openBranchPr: (view) => { void openBranchPr(view) },
    foldsContext,
    fileNavContext,
    commentsContext,
    externalToolsContext,
    prOperationsContext,
    refreshContext: { handleRefresh: () => refresh.handleRefresh(refreshContext) },
    feedLoadContext,
    reviewPreviewOpenContext,
    readReviewSummary: islands.reviewPreview.summaryValue,
    composer: threadPanel.composer,
    syncPreviewOpenContext,
    prInfoPanelOpenContext,
    threadMotionContext,
    marksContext,
    blame,
    chat: { state: chat, column: chatColumnState, input: chatColumn.input, atPicker: chatColumn.atPicker },
    help,
    confirm,
    previewDeploys,
    syncPreview,
    reviewPreview,
    filePicker,
    commentsPicker,
    occurrencePicker,
    marksPicker,
    marks: globalMarks,
    commitPicker,
    actionMenu,
    linePeek,
    blamePeek,
    blameColumns,
    mentions,
    commentDrafts,
    composerPickers,
    codePeek,
    prCommentInput,
    prInfoFilter,
    diffOptions,
    blockFolds,
    fileFolds,
    renderedMarkdown,
    fileContent,
    loadFileContent,
    activityFeed,
    visit,
    jumpList,
    composerSettled: proposals.composerSettled,
  })
  paletteKeys = dispatchKeypress.commandKeys

  const jumpRecording = createJumpRecording({
    getState: () => state,
    jumpList,
    filePicker,
    commentsPicker,
    occurrencePicker,
    marksPicker,
    commitPicker,
    actionMenu,
    activityFeed,
    prInfoFilter,
    diffOptions,
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    getPane: marksContext.getPane,
    searchActive: () => searchState.active,
    flashActive: () => flashState.active,
    chordPending: () => dispatchKeypress.chordPending(),
    landCursor: () => {
      if (state.viewMode === "diff") diffViewport.onceRebuilt(() => diffViewport.landCursor(vimState.line))
    },
  })

  function handleKeypress(key: KeyEvent) {
    jumpRecording.around(key, () => dispatchKeypress(key))
  }

  renderer.keyInput.on("keypress", handleKeypress)

  // ===== INITIAL RENDER =====
  render()

  // The file riff opened on, read after the first frame rather than before
  // it: the list is on screen while the file arrives (spec 084).
  requestFileModeContent()

  // What moved since the last visit (spec 069): the files, from one git
  // call, and — when the branch was rewritten under the reader — a word
  // about why riff is not answering that question at all.
  const watermark = visit.watermark()
  if (watermark && state.appMode === "pr") {
    if (visit.rebased()) {
      toast.show("Rebased since your last visit — going by times instead", "info")
      render()
      setTimeout(() => { toast.clear(); render() }, 4000)
    } else {
      void filesChangedBetween(watermark.lastSeenHeadSha, currentHeadSha).then((changed) => {
        if (changed.size === 0) return
        visit.setChangedFiles(changed)
        render()
      })
    }
  }

  if (mode === "pr" && prInfo) {
    void loadPendingReview(pendingReviewLoad, prInfo)
  }

  // Fetch the repo's @mention pool in the background (spec 046). Silent and
  // best-effort — the picker works off PR participants until it lands.
  startMentionPrefetch({
    mentions,
    render,
    mode,
    prInfo: prInfo ?? null,
  })

  // Resolve the PRs and issues the description and comments point at (spec
  // 059). Same deal: the panels read the answers as they render.
  const referenceContext = {
    getState: () => state,
    render,
  }

  startReferencePrefetch(referenceContext)

  // The branch may already have a pull request open on it (spec 079). Asked
  // in the background: it costs a `gh` call, and a local review that never
  // looks at the header should not wait for one.
  if (mode === "local") {
    void findCurrentPr().then(async (branchPr) => {
      if (!branchPr) return
      state = { ...state, branchPr }
      render()

      // And the review on it, if riff has already fetched one (spec 094).
      const review = await loadBranchPrReview(branchPr)
      const anchored = commentsWithRows(review, state.files, state.fileMode)
      if (anchored.length === 0) return
      state = { ...state, comments: [...state.comments, ...anchored] }
      render()
    })
  }

  // Silently poll GitHub for new / updated review comments so replies show up
  // without a manual refresh. Each tick guards on state's review, so a local
  // review that opens its branch's PR starts polling it; interval is unref'd.
  const pollConfig = loadConfig().poll
  const commentPoll = startCommentPoll({
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    // The poll renders only when the comments actually changed, which is
    // exactly when a reference riff has not seen can have arrived.
    render: () => {
      render()
      startReferencePrefetch(referenceContext)
    },
    recreatePrInfoPanel: commentPollRebuild(refreshContext.recreatePrInfoPanel),
    prCommentInputOpen: prCommentInput.isOpen,
    getHeadSha: () => currentHeadSha,
    lastRefresh,
    intervalSeconds: pollConfig.interval,
    onFocus: pollConfig.onFocus,
  })

  // Focus gates the poller: no point spending API quota on a pane the user
  // switched away from, and coming back should show current comments without
  // waiting out the interval. A local review has nothing to poll, but an
  // editor or a Claude session retiring comments through `riff comments`
  // changes its working copy and .riff/ while riff is in the background, so a
  // regain re-reads both; it's local disk, no quota.
  if (reportsFocus(pollConfig, mode)) {
    stopFocusReporting = setupFocusReporting(renderer, focusHandler({
      appMode: () => state.appMode,
      setPollFocused: commentPoll.setFocused,
      reloadLocal: () => void refresh.handleRefresh(refreshContext),
    }))
  }

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
