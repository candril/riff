import type { KeyEvent } from "@opentui/core"
import { PRInfoPanelClass, getVisibleFlatTreeItems } from "./components"
import { VERTICAL_SCROLL_OFF } from "./components/VimDiffView"
import { getFileContent, getOldFileContent, getLocalCommitDiff, filesChangedBetween } from "./providers/local"
import { getPrFileContent, getPrBaseFileContent, getPendingReview, getPrDiff, editPullRequest, createPullRequest, loadPrSession, fetchCommitDiff, submitPrComment, fetchStackInfo } from "./providers/github"
import {
  setFileContentLoading,
  setFileContent,
  setFileContentError,
  expandDivider,
  setExpandingDivider,
  expandFiles,
  openActionMenu,
  setPendingReview,
  setViewingCommit,
  showToast,
  clearToast,
  createInitialState,
  promptOpen,
  setViewFilter,
  filesWithUnseenComments,
  type AppState,
  setTreeFilter,
} from "./state"
import { type AppMode, type Comment } from "./types"
import { openPrEditor, openPrCreator, openPrCommentEditor } from "./utils/editor"
import { setupFocusReporting } from "./utils/focus-reporting"
import { loadConfig } from "./config"
import { detectPreviews } from "./utils/previews"
import { markVisit } from "./utils/visit"
import { saveVisitSync } from "./storage"
import { parseDiff, sortFiles } from "./utils/diff-parser"
import { buildFileTree } from "./utils/file-tree"
import type { PrInfo } from "./providers/github"

// App submodules
import { initializeAppState, initializeRenderer, buildLineMapping } from "./app/init"
import { createRenderFunction } from "./app/render"
import { createKeyHandler } from "./app/global-keys"

// Feature modules
import * as actionMenu from "./features/action-menu"
import * as filePicker from "./features/file-picker"
import * as prInfoPanelFeature from "./features/pr-info-panel"
import * as syncPreview from "./features/sync-preview"
import * as reviewPreview from "./features/review-preview"
import * as fileTreeFeature from "./features/file-tree"
import * as diffView from "./features/diff-view"
import * as folds from "./features/folds"
import * as fileNavigation from "./features/file-navigation"
import * as commentsFeature from "./features/comments"
import * as externalTools from "./features/external-tools"
import * as aiReview from "./features/ai-review"
import * as permalink from "./features/permalink"
import { startMentionPrefetch } from "./features/mentions"
import { startReferencePrefetch } from "./features/references"
import * as yank from "./features/yank"
import * as jumplist from "./features/jumplist"
import * as prOperations from "./features/pr-operations"
import * as threadMotion from "./features/thread-motion"
import * as refresh from "./features/refresh"
import * as feedFeature from "./features/feed"
import { startCommentPoll } from "./features/comment-poll"
import * as reactions from "./features/reactions"
import { reactionContentFromRowId } from "./features/action-menu"
import type { ReactionTarget } from "./types"

// Vim navigation imports
import type { VimCursorState } from "./vim-diff/types"
import { VimMotionHandler } from "./vim-diff/motion-handler"
import { createSearchState, type SearchState } from "./vim-diff/search-state"
import { createFlashState, type FlashState } from "./vim-diff/flash-state"
import { FlashHandler } from "./vim-diff/flash-handler"
import { SearchHandler } from "./vim-diff/search-handler"
import { createCursorState, isVisualMode } from "./vim-diff/cursor-state"
import type { DiffLineMapping } from "./vim-diff/line-mapping"

export interface AppOptions {
  mode?: AppMode
  target?: string
  // For PR mode - pre-loaded data
  diff?: string
  comments?: Comment[]
  prInfo?: PrInfo
  // GitHub viewed statuses (from PR load)
  githubViewedStatuses?: Map<string, boolean>
  // PR head commit SHA (for tracking viewed at commit)
  headSha?: string
}

export async function createApp(options: AppOptions = {}) {
  const { mode = "local", prInfo } = options

  // ===== INITIALIZATION =====
  // State first, renderer second: the renderer starts reading stdin as soon
  // as it exists, and a key typed before the keypress handler is wired up is
  // read and dropped. Loading first keeps that window shut.
  const { state: initialState, source, headSha: initialHeadSha } = await initializeAppState({
    mode,
    target: options.target,
    diff: options.diff,
    comments: options.comments,
    prInfo: options.prInfo,
    githubViewedStatuses: options.githubViewedStatuses,
    headSha: options.headSha,
  })

  const { renderer, fileTreePanel, vimDiffView } = await initializeRenderer()

  let stopFocusReporting: (() => void) | null = null

  // ===== MUTABLE STATE =====
  let state: AppState = initialState
  let vimState: VimCursorState = createCursorState()
  /** The mode the status bar was last drawn for. */
  let lastCursorMode = vimState.mode
  let searchState: SearchState = createSearchState()
  let flashState: FlashState = createFlashState()
  let lineMapping: DiffLineMapping = buildLineMapping(initialState)
  // Tree filter the current mapping was built against, so a filter change can
  // be spotted from the panel update every filter path already goes through.
  let mappedTreeFilter: string = initialState.treeFilter
  let currentHeadSha = initialHeadSha
  let cachedCurrentUser: string | null = null
  // Persistent for PR sessions (spec 041); null in local mode.
  let prInfoPanel: PRInfoPanelClass | null =
    mode === "pr" && prInfo
      ? new PRInfoPanelClass(renderer, prInfo, initialState.files, initialState.comments)
      : null

  // Seed the reaction target from the panel's initial focus so `Ctrl+p` →
  // React… is available on the very first frame in PR mode (spec 042).
  if (prInfoPanel) {
    state = { ...state, reactionTarget: prInfoPanel.getReactionTarget() }
  }

  /** Hooks a panel instance — the first or a replacement — up to the app. */
  function wirePrInfoPanel(panel: PRInfoPanelClass): void {
    panel.setOnExternalRerender(() => render())
    panel.setOnFilterChange((value) => {
      state = setViewFilter(state, value)
      render()
    })
    refreshPreviews(panel)
    void readStack(panel)
  }

  /**
   * Whether this PR is stacked on another, and how that base has moved
   * since this one branched (spec 072). Three REST calls at most, after the
   * first render — and a word on opening when the base was rewritten, since
   * that changes what the diff means and is the thing least likely guessed.
   */
  async function readStack(panel: PRInfoPanelClass): Promise<void> {
    if (!state.prInfo) return
    const { owner, repo, baseRef } = state.prInfo
    const stack = await fetchStackInfo(owner, repo, baseRef, currentHeadSha)
    if (prInfoPanel !== panel) return
    const announce = stack?.status === "rewritten" && state.stack?.status !== "rewritten"
    state = { ...state, stack }
    panel.setStack(stack)
    if (announce && stack) {
      state = showToast(state, `Stacked on #${stack.basePr.number}, which was rewritten since you branched — rebase`, "info")
      setTimeout(() => { state = clearToast(state); render() }, 5000)
    }
    render()
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
  }

  // ===== HELPERS =====
  // searchHandler is defined later, but we need a reference in createLineMapping
  let searchHandlerRef: SearchHandler | null = null

  function createLineMapping() {
    lineMapping = buildLineMapping(state)
    mappedTreeFilter = state.treeFilter
    // Refresh search matches for the new line mapping
    // This ensures search results are updated when switching files
    searchHandlerRef?.refreshMatches()
    return lineMapping
  }

  function quit() {
    // Leave the watermark: this is the "last time I looked" the next visit
    // measures against (spec 069). Written on the way out and on refresh,
    // never continuously — a live watermark would answer "since a moment
    // ago", which is never useful.
    writeVisitWatermark()
    // Mode 1004 outlives the process if we don't turn it off — the shell that
    // gets the terminal back would start receiving focus escape sequences.
    stopFocusReporting?.()
    // Files installed into the repo for a Claude session (slash command,
    // skill) — the renderer's teardown drops the exit hook that would
    // otherwise remove them.
    aiReview.removeSessionFiles()
    renderer.destroy()
    process.exit(0)
  }

  function writeVisitWatermark(): void {
    if (state.appMode !== "pr") return
    saveVisitSync(state.source, markVisit(state.comments, currentHeadSha, state.seenCommentIds))
  }

  // ===== POST-PROCESS (cursor positioning) =====
  // Prompts draw their own cursor now that they are real input widgets
  // (spec 065); the views that have no cursor of their own park it.
  renderer.addPostProcessFn(() => {
    if (state.viewMode !== "diff" && !promptOpen(state)) {
      renderer.setCursorPosition(0, 0, false)
    }
  })

  // ===== VIEWPORT & SCROLL =====
  const SCROLL_OFF = VERTICAL_SCROLL_OFF

  function getViewportHeight(): number {
    const scrollBox = vimDiffView.getScrollBox()
    return scrollBox ? Math.floor(scrollBox.height) : 20
  }

  function ensureCursorVisible(): void {
    const scrollBox = vimDiffView.getScrollBox()
    if (!scrollBox) return

    // In all-files mode, the cursor line (mapping index) may not equal
    // the visual row in the scrollbox due to file headers and collapsed files.
    // Use cursorLineToVisualRow to get the actual visual position.
    const visualRow = vimDiffView.cursorLineToVisualRow(vimState.line)
    if (visualRow < 0) return

    const scrollTop = scrollBox.scrollTop
    const viewportHeight = Math.floor(scrollBox.height)
    const maxScroll = Math.max(0, scrollBox.scrollHeight - viewportHeight)

    const topThreshold = scrollTop + SCROLL_OFF
    const bottomThreshold = scrollTop + viewportHeight - SCROLL_OFF - 1

    let effectiveScrollTop = scrollTop

    if (visualRow < topThreshold) {
      const newScrollTop = Math.max(0, visualRow - SCROLL_OFF)
      scrollBox.scrollTop = newScrollTop
      effectiveScrollTop = newScrollTop
    } else if (visualRow > bottomThreshold) {
      const newScrollTop = Math.min(maxScroll, visualRow - viewportHeight + SCROLL_OFF + 1)
      scrollBox.scrollTop = newScrollTop
      effectiveScrollTop = newScrollTop
    }

    vimDiffView.setExpectedScrollTop(effectiveScrollTop)

    // The diff never wraps, so a long line needs the same treatment on
    // the other axis: `$`, `w` or a search match past the right edge
    // would otherwise move the cursor somewhere the viewport isn't.
    vimDiffView.revealColumn(vimState.line, vimState.col)

    // The tree follows from here rather than from the render pass: a
    // motion updates the cursor and the viewport without re-rendering the
    // app, so `j` would never have reached the tree at all.
    if (syncTreeHighlightToCursor()) {
      refreshFileTreePanel()
      fileTreePanel.ensureHighlightVisible()
    }
  }

  // When the diff view rebuilds its content (folds, mark-as-read,
  // comments), it restores the prior scroll position and then asks us to
  // bring the cursor back into view — in the post-process pass, where the
  // new scrollBox's layout is settled. This keeps the viewport on the
  // cursor line instead of jumping to the top.
  vimDiffView.setOnContentRebuilt(ensureCursorVisible)

  // A mouse wheel moves the viewport and nothing else — no key is pressed,
  // so no handler runs. Dragging the cursor along keeps it in the window
  // the way vim does, and carries the tree highlight with it.
  //
  // The cursor is moved to fit the view here, never the other way round:
  // calling ensureCursorVisible would scroll the view back and fight the
  // wheel.
  vimDiffView.setOnCursorScrolledAway((line) => {
    const content = lineMapping.getLineContent(line)
    vimState = {
      ...vimState,
      line,
      col: Math.min(vimState.col, Math.max(0, content.length - 1)),
      selectionAnchor: isVisualMode(vimState) ? vimState.selectionAnchor : null,
    }
    vimDiffView.updateCursor(vimState)
    render()
  })

  // The filter box owns its text while typing; state mirrors every keystroke
  // so the tree narrows live and every highlight lookup sees the same list.
  fileTreePanel.setOnFilterChange((value: string) => {
    state = setTreeFilter(state, value)
    updateFileTreePanel()
    render()
  })

  /**
   * Point the tree at the file the diff cursor is in.
   *
   * Only in the all-files view, and only while the tree is not the panel
   * being driven: `j`/`k` there moves the highlight without moving the
   * diff, and a multi-select range would be dragged out from under the
   * user. A file inside a collapsed directory is left alone rather than
   * expanded — scrolling past it should not undo a fold.
   *
   * Returns true when the highlight moved, so the panel can scroll it
   * into view.
   */
  function syncTreeHighlightToCursor(): boolean {
    if (state.selectedFileIndex !== null) return false
    if (state.focusedPanel === "tree" || state.treeSelectionAnchor !== null) return false

    const filename = lineMapping.getLine(vimState.line)?.filename
    if (!filename) return false

    const items = getVisibleFlatTreeItems(
      state.fileTree,
      state.files,
      state.ignoredFiles,
      state.showHiddenFiles,
      state.treeFilter
    )
    const index = items.findIndex(
      (item) => item.fileIndex !== undefined && state.files[item.fileIndex]?.filename === filename
    )
    if (index === -1 || index === state.treeHighlightIndex) return false

    state = { ...state, treeHighlightIndex: index }
    return true
  }

  /** Push the current state into the tree panel. */
  function refreshFileTreePanel(): void {
    fileTreePanel.update(
      state.files,
      state.fileTree,
      state.treeHighlightIndex,
      state.selectedFileIndex,
      state.focusedPanel === "tree",
      state.fileStatuses,
      state.collapsedFiles,
      state.ignoredFiles,
      state.showHiddenFiles,
      aiReview.getTreeMultiSelectionFilenames(state),
      state.treeFilter,
      state.treeFilterInput,
      flashState.active && flashState.surface === "tree"
        ? new Map(flashState.rows.map((row) => [Number(row.id), row.label]))
        : new Map(),
      filesWithUnseenComments(state),
      state.filesChangedSinceVisit
    )
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

    const followedCursor = syncTreeHighlightToCursor()

    // Calculate file panel width based on expanded state
    const normalWidth = 35
    const terminalWidth = process.stdout.columns || 80
    const expandedWidth = Math.floor(terminalWidth * 0.45)  // 45% of terminal width
    const panelWidth = state.filePanelExpanded ? expandedWidth : normalWidth

    // Update panel width if it changed
    if (fileTreePanel.getWidth() !== panelWidth) {
      fileTreePanel.setWidth(panelWidth)
    }

    refreshFileTreePanel()
    if (followedCursor) {
      fileTreePanel.ensureHighlightVisible()
    }
    fileTreePanel.visible = state.showFilePanel
    vimDiffView.setEmptyMessage(
      state.treeFilter ? `No files match /${state.treeFilter}` : "No changes to display"
    )
    vimDiffView.setFilePanelVisible(state.showFilePanel, panelWidth)
    vimDiffView.setVisible(state.viewMode === "diff")
  }

  // ===== RENDER =====
  const render = createRenderFunction({
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    getCachedCurrentUser: () => cachedCurrentUser,
    getPrInfoPanel: () => prInfoPanel,
    renderer,
    fileTreePanel,
    vimDiffView,
    updateFileTreePanel,
    updateSearchPattern: (value) => searchHandler.updatePattern(value),
  })

  // Give the panel a way to request a re-render from async transitions
  // it owns (e.g., annotation fetches — spec 043), and somewhere to send
  // what is typed into its filter box.
  if (prInfoPanel) wirePrInfoPanel(prInfoPanel)

  // ===== VIM HANDLERS =====
  const vimHandler = new VimMotionHandler({
    getMapping: () => lineMapping,
    getState: () => vimState,
    setState: (newState) => {
      vimState = newState
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
    },
    getViewportHeight,
    onCursorMove: () => {
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
      // The status bar names the visual mode and the size of the selection,
      // and only a full render rebuilds it. Normal-mode motions keep the
      // fast path — nothing up there changes as the cursor moves.
      if (isVisualMode(vimState) || lastCursorMode !== vimState.mode) render()
      lastCursorMode = vimState.mode
    },
  })

  /**
   * Both versions of a file, for expanding context beyond the diff hunks.
   * PR mode pins to the head riff loaded and the PR's base ref rather than
   * re-resolving either — each lookup would be a `gh pr view`, i.e. a
   * GraphQL request, on every expand.
   */
  async function fetchFileVersions(
    filename: string,
  ): Promise<{ ok: true; newContent: string; oldContent: string | null } | { ok: false; error: string }> {
    if (state.appMode === "pr" && state.prInfo) {
      const { owner, repo, number, baseRef } = state.prInfo
      const [head, base] = await Promise.all([
        getPrFileContent(owner, repo, number, filename, currentHeadSha),
        getPrBaseFileContent(owner, repo, number, filename, baseRef),
      ])
      // A file added by the PR has no base version; that's not a failure.
      return head.ok
        ? { ok: true, newContent: head.content, oldContent: base.ok ? base.content : null }
        : { ok: false, error: head.error }
    }

    const [newContent, oldContent] = await Promise.all([
      getFileContent(filename),
      getOldFileContent(filename),
    ])
    return newContent === null
      ? { ok: false, error: "Could not read file from the working tree" }
      : { ok: true, newContent, oldContent }
  }

  const searchHandler = new SearchHandler({
    getMapping: () => lineMapping,
    getSearchState: () => searchState,
    setSearchState: (newState) => { searchState = newState },
    getCursor: () => vimState,
    setCursor: (line, col) => {
      vimState = { ...vimState, line, col }
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
    },
    getFileContent: (filename) => {
      const cached = state.fileContentCache[filename]
      return cached?.newContent ?? null
    },
    loadFileContent: async (filename) => {
      state = setFileContentLoading(state, filename)
      render()

      try {
        const fetched = await fetchFileVersions(filename)
        if (fetched.ok) {
          state = setFileContent(state, filename, fetched.newContent, fetched.oldContent)
        } else {
          state = setFileContentError(state, filename, fetched.error)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = setFileContentError(state, filename, msg)
      }

      render()
    },
    expandDividerForLine: (filename, lineNum) => {
      const dividerKey = lineMapping.findDividerForLine(filename, lineNum)
      if (dividerKey) {
        state = expandDivider(state, dividerKey)
        createLineMapping()
      }
    },
    getCollapsedFiles: () =>
      state.files
        .filter((file) => state.collapsedFiles.has(file.filename))
        .map((file) => ({ filename: file.filename, diff: file.content })),
    expandFiles: (filenames) => {
      state = expandFiles(state, filenames)
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
    setCursor: (line, col) => {
      vimState = { ...vimState, line, col, desiredCol: null }
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
    },
    getVisibleRegion: () => vimDiffView.getVisibleRegion(),
    recordJump: () => { state = jumplist.pushCurrent(state, vimState) },
    jumpToRow: (surface, id) => {
      state = jumplist.pushCurrent(state, vimState)
      if (surface === "tree") {
        state = { ...state, treeHighlightIndex: Number(id), focusedPanel: "tree" }
        updateFileTreePanel()
      } else if (surface === "state") {
        prInfoPanel?.flashJump(id)
        state = { ...state, reactionTarget: prInfoPanel?.getReactionTarget() ?? null }
      } else if (surface === "feed") {
        state = { ...state, feed: { ...state.feed, highlightIndex: Number(id) } }
      }
    },
    onUpdate: () => { render() },
  })

  // ===== EXPAND DIVIDER =====
  async function handleExpandDivider(): Promise<boolean> {
    const dividerKey = lineMapping.getDividerKey(vimState.line)
    if (!dividerKey) return false

    const [filename] = dividerKey.split(":")
    if (!filename) return false

    const cached = state.fileContentCache[filename]
    if (!cached || cached.error) {
      state = setExpandingDivider(setFileContentLoading(state, filename), dividerKey)
      render()

      try {
        const fetched = await fetchFileVersions(filename)
        if (!fetched.ok) {
          state = setExpandingDivider(setFileContentError(state, filename, fetched.error), null)
          render()
          return false
        }

        state = setFileContent(state, filename, fetched.newContent, fetched.oldContent)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = setExpandingDivider(setFileContentError(state, filename, msg), null)
        render()
        return false
      }
    }

    state = setExpandingDivider(expandDivider(state, dividerKey), null)
    createLineMapping()
    render()
    ensureCursorVisible()
    vimDiffView.updateCursor(vimState)
    return true
  }

  // ===== FEATURE CONTEXTS =====

  const refreshContext: refresh.RefreshContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getSearchState: () => searchState,
    setSearchState: (s) => { searchState = s },
    getMapping: () => lineMapping,
    rebuildLineMapping: () => { createLineMapping() },
    revealCursor: () => {
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
    },
    refreshSearchMatches: () => { searchHandler.refreshMatches() },
    reloadFeed: () => { void feedFeature.loadFeed(feedLoadContext) },
    getHeadSha: () => currentHeadSha,
    setHeadSha: (sha) => { currentHeadSha = sha },
    recreatePrInfoPanel: () => {
      if (state.appMode !== "pr" || !state.prInfo) return
      // The panel is where the reader was, not just what it shows: rebuilt
      // from scratch it would drop them back on the collapsed description.
      const panelPosition = prInfoPanel?.capturePosition()
      prInfoPanel?.destroy()
      prInfoPanel = new PRInfoPanelClass(renderer, state.prInfo, state.files, state.comments)
      wirePrInfoPanel(prInfoPanel)
      if (panelPosition) prInfoPanel.restorePosition(panelPosition)
      state = { ...state, reactionTarget: prInfoPanel.getReactionTarget() }
      // Fresh PR data can carry references riff has never looked up.
      startReferencePrefetch(referenceContext)
    },
    mode,
    target: options.target,
    prInfo: prInfo ?? null,
  }

  const reviewPreviewOpenContext: reviewPreview.ReviewPreviewOpenContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    getCachedCurrentUser: () => cachedCurrentUser,
    setCachedCurrentUser: (user) => { cachedCurrentUser = user },
    mode,
  }

  const syncPreviewOpenContext: syncPreview.SyncPreviewOpenContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
  }

  const prInfoPanelOpenContext: prInfoPanelFeature.PRInfoPanelOpenContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
  }

  const foldsContext: folds.FoldsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    rebuildLineMapping: () => { createLineMapping() },
    getFileTreePanel: () => fileTreePanel,
    getVimDiffView: () => vimDiffView,
    updateFileTreePanel,
    ensureCursorVisible,
    render,
  }

  const fileNavContext: fileNavigation.FileNavigationContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    createLineMapping: () => { createLineMapping(); return lineMapping },
    getVimDiffView: () => vimDiffView,
    ensureCursorVisible,
    render,
    mode,
    prInfo: prInfo ?? null,
    source,
    getHeadSha: () => currentHeadSha,
    setHeadSha: (sha) => { currentHeadSha = sha },
  }

  const commentsContext: commentsFeature.CommentsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    render,
    suspendRenderer: () => renderer.suspend(),
    resumeRenderer: () => renderer.resume(),
    source,
    mode,
    prInfo: prInfo ?? null,
    getCachedCurrentUser: () => cachedCurrentUser,
    setCachedCurrentUser: (user) => { cachedCurrentUser = user },
  }

  const externalToolsContext: externalTools.ExternalToolsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    render,
    suspendRenderer: () => renderer.suspend(),
    resumeRenderer: () => renderer.resume(),
    mode,
    prInfo: prInfo ?? null,
    getHeadSha: () => currentHeadSha,
    options,
  }

  const aiReviewContext: aiReview.AiReviewContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    render,
    suspendRenderer: () => renderer.suspend(),
    resumeRenderer: () => renderer.resume(),
    mode,
    prInfo: prInfo ?? null,
    options,
  }

  const yankContext: yank.YankContext = {
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => {
      vimState = s
      vimDiffView.updateCursor(vimState)
    },
    getLineMapping: () => lineMapping,
    render,
  }

  const permalinkContext: permalink.PermalinkContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    render,
    mode,
    prInfo: prInfo ?? null,
    getHeadSha: () => currentHeadSha,
  }

  const prOperationsContext: prOperations.PrOperationsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    source,
    prInfo: prInfo ?? null,
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
  }

  // ===== ACTION EXECUTION =====
  const actionHandlers: actionMenu.ActionHandlers = {
    quit,
    handleRefresh: () => refresh.handleRefresh(refreshContext),
    handleOpenReviewPreview: () => reviewPreview.handleOpenReviewPreview(reviewPreviewOpenContext),
    handleOpenSyncPreview: () => syncPreview.handleOpenSyncPreview(syncPreviewOpenContext),
    handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(commentsContext),
    handleDeleteComment: () => commentsFeature.handleDeleteComment(commentsContext),
    handleClearLocalComments: () => commentsFeature.handleClearLocalComments(commentsContext),
    handleOpenPRInfoPanel: () => prInfoPanelFeature.handleOpenPRInfoPanel(prInfoPanelOpenContext),
    handleOpenFileInEditor: () => externalTools.handleOpenFileInEditor(externalToolsContext),
    handleDiffFileInEditor: (opts) => externalTools.handleDiffFileInEditor(externalToolsContext, opts),
    handleOpenFileInTmuxWindow: () => externalTools.handleOpenFileInTmuxWindow(externalToolsContext),
    handleCheckoutAndEdit: () => externalTools.handleCheckoutAndEdit(externalToolsContext),
    handleOpenExternalDiff: (viewer) => externalTools.handleOpenExternalDiff(viewer, externalToolsContext),
    handleAiReviewContextAware: () => aiReview.handleAiReviewContextAware(aiReviewContext),
    handleAiReviewFull: () => aiReview.handleAiReviewFull(aiReviewContext),
    handleCopyDraftedComment: () => aiReview.handleCopyDraftedComment(aiReviewContext),
    handleDiscardDraftedComment: () => aiReview.handleDiscardDraftedComment(aiReviewContext),
    handleCopyPermalink: (opts) => permalink.handleCopyPermalink(permalinkContext, opts),
    handleCopyPrDiffLink: () => permalink.handleCopyPrDiffLink(permalinkContext),
    handleCopyCommentLink: () => permalink.handleCopyCommentLink(permalinkContext),
    handleExpandDivider,
    handleYank: (opts: { raw: boolean }) => yank.handleYank(yankContext, opts),
    handleShowAllFiles: () => {
      vimState = createCursorState()
      createLineMapping()
    },
    handleOpenFileAlone: () => {
      // The tree and the picker scroll the whole diff now, so this is the
      // way into the single-file view.
      const filename = lineMapping.getLine(vimState.line)?.filename
      const fileIndex = filename ? state.files.findIndex((f) => f.filename === filename) : -1
      if (fileIndex !== -1) {
        fileNavigation.handleSelectFile(fileIndex, fileNavContext)
      }
    },
    handleEditPr: async () => {
      if (!prInfo) return

      // Show loading toast while fetching diff
      state = showToast(state, "Fetching PR diff...", "info")
      render()

      let suspended = false
      try {
        // Fetch the full PR diff for context
        const diff = await getPrDiff(prInfo.number, prInfo.owner, prInfo.repo)

        // Build file summary from current state
        const fileSummary = state.files.map((f) => {
          const prefix = f.status === "added" ? "A" : f.status === "deleted" ? "D" : f.status === "renamed" ? "R" : "M"
          return `${prefix} ${f.filename}`
        })

        // Clear toast and suspend TUI
        state = clearToast(state)
        renderer.suspend()
        suspended = true

        const result = await openPrEditor({
          title: prInfo.title,
          body: prInfo.body,
          diff,
          fileSummary,
        })

        renderer.resume()
        suspended = false

        if (!result) {
          // User cancelled (empty title or editor error)
          render()
          return
        }

        // Check if anything changed
        if (result.title === prInfo.title && result.body === prInfo.body) {
          state = showToast(state, "No changes made", "info")
          render()
          setTimeout(() => {
            state = clearToast(state)
            render()
          }, 2000)
          return
        }

        // Update on GitHub
        state = showToast(state, "Updating PR...", "info")
        render()

        await editPullRequest(prInfo.number, result.title, result.body, prInfo.owner, prInfo.repo)

        // Update local state with new title/body
        state = {
          ...state,
          prInfo: state.prInfo ? { ...state.prInfo, title: result.title, body: result.body } : null,
        }

        state = showToast(state, "PR updated", "success")
        render()
        setTimeout(() => {
          state = clearToast(state)
          render()
        }, 2000)
      } catch (err) {
        if (suspended) renderer.resume()
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = showToast(state, `Error: ${msg}`, "error")
        render()
        setTimeout(() => {
          state = clearToast(state)
          render()
        }, 3000)
      }
    },
    handleCreatePr: async () => {
      // Build file summary from current state
      const fileSummary = state.files.map((f) => {
        const prefix = f.status === "added" ? "A" : f.status === "deleted" ? "D" : f.status === "renamed" ? "R" : "M"
        return `${prefix} ${f.filename}`
      })

      // Get the raw diff for context
      let rawDiff = ""
      for (const f of state.files) {
        rawDiff += f.content + "\n"
      }

      let suspended = false
      try {
        // Suspend TUI and open editor
        renderer.suspend()
        suspended = true

        const result = await openPrCreator({
          diff: rawDiff,
          fileSummary,
          branchInfo: state.branchInfo,
        })

        renderer.resume()
        suspended = false

        if (!result) {
          // User cancelled
          render()
          return
        }

        // Create PR on GitHub
        state = showToast(state, "Creating PR...", "info")
        render()

        const { prNumber, url } = await createPullRequest(result.title, result.body, result.draft)

        state = showToast(state, `PR #${prNumber} created! Loading...`, "success")
        render()

        // Switch to PR mode: load the PR session and reinitialize state
        const prSession = await loadPrSession(prNumber)

        // Rebuild state as PR mode
        const newFiles = sortFiles(parseDiff(prSession.diff))
        const newFileTree = buildFileTree(newFiles)
        const newSource = `gh:${prSession.prInfo.owner}/${prSession.prInfo.repo}#${prNumber}`

        state = createInitialState(
          newFiles,
          newFileTree,
          newSource,
          `#${prNumber}: ${prSession.prInfo.title}`,
          null,
          state.session,
          prSession.comments,
          "pr",
          prSession.prInfo,
          state.ignoreMatcher
        )

        // Auto-collapse ignored files
        if (state.ignoredFiles.size > 0) {
          const newCollapsed = new Set(state.collapsedFiles)
          for (const filename of state.ignoredFiles) {
            newCollapsed.add(filename)
          }
          state = { ...state, collapsedFiles: newCollapsed }
        }

        // Reset vim state and rebuild line mapping
        vimState = createCursorState()
        searchState = createSearchState()
        currentHeadSha = prSession.headSha
        lineMapping = buildLineMapping(state)

        state = showToast(state, `PR #${prNumber} created: ${url}`, "success")
        render()
        setTimeout(() => {
          state = clearToast(state)
          render()
        }, 4000)
      } catch (err) {
        if (suspended) renderer.resume()
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = showToast(state, `Error: ${msg}`, "error")
        render()
        setTimeout(() => {
          state = clearToast(state)
          render()
        }, 3000)
      }
    },
    handleAddPrComment: async () => {
      if (!prInfo) return

      let suspended = false
      try {
        renderer.suspend()
        suspended = true

        const body = await openPrCommentEditor()

        renderer.resume()
        suspended = false

        if (!body) {
          render()
          return
        }

        state = showToast(state, "Posting comment...", "info")
        render()

        const result = await submitPrComment(prInfo.owner, prInfo.repo, prInfo.number, body)

        if (result.success) {
          state = showToast(state, "Comment posted", "success")
          render()
          setTimeout(() => {
            state = clearToast(state)
            render()
          }, 2000)
        } else {
          state = showToast(state, `Error: ${result.error}`, "error")
          render()
          setTimeout(() => {
            state = clearToast(state)
            render()
          }, 3000)
        }
      } catch (err) {
        if (suspended) renderer.resume()
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = showToast(state, `Error: ${msg}`, "error")
        render()
        setTimeout(() => {
          state = clearToast(state)
          render()
        }, 3000)
      }
    },
  }

  function executeAction(actionId: string) {
    actionMenu.executeAction(actionId, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      handlers: actionHandlers,
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
  async function handleCommitSelected(sha: string | null, filename?: string) {
    if (sha === null) {
      // Switch back to all commits
      state = setViewingCommit(state, null)
      state = { ...state, fileTree: buildFileTree(state.files) }
      vimState = createCursorState()
      createLineMapping()
      state = showToast(state, "Viewing all commits", "info")
      render()
      setTimeout(() => { state = clearToast(state); render() }, 1500)
      return
    }

    // Check cache first
    if (!state.commitDiffCache.has(sha)) {
      // Fetch the commit diff
      state = showToast(state, "Loading commit...", "info")
      render()

      try {
        let rawDiff: string
        if (state.appMode === "pr" && state.prInfo) {
          rawDiff = await fetchCommitDiff(state.prInfo.owner, state.prInfo.repo, sha)
        } else {
          rawDiff = await getLocalCommitDiff(sha, options.target)
        }

        const files = sortFiles(parseDiff(rawDiff))
        const fileTree = buildFileTree(files)

        // Cache the result
        const newCache = new Map(state.commitDiffCache)
        newCache.set(sha, { files, fileTree })
        state = { ...state, commitDiffCache: newCache }
      } catch (err) {
        state = showToast(state, `Failed to load commit: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
        render()
        setTimeout(() => { state = clearToast(state); render() }, 3000)
        return
      }
    }

    // Switch to the commit's diff
    state = setViewingCommit(state, sha)
    vimState = createCursorState()
    createLineMapping()

    // Asked for from a file row: the commit's diff, at that file — with the
    // file at the top of the window, since it is the whole reason for
    // coming. The view restores its old scroll after the rebuild the new
    // commit triggers, so the placement waits for that.
    const fileIndex = filename ? state.files.findIndex((file) => file.filename === filename) : -1
    if (fileIndex !== -1) {
      vimDiffView.onceRebuilt(() => vimDiffView.scrollCursorTo(vimState.line, "top"))
      fileNavigation.revealFile(fileIndex, fileNavContext)
    }

    // Show toast with commit info
    const commit = state.commits.find(c => c.sha === sha)
    const commitIdx = state.commits.findIndex(c => c.sha === sha) + 1
    const msg = commit ? `${commit.sha}: ${commit.message}` : sha
    const truncMsg = msg.length > 50 ? msg.slice(0, 49) + "\u2026" : msg
    state = showToast(state, `Commit ${commitIdx}/${state.commits.length}: ${truncMsg}`, "info")
    render()
    setTimeout(() => { state = clearToast(state); render() }, 1500)
  }

  const feedLoadContext: feedFeature.FeedLoadContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
  }

  // ===== KEYBOARD INPUT =====
  const handleKeypress = createKeyHandler({
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    rebuildLineMapping: createLineMapping,
    getSearchState: () => searchState,
    getFlashState: () => flashState,
    renderer,
    vimDiffView,
    fileTreePanel,
    getPrInfoPanel: () => prInfoPanel,
    vimHandler,
    searchHandler,
    flashHandler,
    render,
    quit,
    ensureCursorVisible,
    updateFileTreePanel,
    handleExpandDivider,
    handleYank: (opts: { raw: boolean }) => yank.handleYank(yankContext, opts),
    handleCopyCommentLink: (comment) => permalink.handleCopyCommentLink(permalinkContext, comment),
    executeAction,
    onToggleReaction: handleToggleReaction,
    onCommitSelected: handleCommitSelected,
    foldsContext,
    fileNavContext,
    commentsContext,
    externalToolsContext,
    prOperationsContext,
    refreshContext: { handleRefresh: () => refresh.handleRefresh(refreshContext) },
    feedLoadContext,
    reviewPreviewOpenContext,
    syncPreviewOpenContext,
    prInfoPanelOpenContext,
    aiReviewContext,
    threadMotionContext,
  })

  renderer.keyInput.on("keypress", handleKeypress)

  // ===== INITIAL RENDER =====
  render()

  // What moved since the last visit (spec 069): the files, from one git
  // call, and — when the branch was rewritten under the reader — a word
  // about why riff is not answering that question at all.
  if (state.visit && state.appMode === "pr") {
    if (state.visitRebased) {
      state = showToast(state, "Rebased since your last visit — going by times instead", "info")
      render()
      setTimeout(() => { state = clearToast(state); render() }, 4000)
    } else {
      void filesChangedBetween(state.visit.lastSeenHeadSha, currentHeadSha).then((changed) => {
        if (changed.size === 0) return
        state = { ...state, filesChangedSinceVisit: changed }
        render()
      })
    }
  }

  // Load pending review asynchronously for PR mode
  if (mode === "pr" && prInfo) {
    getPendingReview(prInfo.owner, prInfo.repo, prInfo.number)
      .then((pendingReview) => {
        state = setPendingReview(state, pendingReview)
        render()
      })
      .catch(() => {
        // Silently ignore
      })
  }

  // Fetch the repo's @mention pool in the background (spec 046). Silent and
  // best-effort — the picker works off PR participants until it lands.
  startMentionPrefetch({
    setState: (fn) => { state = fn(state) },
    render,
    mode,
    prInfo: prInfo ?? null,
  })

  // Resolve the PRs and issues the description and comments point at (spec
  // 059). Same deal: the panels read the answers as they render.
  const referenceContext = {
    getState: () => state,
    render,
    mode,
    prInfo: prInfo ?? null,
  }
  startReferencePrefetch(referenceContext)

  // Start the Claude-drafted-comment poller (spec 036). It self-guards on
  // PR mode, so calling it unconditionally here is fine. The interval is
  // unref'd internally so it won't hold the event loop open.
  aiReview.startDraftPoller(aiReviewContext)

  // Silently poll GitHub for new / updated review comments so replies show up
  // without a manual refresh. Self-guards on PR mode; interval is unref'd.
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
    recreatePrInfoPanel: refreshContext.recreatePrInfoPanel,
    mode,
    prInfo: prInfo ?? null,
    headSha: currentHeadSha,
    intervalSeconds: pollConfig.interval,
    onFocus: pollConfig.onFocus,
  })

  // Focus reporting drives the poller: no point spending API quota on a pane
  // the user switched away from, and coming back should show current comments
  // without waiting out the interval. Only enabled when the poller will act
  // on it, so terminals without focus support are unaffected either way.
  if (pollConfig.onFocus && pollConfig.interval > 0) {
    stopFocusReporting = setupFocusReporting(renderer, commentPoll.setFocused)
  } else if (pollConfig.onFocus && mode === "local") {
    // A local review has nothing to poll, but it does have a working copy
    // and a .riff/ that something else — an editor, a Claude session
    // retiring comments through `riff comments` — changes while riff is in
    // the background. Coming back re-reads both; it's local disk, no quota.
    let focused = true
    stopFocusReporting = setupFocusReporting(renderer, (next) => {
      if (next && !focused) void refresh.handleRefresh(refreshContext)
      focused = next
    })
  }

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
