import type { KeyEvent } from "@opentui/core"
import { PRInfoPanelClass, getVisibleFlatTreeItems } from "./components"
import { VERTICAL_SCROLL_OFF } from "./components/VimDiffView"
import { getFileContent, getOldFileContent, getLocalCommitDiff, getLocalCommitRangeDiff, filesChangedBetween } from "./providers/local"
import { findCurrentPr } from "./providers/current-pr"
import { commentsWithRows } from "./utils/notes"
import { collapseViewedFiles, loadFileStatuses } from "./state"
import { getCurrentRepo } from "./providers/github"
import { loadComments, loadOrCreateSession, loadViewedStatuses } from "./storage"
import { getPrFileContent, getPrBaseFileContent, getFileContentAtRef, getCommitParentSha, getPendingReview, getPrDiff, editPullRequest, createPullRequest, loadPrSession, fetchCommitDiff, fetchCommitRangeDiff, submitPrComment, fetchStackInfo } from "./providers/github"
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
  highlightInlineComment,
  commitScopeKey,
  setFileDiff,
} from "./state"
import { type AppMode, type Comment } from "./types"
import { openFileAsDiff, type FilesTarget } from "./providers/files"
import { openPrEditor, openPrCreator, openPrCommentEditor } from "./utils/editor"
import { setupFocusReporting } from "./utils/focus-reporting"
import { loadConfig } from "./config"
import { detectPreviews } from "./utils/previews"
import { markVisit } from "./utils/visit"
import { saveVisitSync } from "./storage"
import { parseDiff, sortFiles } from "./utils/diff-parser"
import { buildFileTree } from "./utils/file-tree"
import type { PrInfo } from "./providers/github"
import type { DiffFile } from "./utils/diff-parser"
import { MAX_HIGHLIGHT_BYTES } from "./vim-diff/file-highlights"

/**
 * How long the cursor stays in a file before riff reads it for the colours
 * (spec 080). Long enough that `]f]f]f` through a review reads nothing,
 * short enough that arriving somewhere and looking at it does.
 */
const HIGHLIGHT_SOURCE_DELAY_MS = 150

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
  // For file mode - the path riff was pointed at (spec 084)
  filesTarget?: FilesTarget
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
    filesTarget: options.filesTarget,
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
    lineMapping = buildLineMapping(state)
    mappedTreeFilter = state.treeFilter
    // Refresh search matches for the new line mapping
    // This ensures search results are updated when switching files
    searchHandlerRef?.refreshMatches()
    return lineMapping
  }

  function quit(then?: () => void) {
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
    // The terminal is riff's again to hand on — `then` is how a relaunch
    // takes it (spec 079).
    then?.()
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

    // A mapping the view has not drawn yet numbers its rows differently
    // from the sections on screen, so resolving the cursor against them
    // scrolls to whatever used to be at that index — `x` collapsing a file
    // and `*` opening the ones it hits both rebuild the mapping and then
    // ask for the cursor, and the view lurched to the wrong place before
    // the rebuild put it right. The rebuild reveals the cursor itself
    // (setOnContentRebuilt), where the tree matches the mapping.
    if (!vimDiffView.isShowing(lineMapping)) return

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
  /**
   * Every frame is also where riff notices a file on screen it has not read
   * yet (spec 080). The check is a walk of the visible rows and an early
   * return; the reads behind it are debounced.
   */
  function render(): void {
    renderFrame()
    requestHighlightSource()
  }

  const renderFrame = createRenderFunction({
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
    // A commit in scope is a diff of its own, running between that span's
    // ends rather than the review's (spec 078).
    const span = scopeSpan()

    if (state.appMode === "pr" && state.prInfo) {
      const { owner, repo, number, baseRef } = state.prInfo
      const spanBase = span ? await spanBaseRef(span.oldest) : null
      const [head, base] = await Promise.all([
        span
          ? getFileContentAtRef(owner, repo, filename, span.newest)
          : getPrFileContent(owner, repo, number, filename, currentHeadSha),
        spanBase
          ? getFileContentAtRef(owner, repo, filename, spanBase)
          : getPrBaseFileContent(owner, repo, number, filename, baseRef, currentHeadSha),
      ])
      // A file added by the PR has no base version; that's not a failure.
      return head.ok
        ? { ok: true, newContent: head.content, oldContent: base.ok ? base.content : null }
        : { ok: false, error: head.error }
    }

    const [newContent, oldContent] = await Promise.all([
      getFileContent(filename, span?.newest ?? options.target),
      getOldFileContent(filename, span?.oldest ?? options.target),
    ])
    return newContent === null
      ? { ok: false, error: "Could not read file from the working tree" }
      : { ok: true, newContent, oldContent }
  }

  async function loadFileContent(filename: string): Promise<void> {
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
  }

  /**
   * Read the files on screen, so their rows can be highlighted as files
   * rather than as the fragments they are (spec 080).
   *
   * Asked for per file as it comes into view, never for the diff at large:
   * a two-hundred-file review is not two hundred reads nobody wanted. Local
   * mode takes it off disk; a PR asks GitHub, the way expanding context
   * already does, and the same cache answers both.
   */
  let highlightSourceTimer: ReturnType<typeof setTimeout> | null = null
  let highlightSourceArmedFor = ""
  const highlightSourceFailed = new Set<string>()
  const highlightSourceInFlight = new Set<string>()
  const highlightSourcePending = new Map<string, string>()

  /**
   * How many files one pass reads. A screen of one-line files would
   * otherwise be a screen of fetches at once; the rest stay on screen, so
   * the render each finished read triggers comes back for them.
   */
  const HIGHLIGHT_SOURCE_BATCH = 6

  /**
   * What a read would fetch: the file, from the revisions in view. A refresh
   * or a change of commit drops what riff read, and this is how it knows to
   * read it again rather than leaving the rows to the fragment parse.
   */
  function highlightSourceKey(filename: string): string {
    const span = scopeSpan()
    const from = span
      ? `${span.oldest}..${span.newest}`
      : currentHeadSha ?? options.target ?? ""
    return `${filename}@${from}`
  }

  /**
   * The key a read of this file would carry, or null if it needs no read.
   *
   * The ignore list is not consulted. It decides what the tree offers, not
   * what the diff draws — `**​/__snapshots__/**` is ignored by default, and
   * a snapshot is exactly the generated file a reader does open, to see the
   * one line that moved. Being on screen is the whole test: what riff shows
   * a reader, riff colours from the file (spec 080).
   */
  function highlightSourceNeeded(filename: string): string | null {
    const cached = state.fileContentCache[filename]
    if (cached?.newContent || cached?.loading || cached?.error) return null

    const key = highlightSourceKey(filename)
    if (highlightSourceInFlight.has(key) || highlightSourceFailed.has(key)) return null

    // Locally the size is one stat away, so the read never happens at all.
    // A PR's is not known until it arrives, and the parse declines it then.
    if (state.appMode === "local" && Bun.file(filename).size > MAX_HIGHLIGHT_BYTES) return null

    return key
  }

  async function readHighlightSource(filename: string, key: string): Promise<void> {
    try {
      const fetched = await fetchFileVersions(filename)
      if (fetched.ok) {
        state = setFileContent(state, filename, fetched.newContent, fetched.oldContent)
        render()
      } else {
        highlightSourceFailed.add(key)
      }
    } catch {
      highlightSourceFailed.add(key)
    } finally {
      highlightSourceInFlight.delete(key)
    }
  }

  /**
   * Read every file with code on screen, not only the one the cursor is in
   * (spec 080). A file the reader can see is coloured from the file or from
   * the fragment, and the fragment is wrong in ways the file is not — a
   * hunk starting inside a comment, or a schema whose `on` turns up as a
   * keyword in the middle of a word.
   *
   * Bounded by the viewport rather than by the review: what is on screen is
   * a handful of files, where the diff at large is two hundred reads nobody
   * asked for.
   */
  function requestHighlightSource(): void {
    highlightSourcePending.clear()
    for (const filename of vimDiffView.visibleFilenames()) {
      const key = highlightSourceNeeded(filename)
      if (key) highlightSourcePending.set(filename, key)
    }
    if (highlightSourcePending.size === 0) return

    // Re-armed only when the set of wanted files changes, which is what
    // makes walking a review with `]f` read nothing: each move rearms, and
    // the read lands once the reader has stopped somewhere. An unchanged
    // set leaves the pending timer alone, so a render on its own timer —
    // the comment poll — cannot starve it.
    const armFor = [...highlightSourcePending.values()].sort().join("|")
    if (highlightSourceTimer && armFor === highlightSourceArmedFor) return
    highlightSourceArmedFor = armFor
    if (highlightSourceTimer) clearTimeout(highlightSourceTimer)

    // Quietly: none of these may put the panel into a loading state the
    // reader would have to watch.
    highlightSourceTimer = setTimeout(() => {
      highlightSourceTimer = null
      highlightSourceArmedFor = ""
      const wanted = [...highlightSourcePending].slice(0, HIGHLIGHT_SOURCE_BATCH)
      highlightSourcePending.clear()

      for (const [filename, key] of wanted) {
        // The state may have moved while the pause ran.
        if (highlightSourceNeeded(filename) !== key) continue
        highlightSourceInFlight.add(key)
        void readHighlightSource(filename, key)
      }
    }, HIGHLIGHT_SOURCE_DELAY_MS)
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
    loadFileContent,
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
      } else if (surface === "comments") {
        state = highlightInlineComment(state, id)
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
  /**
   * The commit a span is measured from: the one before its oldest in the
   * list — which is newest-first — or the PR's base when the span starts at
   * the first commit there is.
   */
  function parentOfCommit(sha: string): string {
    const index = state.commits.findIndex((commit) => commit.sha === sha)
    const parent = index === -1 ? undefined : state.commits[index + 1]
    return parent?.sha ?? state.prInfo?.baseRef ?? `${sha}^`
  }

  /**
   * The oldest and newest commit in scope, or null when the whole review is
   * in view. A selection with gaps is read as its commits' own patches
   * (spec 078), and no pair of revisions spans those.
   */
  function scopeSpan(): { oldest: string; newest: string } | null {
    const newest = state.viewingCommit
    if (!newest) return null
    const scope = state.viewingCommitScope
    return scope ? contiguousRun(scope) : { oldest: newest, newest }
  }

  /**
   * The revision a span's diff is measured from: the commit before its
   * oldest. That one is in the list riff already has, except for the first
   * commit of the review, whose predecessor the API has to name.
   */
  async function spanBaseRef(oldest: string): Promise<string | null> {
    const index = state.commits.findIndex((commit) => commit.sha === oldest)
    const previous = index === -1 ? undefined : state.commits[index + 1]
    if (previous) return previous.sha
    if (!state.prInfo) return null
    try {
      return await getCommitParentSha(state.prInfo.owner, state.prInfo.repo, oldest)
    } catch {
      return null
    }
  }

  /**
   * Is this scope a run of commits, oldest to newest, with nothing skipped?
   * A run has one cumulative diff; a selection with gaps does not, and is
   * read as its commits' patches instead (spec 078).
   */
  function contiguousRun(scope: readonly string[]): { oldest: string; newest: string } | null {
    if (scope.length < 2) return null
    const positions = scope.map((sha) => state.commits.findIndex((c) => c.sha === sha))
    if (positions.some((index) => index === -1)) return null
    const sorted = [...positions].sort((a, b) => a - b)
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]! !== sorted[i - 1]! + 1) return null
    }
    return {
      oldest: state.commits[sorted[sorted.length - 1]!]!.sha,
      newest: state.commits[sorted[0]!]!.sha,
    }
  }

  /** One commit's patch, from whichever provider this review came from. */
  async function commitPatch(sha: string): Promise<string> {
    return state.appMode === "pr" && state.prInfo
      ? await fetchCommitDiff(state.prInfo.owner, state.prInfo.repo, sha)
      : await getLocalCommitDiff(sha, options.target)
  }

  /**
   * The files a scope covers. A run is one cumulative diff; commits picked
   * with gaps between them are their own patches, oldest first, with a file
   * two of them touched carrying both sets of hunks — which is what
   * `git log -p` would have shown.
   */
  async function scopeFiles(scope: readonly string[]): Promise<DiffFile[]> {
    const run = contiguousRun(scope)
    if (run) {
      const raw = state.appMode === "pr" && state.prInfo
        ? await fetchCommitRangeDiff(
            state.prInfo.owner,
            state.prInfo.repo,
            parentOfCommit(run.oldest),
            run.newest
          )
        : await getLocalCommitRangeDiff(run.oldest, run.newest)
      return sortFiles(parseDiff(raw))
    }

    if (scope.length === 1) return sortFiles(parseDiff(await commitPatch(scope[0]!)))

    const merged = new Map<string, DiffFile>()
    for (const sha of [...scope].reverse()) {
      for (const file of parseDiff(await commitPatch(sha))) {
        const seen = merged.get(file.filename)
        merged.set(
          file.filename,
          seen
            ? {
                ...seen,
                additions: seen.additions + file.additions,
                deletions: seen.deletions + file.deletions,
                content: `${seen.content}\n${file.content}`,
              }
            : file
        )
      }
    }
    return sortFiles([...merged.values()])
  }

  async function handleCommitSelected(
    sha: string | null,
    filename?: string,
    scope?: readonly string[] | null,
  ) {
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

    const shas = scope && scope.length > 0 ? scope : [sha]
    const cacheKey = commitScopeKey(sha, shas)

    if (!state.commitDiffCache.has(cacheKey)) {
      state = showToast(state, shas.length > 1 ? "Loading commits..." : "Loading commit...", "info")
      render()

      try {
        const files = await scopeFiles(shas)
        const newCache = new Map(state.commitDiffCache)
        newCache.set(cacheKey, { files, fileTree: buildFileTree(files) })
        state = { ...state, commitDiffCache: newCache }
      } catch (err) {
        state = showToast(state, `Failed to load commit: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
        render()
        setTimeout(() => { state = clearToast(state); render() }, 3000)
        return
      }
    }

    // Switch to the commit's diff
    state = setViewingCommit(state, sha, shas)
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
    const run = contiguousRun(shas)
    if (run) {
      const oldestIdx = state.commits.findIndex(c => c.sha === run.oldest) + 1
      state = showToast(
        state,
        `Commits ${commitIdx}\u2013${oldestIdx} of ${state.commits.length}`,
        "info"
      )
    } else if (shas.length > 1) {
      state = showToast(state, `${shas.length} commits of ${state.commits.length}`, "info")
    } else {
      const msg = commit ? `${commit.sha}: ${commit.message}` : sha
      const truncMsg = msg.length > 50 ? msg.slice(0, 49) + "\u2026" : msg
      state = showToast(state, `Commit ${commitIdx}/${state.commits.length}: ${truncMsg}`, "info")
    }
    render()
    setTimeout(() => { state = clearToast(state); render() }, 1500)
  }

  const feedLoadContext: feedFeature.FeedLoadContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
  }

  /**
   * Read the pull request the branch already has (spec 095).
   *
   * riff names it in the header of every local review, and until now that
   * was all it did with it — the overview and the feed are the pull
   * request's surfaces and a local review had none. Asking for one is what
   * fetches it: the same load `riff pr` does, in place.
   */
  async function openBranchPr(view: "state" | "feed"): Promise<void> {
    const branchPr = state.branchPr
    if (!branchPr || state.appMode === "pr") return
    if (loadingBranchPr) return
    loadingBranchPr = true

    state = showToast(state, `Opening #${branchPr.number}…`, "info")
    render()

    try {
      const { owner, repo } = await getCurrentRepo()
      const loaded = await loadPrSession(branchPr.number, owner, repo)
      const source = `gh:${owner}/${repo}#${branchPr.number}`
      const files = sortFiles(parseDiff(loaded.diff))

      currentHeadSha = loaded.headSha
      const session = await loadOrCreateSession(source)
      const next = createInitialState(
        files,
        buildFileTree(files),
        source,
        `#${branchPr.number}: ${loaded.prInfo.title}`,
        null,
        session,
        loaded.comments,
        "pr",
        loaded.prInfo,
        state.ignoreMatcher,
      )
      // A file riff was told not to show opens folded, the way every other
      // load leaves it.
      const ignored = new Set([...next.ignoredFiles].filter((f) => next.files.some((x) => x.filename === f)))
      state = {
        ...next,
        collapsedFiles: new Set([...next.collapsedFiles, ...ignored]),
        commits: loaded.prInfo.commits ?? [],
        wrapLines: state.wrapLines,
        alignMarkdownTables: state.alignMarkdownTables,
        viewMode: view,
      }
      state = collapseViewedFiles(loadFileStatuses(state, await loadViewedStatuses(source)))

      // A local review has no PR info panel — there was no pull request to
      // build one from — and the overview is that panel. Without this the
      // view switches and there is nothing there to draw, which reads as
      // being stuck on the diff.
      refreshContext.recreatePrInfoPanel()

      createLineMapping()
      vimState = createCursorState()
      updateFileTreePanel()
      render()
    } catch (err) {
      state = showToast(
        state,
        `Could not open #${branchPr.number}: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
      )
      render()
    } finally {
      loadingBranchPr = false
    }
  }
  let loadingBranchPr = false

  // ===== KEYBOARD INPUT =====
  const dispatchKeypress = createKeyHandler({
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
    openBranchPr: (view) => { void openBranchPr(view) },
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

  /**
   * Every key that lands somewhere else records where it came from
   * (spec 089).
   *
   * One place rather than a call in front of each navigation: the picker,
   * the tree, flash, thread motion and everything written after this are in
   * the jumplist without opting in, and none of them can forget. A key that
   * only steps or scrolls is not a jump, and typing into a composer or a
   * filter never moves the reader at all — so nothing it does is recorded.
   *
   * Stepping is exempt only while it stays inside a file. `j` off the last
   * line of one file and into the next is how the all-files view changes
   * file, and walking back the way you came has to include it.
   */
  function handleKeypress(key: KeyEvent) {
    const before = jumplist.capture(state, vimState)
    const fileBefore = jumplist.cursorFile(lineMapping, vimState.line)
    dispatchKeypress(key)

    if (jumplist.isStepMotion(key)) {
      const fileAfter = jumplist.cursorFile(lineMapping, vimState.line)
      if (fileAfter === null || fileAfter === fileBefore) return
      state = jumplist.push(state, before)
      return
    }

    if (jumplist.sameLocation(before, jumplist.capture(state, vimState))) return
    state = jumplist.push(state, before)
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
  // A parse landing is a reason to draw the frame again (spec 080).
  vimDiffView.onFileParsed = () => render()

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
      // Reading what is on disk, never fetching: a local review that opens
      // in a second should not wait on GitHub, and `riff pr` is what says
      // "go and get it".
      try {
        const { owner, repo } = await getCurrentRepo()
        const review = await loadComments(`gh:${owner}/${repo}#${branchPr.number}`)
        const anchored = commentsWithRows(review, state.files, state.fileMode)
        if (anchored.length === 0) return
        state = { ...state, comments: [...state.comments, ...anchored] }
        render()
      } catch {
        // No review on disk, or a repo riff cannot name. The local comments
        // are then the whole of it.
      }
    })
  }

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
