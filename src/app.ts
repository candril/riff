import type { KeyEvent } from "@opentui/core"
import { PRInfoPanelClass } from "./components"
import { getFileContent, getOldFileContent, getLocalCommitDiff } from "./providers/local"
import { getPrFileContent, getPrBaseFileContent, getPendingReview, getPrDiff, editPullRequest, createPullRequest, loadPrSession, fetchCommitDiff } from "./providers/github"
import {
  setFileContentLoading,
  setFileContent,
  setFileContentError,
  toggleDividerExpansion,
  openActionMenu,
  setPendingReview,
  setViewingCommit,
  showToast,
  clearToast,
  createInitialState,
  type AppState,
} from "./state"
import { type AppMode, type Comment } from "./types"
import { openPrEditor, openPrCreator } from "./utils/editor"
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
import * as commentsView from "./features/comments-view"
import * as diffView from "./features/diff-view"
import * as folds from "./features/folds"
import * as fileNavigation from "./features/file-navigation"
import * as commentsFeature from "./features/comments"
import * as externalTools from "./features/external-tools"
import * as prOperations from "./features/pr-operations"
import * as refresh from "./features/refresh"

// Vim navigation imports
import type { VimCursorState } from "./vim-diff/types"
import { VimMotionHandler } from "./vim-diff/motion-handler"
import { createSearchState, type SearchState } from "./vim-diff/search-state"
import { SearchHandler } from "./vim-diff/search-handler"
import { createCursorState } from "./vim-diff/cursor-state"
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
  const { state: initialState, source, headSha: initialHeadSha } = await initializeAppState({
    mode,
    target: options.target,
    diff: options.diff,
    comments: options.comments,
    prInfo: options.prInfo,
    githubViewedStatuses: options.githubViewedStatuses,
    headSha: options.headSha,
  })

  const { renderer, fileTreePanel, vimDiffView, commentsViewPanel } = await initializeRenderer()

  // ===== MUTABLE STATE =====
  let state: AppState = initialState
  let vimState: VimCursorState = createCursorState()
  let searchState: SearchState = createSearchState()
  let lineMapping: DiffLineMapping = buildLineMapping(initialState)
  let currentHeadSha = initialHeadSha
  let cachedCurrentUser: string | null = null
  let prInfoPanel: PRInfoPanelClass | null = null

  // ===== HELPERS =====
  function createLineMapping() {
    lineMapping = buildLineMapping(state)
    return lineMapping
  }

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  // ===== POST-PROCESS (cursor positioning) =====
  renderer.addPostProcessFn(() => {
    if (state.prInfoPanel.open) {
      renderer.setCursorPosition(0, 0, false)
    } else if (state.actionMenu.open) {
      const searchBox = renderer.root.findDescendantById("action-menu-search") as any
      if (searchBox) {
        const screenX = searchBox.screenX + state.actionMenu.query.length
        const screenY = searchBox.screenY
        renderer.setCursorStyle({ style: "line", blinking: true })
        renderer.setCursorPosition(screenX, screenY, true)
      }
    } else if (state.filePicker.open) {
      const searchBox = renderer.root.findDescendantById("file-picker-search") as any
      if (searchBox) {
        const screenX = searchBox.screenX + state.filePicker.query.length
        const screenY = searchBox.screenY
        renderer.setCursorStyle({ style: "line", blinking: true })
        renderer.setCursorPosition(screenX, screenY, true)
      }
    } else if (state.commitPicker.open) {
      const searchBox = renderer.root.findDescendantById("commit-picker-search") as any
      if (searchBox) {
        const screenX = searchBox.screenX + state.commitPicker.query.length
        const screenY = searchBox.screenY
        renderer.setCursorStyle({ style: "line", blinking: true })
        renderer.setCursorPosition(screenX, screenY, true)
      }
    }
  })

  // ===== VIEWPORT & SCROLL =====
  const SCROLL_OFF = 5

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
  }

  function updateFileTreePanel() {
    fileTreePanel.update(
      state.files,
      state.fileTree,
      state.treeHighlightIndex,
      state.selectedFileIndex,
      state.focusedPanel === "tree",
      state.fileStatuses,
      state.collapsedFiles,
      state.ignoredFiles,
      state.showHiddenFiles
    )
    fileTreePanel.visible = state.showFilePanel
    vimDiffView.setFilePanelVisible(state.showFilePanel, 35)
    vimDiffView.setVisible(state.viewMode === "diff")
  }

  // ===== RENDER =====
  const render = createRenderFunction({
    getState: () => state,
    getVimState: () => vimState,
    getLineMapping: () => lineMapping,
    getSearchState: () => searchState,
    getCachedCurrentUser: () => cachedCurrentUser,
    getPrInfoPanel: () => prInfoPanel,
    setPrInfoPanel: (panel) => { prInfoPanel = panel },
    renderer,
    fileTreePanel,
    vimDiffView,
    commentsViewPanel,
    updateFileTreePanel,
  })

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
    },
  })

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
        let newContent: string | null = null
        let oldContent: string | null = null

        if (state.appMode === "pr" && state.prInfo) {
          ;[newContent, oldContent] = await Promise.all([
            getPrFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
            getPrBaseFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
          ])
        } else {
          ;[newContent, oldContent] = await Promise.all([getFileContent(filename), getOldFileContent(filename)])
        }

        if (newContent !== null) {
          state = setFileContent(state, filename, newContent, oldContent)
        } else {
          state = setFileContentError(state, filename, "Could not fetch file content")
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
        state = toggleDividerExpansion(state, dividerKey)
        createLineMapping()
      }
    },
    onUpdate: () => {
      render()
    },
  })

  // ===== EXPAND DIVIDER =====
  async function handleExpandDivider(): Promise<boolean> {
    const dividerKey = lineMapping.getDividerKey(vimState.line)
    if (!dividerKey) return false

    const [filename] = dividerKey.split(":")
    if (!filename) return false

    const cached = state.fileContentCache[filename]
    if (!cached || cached.error) {
      state = setFileContentLoading(state, filename)
      render()

      try {
        let newContent: string | null = null
        let oldContent: string | null = null

        if (state.appMode === "pr" && state.prInfo) {
          ;[newContent, oldContent] = await Promise.all([
            getPrFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
            getPrBaseFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
          ])
        } else {
          ;[newContent, oldContent] = await Promise.all([getFileContent(filename), getOldFileContent(filename)])
        }

        if (newContent === null) {
          state = setFileContentError(state, filename, "Could not fetch file content")
          render()
          return false
        }

        state = setFileContent(state, filename, newContent, oldContent)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = setFileContentError(state, filename, msg)
        render()
        return false
      }
    }

    state = toggleDividerExpansion(state, dividerKey)
    createLineMapping()
    render()
    return true
  }

  // ===== FEATURE CONTEXTS =====

  const refreshContext: refresh.RefreshContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    setVimState: (s) => { vimState = s },
    setSearchState: (s) => { searchState = s },
    rebuildLineMapping: () => { createLineMapping() },
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
    setPanelInstance: (panel) => { prInfoPanel = panel },
    createPanelInstance: (info) => new PRInfoPanelClass(renderer, info),
  }

  const foldsContext: folds.FoldsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    rebuildLineMapping: () => { createLineMapping() },
    getFileTreePanel: () => fileTreePanel,
    getCommentsViewPanel: () => commentsViewPanel,
    getVimDiffView: () => vimDiffView,
    updateFileTreePanel,
    ensureCursorVisible,
    render,
    handleExpandDivider,
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
    options,
  }

  const prOperationsContext: prOperations.PrOperationsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render,
    source,
    prInfo: prInfo ?? null,
  }

  // ===== ACTION EXECUTION =====
  const actionHandlers: actionMenu.ActionHandlers = {
    quit,
    handleRefresh: () => refresh.handleRefresh(refreshContext),
    handleOpenReviewPreview: () => reviewPreview.handleOpenReviewPreview(reviewPreviewOpenContext),
    handleOpenSyncPreview: () => syncPreview.handleOpenSyncPreview(syncPreviewOpenContext),
    handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(commentsContext),
    handleOpenPRInfoPanel: () => prInfoPanelFeature.handleOpenPRInfoPanel(prInfoPanelOpenContext),
    handleOpenFileInEditor: () => externalTools.handleOpenFileInEditor(externalToolsContext),
    handleOpenExternalDiff: (viewer) => externalTools.handleOpenExternalDiff(viewer, externalToolsContext),
    handleShowAllFiles: () => {
      vimState = createCursorState()
      createLineMapping()
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
  }

  function executeAction(actionId: string) {
    actionMenu.executeAction(actionId, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      handlers: actionHandlers,
    })
  }

  // ===== COMMIT SELECTION =====
  async function handleCommitSelected(sha: string | null) {
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

    // Show toast with commit info
    const commit = state.commits.find(c => c.sha === sha)
    const commitIdx = state.commits.findIndex(c => c.sha === sha) + 1
    const msg = commit ? `${commit.sha}: ${commit.message}` : sha
    const truncMsg = msg.length > 50 ? msg.slice(0, 49) + "\u2026" : msg
    state = showToast(state, `Commit ${commitIdx}/${state.commits.length}: ${truncMsg}`, "info")
    render()
    setTimeout(() => { state = clearToast(state); render() }, 1500)
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
    renderer,
    vimDiffView,
    fileTreePanel,
    commentsViewPanel,
    getPrInfoPanel: () => prInfoPanel,
    vimHandler,
    searchHandler,
    render,
    quit,
    ensureCursorVisible,
    updateFileTreePanel,
    handleExpandDivider,
    executeAction,
    onCommitSelected: handleCommitSelected,
    foldsContext,
    fileNavContext,
    commentsContext,
    externalToolsContext,
    prOperationsContext,
    refreshContext: { handleRefresh: () => refresh.handleRefresh(refreshContext) },
    reviewPreviewOpenContext,
    syncPreviewOpenContext,
    prInfoPanelOpenContext,
  })

  renderer.keyInput.on("keypress", handleKeypress)

  // ===== INITIAL RENDER =====
  render()

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

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
