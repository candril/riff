import { createTestRenderer } from "@opentui/core/testing"
import { createFileTreeIsland } from "../app/file-tree"
import { createThreadPanelIsland } from "../app/thread-panel"
import { createChatColumnIsland } from "../app/chat-column"
import { createChatState } from "../features/chat/state"
import { chatAtCandidates } from "../features/chat/at-candidates"
import { createHelpState } from "../features/help/state"
import { createConfirmState } from "../features/confirm/state"
import { createSyncPreviewState } from "../features/sync-preview/state"
import { createReviewPreviewState } from "../features/review-preview/state"
import { createPendingReviewState } from "../features/review-preview/pending-state"
import { createToastState } from "../features/toast/state"
import { createLastRefreshState } from "../features/refresh/last-refresh-state"
import { createPrCommentInputState } from "../features/pr-info-panel/comment-input-state"
import { createPrInfoFilterState } from "../features/pr-info-panel/filter-state"
import { createDiffOptionsState } from "../features/diff-view/options-state"
import { createFileContentState } from "../features/file-content/state"
import { createFilePickerState } from "../features/file-picker/state"
import { createCommentsPickerState } from "../features/comments-picker/state"
import { createOccurrencePickerState } from "../features/occurrence-picker/state"
import { createMarksPickerState } from "../features/marks/picker-state"
import { createMarksState } from "../features/marks/state"
import { createFeedState } from "../features/feed/state"
import { createVisitState } from "../features/visit/state"
import { filesWithUnseen } from "../utils/visit"
import { createCommitPickerState } from "../features/commit-picker/state"
import { createActionMenuState } from "../features/action-menu/state"
import { createLinePeekState } from "../features/line-peek/state"
import { createBlamePeekState } from "../features/blame/peek-state"
import { createBlameColumnsState } from "../features/blame/column-state"
import { createMentionsState } from "../features/mentions/state"
import { createCommentDraftsState } from "../features/inline-comment-overlay/drafts-state"
import { createJumpListState } from "../features/jumplist/state"
import { diffCursorPosition, reviewReferences } from "../app/review-chat"
import { fakeAgent } from "../features/chat/fake-agent"
import { createInitialState, type AppState } from "../state"
import { parseDiff } from "../utils/diff-parser"
import { buildFileTree } from "../utils/file-tree"
import { createCursorState } from "../vim-diff/cursor-state"
import { createFlashState } from "../vim-diff/flash-state"
import { FileParses } from "../vim-diff/file-parses"
import { createSearchState } from "../vim-diff/search-state"
import { buildLineMapping } from "../app/init"
import { createFramePass, type FramePassContext } from "../app/frame-pass"
import { createStatusBarIsland } from "../app/status-bar"
import { createFeedIsland } from "../app/feed"
import { createFrameIslands, followFrame, frameIslandHosts } from "../app/overlays"
import { createPrInfoPanelFollower } from "../app/pr-info-panel-follower"
import type { PRInfoPanelClass } from "../components/PRInfoPanel"
import { createComposerFollower } from "../app/composer-follower"
import { createPromptFollower } from "../app/prompt-follower"
import { writePrompt } from "../app/open-prompt"
import { promptIslandsOf } from "../app/prompt-routing"
import { createFrame } from "../app/frame"
import { createTreeHighlightSync } from "../app/tree-highlight"
import { createAppShell } from "../app/shell"
import { createDiffHighlights } from "../app/diff-highlights"
import { createSplitDiff } from "../app/split-diff"
import { createUnifiedDiff } from "../app/unified-diff"
import type { adoptReloadedState } from "../features/refresh/handlers"
import { trimFrame } from "./frame"

/** The host's laid-out size reaches the diff a tick after the frame that laid it out. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * riff's whole render pass on a test screen: every island real, wired the
 * way app.ts wires them, with highlighting that never lands so frames stay
 * deterministic.
 */
export async function mountApp(
  raw: string,
  { width = 120, height = 24, refreshClock }: { width?: number; height?: number; refreshClock?: () => string } = {}
) {
  const setup = await createTestRenderer({ width, height })
  const renderer = setup.renderer
  const files = parseDiff(raw)
  let state: AppState = createInitialState(files, buildFileTree(files), "test", "")
  let vimState = createCursorState()
  let searchState = createSearchState()
  let flashState = createFlashState()
  const diffOptions = createDiffOptionsState({ wrap: false, alignMarkdownTables: true })
  const fileContent = createFileContentState()
  let mapping = buildLineMapping(state, diffOptions, fileContent)
  const fileTreePanel = createFileTreeIsland(renderer, { width: 35 })
  const parses = new FileParses(async () => null)
  // None unless a test mounts one, as app.ts has none outside a PR.
  let prInfoPanel: PRInfoPanelClass | null = null
  let render = () => {}
  let updateSearchPattern = (_value: string) => {}
  const highlights = createDiffHighlights(parses, () => render(), async () => null)
  const diffDeps = {
    renderer,
    highlights,
    scrollOff: 2,
    getState: () => state,
    diffOptions,
    fileContent,
    getMapping: () => mapping,
    getVimState: () => vimState,
    filePanelWidth: () => fileTreePanel.getWidth(),
  }
  const split = createSplitDiff({ ...diffDeps, onShownChanged: () => render() })
  const unified = createUnifiedDiff(diffDeps)

  const reviewPreview = createReviewPreviewState()
  const pendingReview = createPendingReviewState()
  const toast = createToastState()
  const lastRefresh = createLastRefreshState(refreshClock)
  const prCommentInput = createPrCommentInputState()
  const prInfoFilter = createPrInfoFilterState()
  const islands = createFrameIslands(renderer, {
    onSummaryChange(value) {
      if (reviewPreview.open()) reviewPreview.setBody(value)
      render()
    },
  })
  // The fake answers only when a test tells it to, so nothing here ever reaches Claude.
  const agent = fakeAgent()
  const chat = createChatState(
    agent.agent,
    diffCursorPosition({
      getState: () => state,
      getVimState: () => vimState,
      getMapping: () => mapping,
      getScope: () => split.commentScope(),
      getRows: () => split.splitRows(),
    }),
    reviewReferences(() => state),
  )
  const chrome = {
    statusBar: createStatusBarIsland(renderer),
    threadPanel: createThreadPanelIsland(renderer),
    chatColumn: createChatColumnIsland(renderer, chat, () => chatAtCandidates(state)),
    feed: createFeedIsland(renderer),
  }
  const shell = createAppShell(renderer, {
    ...frameIslandHosts(islands),
    tree: fileTreePanel.host,
    threadPanel: chrome.threadPanel.host,
    chat: chrome.chatColumn.host,
    statusBar: chrome.statusBar.host,
  })
  const frame = createFrame()
  const help = createHelpState()
  const confirm = createConfirmState()
  const syncPreview = createSyncPreviewState()
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
  const jumpList = createJumpListState()
  const marks = createMarksState()
  const activityFeed = createFeedState()
  const visit = createVisitState()
  // Empty until keysOn builds the keys, as app.ts's are until createAppKeys has run.
  let commandKeys: ReadonlyMap<string, string> = new Map()
  const setState = (updater: (s: AppState) => AppState) => {
    state = updater(state)
  }
  followFrame(
    frame.frame,
    {
      ...islands,
      ...chrome,
      composer: createComposerFollower(chrome.threadPanel.compose, { getState: () => state, setState, render: () => render(), mentions }),
      prompt: createPromptFollower(
        promptIslandsOf(islands, chrome.feed, chrome.threadPanel),
        writePrompt({ getState: () => state, setState, feed: activityFeed, prInfoFilter, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, updateSearchPattern: (value) => updateSearchPattern(value) }, () => render())
      ),
      prInfoPanel: createPrInfoPanelFollower(() => prInfoPanel),
    },
    shell
  )

  const treeHighlight = createTreeHighlightSync(fileTreePanel)
  const framePassContext: FramePassContext = {
    getState: () => state,
    setState,
    getVimState: () => vimState,
    getLineMapping: () => mapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    getCachedCurrentUser: () => null,
    getPrInfoPanel: () => prInfoPanel,
    renderer,
    shell,
    feed: chrome.feed,
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
    marks,
    activityFeed,
    visit,
    mentions,
    commentDrafts,
    getCommandKeys: () => commandKeys,
    updateFileTreePanel() {
      state = treeHighlight.sync(state, mapping.getLine(vimState.line)?.filename ?? null, (synced) =>
        fileTreePanel.update({
          files: synced.files,
          fileTree: synced.fileTree,
          highlightIndex: synced.treeHighlightIndex,
          selectedFileIndex: synced.selectedFileIndex,
          focused: synced.focusedPanel === "tree",
          fileStatuses: synced.fileStatuses,
          ignoredFiles: synced.ignoredFiles,
          showHiddenFiles: synced.showHiddenFiles,
          treeFilter: synced.treeFilter,
          treeFilterInput: synced.treeFilterInput,
          unseenFiles: filesWithUnseen(synced.comments, visit.watermark()),
          changedSinceVisit: visit.changedFiles(),
          unviewedOnly: synced.treeUnviewedOnly ? { keep: synced.treeKeptFile } : null,
        })
      )
      fileTreePanel.visible = state.showFilePanel
    },
    publishFrame: frame.publish,
  }
  render = createFramePass(framePassContext)
  // Keys tests reach the composer through the thread panel, and the frame
  // pass's context does not carry it.
  const ctx = { ...framePassContext, threadPanel: chrome.threadPanel }

  return {
    setup,
    ctx,
    /** The islands that follow the frame rather than the render context. */
    islands,
    statusBar: chrome.statusBar,
    chatColumn: chrome.chatColumn,
    /** The one conversation with riff's agent, which outlives the column's opening and closing. */
    chat,
    /** The help overlay's state, which the frame pass reads as app.ts's does. */
    help,
    /** The confirm dialog's state, which the frame pass and the keys read as app.ts's do. */
    confirm,
    /** The sync preview's state, which the frame pass and the keys read as app.ts's do. */
    syncPreview,
    /** Submit Review's state, which the frame pass and the keys read as app.ts's do. */
    reviewPreview,
    /** GitHub's pending review, which the frame pass and the PR operations read as app.ts's do. */
    pendingReview,
    /** The toast's state, which the frame pass reads and the keys show and clear as app.ts's do. */
    toast,
    /** When riff last confirmed the review current, which the frame pass reads and a reload stamps as app.ts's do. */
    lastRefresh,
    /** The PR overview's comment prompt, which the frame pass reads and the overview's keys write as app.ts's do. */
    prCommentInput,
    /** The PR overview's filter, which the frame pass reads and the overview's keys write as app.ts's do. */
    prInfoFilter,
    /** The diff's wrap, split and table alignment, which the diff views read and the keys toggle as app.ts's do. */
    diffOptions,
    /** The expanded context, which the diff views and the mapping read as app.ts's do. */
    fileContent,
    /** The file picker's state, which the frame pass and the keys read as app.ts's do. */
    filePicker,
    /** The comments picker's state, which the frame pass and the keys read as app.ts's do. */
    commentsPicker,
    /** The occurrence picker's state, which the frame pass and the keys read as app.ts's do. */
    occurrencePicker,
    /** The marks picker's state, which the frame pass and the keys read as app.ts's do. */
    marksPicker,
    /** The global marks, which the frame pass and the keys read as app.ts's do. */
    marks,
    /** The commit picker's state, which the frame pass and the keys read as app.ts's do. */
    commitPicker,
    /** The command palette's state, which the frame pass and the keys read as app.ts's do. */
    actionMenu,
    /** The line peek's state, which the frame pass and the keys read as app.ts's do. */
    linePeek,
    /** The blame peek's state, which the frame pass and the keys read as app.ts's do. */
    blamePeek,
    /** The blame columns' state, which the frame pass and the keys read as app.ts's do. */
    blameColumns,
    /** The @mention pool's state, which the frame pass and the keys read as app.ts's do. */
    mentions,
    /** The comment composer's kept drafts, which the frame pass and the keys read as app.ts's do. */
    commentDrafts,
    /** The jumplist, which the keys walk and the jump recording pushes to as app.ts's do. */
    jumpList,
    /** The activity feed's state, which the frame pass and the keys read as app.ts's do. */
    activityFeed,
    /** The visit watermark's state, which the frame pass and the keys read as app.ts's do. */
    visit,
    fileTreePanel,
    render,
    agent,
    /** Applies `patch` and renders, rebuilding the mapping when the files changed. */
    show(patch: Partial<AppState> = {}) {
      state = { ...state, ...patch }
      if (patch.files) mapping = buildLineMapping(state, diffOptions, fileContent)
      render()
    },
    setVimState(next: typeof vimState) {
      vimState = next
    },
    /** The PR overview the view slot shows in viewMode "state"; the test builds it and destroys it. */
    setPrInfoPanel(panel: PRInfoPanelClass | null) {
      prInfoPanel = panel
    },
    /** The palette's hints, which keysOn reads off the keys it builds. */
    setCommandKeys(next: ReadonlyMap<string, string>) {
      commandKeys = next
    },
    setSearchState(next: typeof searchState) {
      searchState = next
    },
    setFlashState(next: typeof flashState) {
      flashState = next
    },
    /** Where what is typed into the search line goes; nowhere until a test wires a handler. */
    onSearchPattern(update: (value: string) => void) {
      updateSearchPattern = update
    },
    async frame() {
      await setup.renderOnce()
      await nextTick()
      await setup.renderOnce()
      return trimFrame(setup.captureCharFrame())
    },
    async dispose() {
      await setup.waitForVisualIdle().catch(() => {})
      renderer.destroy()
    },
  }
}

/** What adoptReloadedState needs, taken from the mounted app as app.ts hands it over on a reload. */
export function reloadCtx(mounted: Awaited<ReturnType<typeof mountApp>>): Parameters<typeof adoptReloadedState>[0] {
  const { help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, linePeek, blamePeek, blameColumns, commentDrafts, jumpList, pendingReview, toast, prCommentInput, lastRefresh, fileContent } = mounted
  return { getState: mounted.ctx.getState, setState: mounted.ctx.setState, help, confirm, syncPreview, reviewPreview, filePicker, commentsPicker, occurrencePicker, marksPicker, commitPicker, actionMenu, linePeek, blamePeek, blameColumns, commentDrafts, jumpList, pendingReview, toast, prCommentInput, lastRefresh, fileContent }
}
