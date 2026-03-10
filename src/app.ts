import { createCliRenderer, Box, Text, BoxRenderable, TextRenderable, type KeyEvent, type ScrollBoxRenderable, getTreeSitterClient } from "@opentui/core"
import { registerSyntaxParsers } from "./syntax-parsers"
import { Header, StatusBar, getFlatTreeItems, VimDiffView, ActionMenu, ReviewPreview, Toast, FilePicker, type ValidatedComment, SyncPreview, gatherSyncItems, PRInfoPanelClass, SearchPrompt } from "./components"
import { FileTreePanel } from "./components/FileTreePanel"
import { CommentsViewPanel } from "./components/CommentsViewPanel"
import { getLocalDiff, getDiffDescription, getFileContent, getOldFileContent } from "./providers/local"
import { 
  getPrFileContent, 
  getPrBaseFileContent, 
  getCurrentUser, 
  getPrHeadSha,
  submitSingleComment,
  submitReply,
  submitReview,
  updateComment,
  toggleThreadResolution,
  getPrExtendedInfo,

  loadPrSession,
  getPendingReview,
  type SubmitResult,
} from "./providers/github"
import { parseDiff, sortFiles, getFiletype, countVisibleDiffLines, getTotalLineCount } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "./utils/file-tree"

import {
  createInitialState,
  selectFile,

  toggleViewMode,
  getSelectedFile,
  toggleFilePanel,
  updateFileTree,

  getVisibleComments,
  setFileContentLoading,
  setFileContent,
  setFileContentError,
  toggleDividerExpansion,
  openActionMenu,
  openReviewPreview,
  closeReviewPreview,
  cycleReviewEvent,
  setReviewPreviewLoading,
  setReviewPreviewError,
  setPendingReview,

  showToast,
  clearToast,
  openFilePicker,

  setThreadResolved,
  collapseThread,
  expandThread,

  collapseResolvedThreads,
  toggleFileViewed,
  getReviewProgress,
  loadFileStatuses,
  updateFileStatuses,
  openPRInfoPanel,
  setPRInfoPanelLoading,

  collapseViewedFiles,
  type AppState,
} from "./state"
import { colors, theme } from "./theme"
import { loadOrCreateSession, loadComments, saveComment, deleteCommentFile, loadViewedStatuses } from "./storage"
import { type Comment, type AppMode, type FileReviewStatus } from "./types"

import type { PrInfo } from "./providers/github"
import { flattenThreadsForNav, groupIntoThreads } from "./utils/threads"
import { getAvailableActions, type Action } from "./actions"
import { fuzzyFilter } from "./utils/fuzzy"

// Feature modules
import * as actionMenu from "./features/action-menu"
import * as filePicker from "./features/file-picker"
import * as prInfoPanelFeature from "./features/pr-info-panel"
import * as syncPreview from "./features/sync-preview"
import * as reviewPreview from "./features/review-preview"
import * as search from "./features/search"
import * as fileTreeFeature from "./features/file-tree"
import * as commentsView from "./features/comments-view"
import * as diffView from "./features/diff-view"
import * as folds from "./features/folds"
import * as fileNavigation from "./features/file-navigation"
import * as commentsFeature from "./features/comments"
import * as externalTools from "./features/external-tools"

// Vim navigation imports
import { DiffLineMapping } from "./vim-diff/line-mapping"
import { 
  createCursorState, 
  enterVisualLineMode, 
} from "./vim-diff/cursor-state"
import type { VimCursorState } from "./vim-diff/types"
import { VimMotionHandler } from "./vim-diff/motion-handler"
import { createSearchState, type SearchState } from "./vim-diff/search-state"
import { SearchHandler } from "./vim-diff/search-handler"

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
  const { mode = "local", target, diff: preloadedDiff, comments: preloadedComments, prInfo, githubViewedStatuses, headSha } = options

  // Build source identifier early (needed for loading comments)
  const source = mode === "pr" && prInfo
    ? `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
    : target ?? "local"

  // Get diff content
  let rawDiff = ""
  let description = ""
  let error: string | null = null
  let comments: Comment[] = []

  if (mode === "pr" && preloadedDiff !== undefined) {
    // PR mode - use pre-loaded data
    rawDiff = preloadedDiff
    description = prInfo ? `#${prInfo.number}: ${prInfo.title}` : "Pull Request"
    comments = preloadedComments ?? []
  } else {
    // Local mode - fetch diff from VCS
    try {
      rawDiff = await getLocalDiff(target)
      description = await getDiffDescription(target)
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error"
    }
    comments = await loadComments(source)
  }

  // Parse diff into files and sort by folder/name for consistent ordering
  const files = sortFiles(parseDiff(rawDiff))
  const fileTree = buildFileTree(files)

  // Load or create session
  const session = await loadOrCreateSession(source)

  // Initialize state
  let state = createInitialState(
    files,
    fileTree,
    source,
    description,
    error,
    session,
    comments,
    mode,
    prInfo ?? null
  )

  // Collapse resolved threads by default
  const threads = groupIntoThreads(comments)
  state = collapseResolvedThreads(state, threads)

  // Load viewed file statuses (merge local + GitHub)
  const localViewedStatuses = await loadViewedStatuses(source)
  state = loadFileStatuses(state, localViewedStatuses)
  
  // In PR mode, merge GitHub viewed statuses
  // GitHub statuses take precedence for sync, but we preserve local viewedAtCommit
  if (mode === "pr" && githubViewedStatuses && headSha) {
    const mergedStatuses = new Map(state.fileStatuses)
    for (const [filename, viewed] of githubViewedStatuses) {
      const existing = mergedStatuses.get(filename)
      if (!existing) {
        // New file from GitHub, create status
        mergedStatuses.set(filename, {
          filename,
          viewed,
          viewedAt: viewed ? new Date().toISOString() : undefined,
          viewedAtCommit: viewed ? headSha : undefined,
          githubSynced: true,
          syncedAt: new Date().toISOString(),
        })
      } else if (viewed !== existing.viewed) {
        // GitHub and local disagree - GitHub wins for sync state
        mergedStatuses.set(filename, {
          ...existing,
          viewed,
          viewedAt: viewed ? new Date().toISOString() : undefined,
          viewedAtCommit: viewed ? headSha : undefined,
          githubSynced: true,
          syncedAt: new Date().toISOString(),
        })
      } else {
        // Already in sync, mark as synced
        mergedStatuses.set(filename, {
          ...existing,
          githubSynced: true,
        })
      }
    }
    state = updateFileStatuses(state, mergedStatuses)
  }
  
  // Cache the current head SHA for PR mode
  let currentHeadSha = headSha ?? ""
  
  // Collapse viewed files initially (in all-files view they start collapsed)
  state = collapseViewedFiles(state)

  // Initialize vim cursor state
  let vimState = createCursorState()

  // Line mapping (recreated when file selection changes or dividers expand)
  let lineMapping = createLineMapping()

  function createLineMapping(): DiffLineMapping {
    const mappingMode = state.selectedFileIndex === null ? "all" : "single"
    
    // Build file contents map from cache
    const fileContents = new Map<string, string>()
    for (const [filename, cache] of Object.entries(state.fileContentCache)) {
      if (cache.newContent) {
        fileContents.set(filename, cache.newContent)
      }
    }
    
    return new DiffLineMapping(
      state.files, 
      mappingMode, 
      state.selectedFileIndex ?? undefined,
      {
        expandedDividers: state.expandedDividers,
        fileContents,
        collapsedFiles: state.collapsedFiles,
        collapsedHunks: state.collapsedHunks,
      }
    )
  }

  // Register additional syntax highlighting parsers (tsx, csharp, etc.)
  // Must be called before creating the renderer
  registerSyntaxParsers()

  // Initialize tree-sitter client for syntax highlighting in diffs
  // This must complete before DiffRenderable can highlight code
  const tsClient = getTreeSitterClient()
  await tsClient.initialize()

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Create file tree panel (class-based to avoid flicker)
  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })

  // Create VimDiffView (class-based for cursor highlighting)
  const vimDiffView = new VimDiffView({ renderer })
  
  // Create CommentsViewPanel (class-based to avoid flicker)
  const commentsViewPanel = new CommentsViewPanel({ renderer })
  
  // PR Info Panel (created on demand when opened)
  let prInfoPanel: PRInfoPanelClass | null = null

  // Post-process function for action menu and file picker cursor
  renderer.addPostProcessFn(() => {
    if (state.prInfoPanel.open) {
      // Hide cursor when PR info panel is open
      renderer.setCursorPosition(0, 0, false)
    } else if (state.actionMenu.open) {
      // Find the search box and position cursor there
      const searchBox = renderer.root.findDescendantById("action-menu-search") as any
      if (searchBox) {
        // Use the element's actual screen position
        // screenX/screenY give absolute position after layout
        const screenX = searchBox.screenX + state.actionMenu.query.length
        const screenY = searchBox.screenY
        renderer.setCursorStyle({ style: "line", blinking: true })
        renderer.setCursorPosition(screenX, screenY, true)
      }
    } else if (state.filePicker.open) {
      // Find the file picker search box and position cursor there
      const searchBox = renderer.root.findDescendantById("file-picker-search") as any
      if (searchBox) {
        const screenX = searchBox.screenX + state.filePicker.query.length
        const screenY = searchBox.screenY
        renderer.setCursorStyle({ style: "line", blinking: true })
        renderer.setCursorPosition(screenX, screenY, true)
      }
    }
  })

  // Get viewport height for vim handler
  function getViewportHeight(): number {
    const scrollBox = vimDiffView.getScrollBox()
    return scrollBox ? Math.floor(scrollBox.height) : 20
  }

  // Vim motion handler
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

  // Search state and handler
  let searchState: SearchState = createSearchState()
  
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
      // Similar to handleExpandDivider, load file content
      state = setFileContentLoading(state, filename)
      render()
      
      try {
        let newContent: string | null = null
        let oldContent: string | null = null
        
        if (state.appMode === "pr" && state.prInfo) {
          [newContent, oldContent] = await Promise.all([
            getPrFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
            getPrBaseFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
          ])
        } else {
          [newContent, oldContent] = await Promise.all([
            getFileContent(filename),
            getOldFileContent(filename),
          ])
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
        lineMapping = createLineMapping()
      }
    },
    onUpdate: () => {
      render()
    },
  })

  // Update file tree panel with current state
  function updateFileTreePanel() {
    fileTreePanel.update(
      state.files,
      state.fileTree,
      state.treeHighlightIndex,
      state.selectedFileIndex,
      state.focusedPanel === "tree",
      state.fileStatuses,
      state.collapsedFiles
    )
    fileTreePanel.visible = state.showFilePanel
    // Tell VimDiffView about file panel visibility for cursor positioning
    vimDiffView.setFilePanelVisible(state.showFilePanel, 35)
    // Tell VimDiffView about view mode for cursor visibility
    vimDiffView.setVisible(state.viewMode === "diff")
    
    // ReviewPreview is now rendered as functional component in render()
  }

  // Track current user for own-PR detection (cached, populated when review preview opens)
  let cachedCurrentUser: string | null = null

  // Render function
  function render() {
    const selectedFile = getSelectedFile(state)
    const visibleComments = getVisibleComments(state)

    // Build hints based on context and view mode
    const hints: string[] = []
    
    // If search is active (typing), show search hints
    if (searchState.active) {
      hints.push("Enter: confirm", "Esc: cancel", "Type to search...")
    } else if (searchState.pattern && state.viewMode === "diff") {
      // After search, show navigation hints
      hints.push("n: next", "N: prev", "Esc: clear")
    } else {
      hints.push("Tab: view")
      
      if (state.viewMode === "diff") {
        if (state.files.length > 0) {
          if (vimState.mode === "visual-line") {
            hints.push("c: comment selection", "Esc: cancel")
          } else {
            // Check if cursor is on a divider
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

    // Update file tree panel state
    updateFileTreePanel()

    // Main content based on view mode
    let content
    if (state.error) {
      content = Text({ content: `Error: ${state.error}`, fg: colors.error })
    } else if (state.files.length === 0) {
      content = Text({ content: "No changes to display", fg: colors.textDim })
    } else if (state.viewMode === "comments") {
      // Comments view - update class-based panel
      commentsViewPanel.update(
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
        commentsViewPanel.getContainer()
      )
    } else {
      // Diff view with VimDiffView (handles cursor highlighting internally)
      // Compute loading files set from fileContentCache
      const loadingFiles = new Set<string>()
      for (const [filename, cache] of Object.entries(state.fileContentCache)) {
        if (cache.loading) {
          loadingFiles.add(filename)
        }
      }
      
      // Update VimDiffView with current state (including search)
      vimDiffView.update(
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
        // VimDiffView container
        vimDiffView.getContainer()
      )
    }

    // Clear and re-render (preserve indicator renderables and file tree panel)
    const children = renderer.root.getChildren()
    for (const child of children) {
      // Don't remove the cursor and comment indicators
      if (child.id === "cursor-indicator" || child.id?.startsWith("comment-indicator-")) {
        continue
      }
      // Don't remove the file tree panel (it's class-based and updates in place)
      if (child.id === "file-tree-panel") {
        continue
      }
      renderer.root.remove(child.id)
    }



    // Get filtered actions for action menu
    const availableActions = getAvailableActions(state)
    const filteredActions = state.actionMenu.query
      ? fuzzyFilter(state.actionMenu.query, availableActions, a => [a.label, a.id, a.description])
      : availableActions

    // Get filtered files for file picker (with viewed status and comment counts)
    const filteredFiles = filePicker.getFilteredFiles(state)

    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        // Header
        Header({
          title: "riff",
          viewMode: state.viewMode,
          selectedFile,
          totalFiles: state.files.length,
          prInfo: state.prInfo,
          reviewProgress: getReviewProgress(state),
        }),
        // Main content area
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        // Search prompt (between content and status bar when active or has pattern)
        (searchState.active || searchState.pattern) && state.viewMode === "diff"
          ? SearchPrompt({ searchState })
          : null,
        // Status bar
        StatusBar({ 
          hints,
          searchInfo: searchState.pattern && state.viewMode === "diff" ? {
            current: searchState.currentMatchIndex + 1,
            total: searchState.matches.length,
            pattern: searchState.pattern,
            wrapped: searchState.wrapped,
          } : null,
        }),
        // Action menu overlay (rendered on top when open)
        state.actionMenu.open
          ? ActionMenu({
              query: state.actionMenu.query,
              actions: filteredActions,
              selectedIndex: state.actionMenu.selectedIndex,
            })
          : null,

        // Toast notification (rendered at top-right)
        state.toast.message
          ? Toast({
              message: state.toast.message,
              type: state.toast.type,
            })
          : null,

        // Review preview modal
        state.reviewPreview.open
          ? ReviewPreview({
              comments: commentsFeature.validateCommentsForSubmit(
                // Show both local (new) and pending (from GitHub draft) comments
                state.comments.filter(c => (c.status === "local" || c.status === "pending") && !c.inReplyTo),
                state.files
              ),
              state: state.reviewPreview,
              isOwnPr: state.prInfo !== null && cachedCurrentUser === state.prInfo.author,
            })
          : null,

        // Sync preview modal
        state.syncPreview.open
          ? SyncPreview({
              items: gatherSyncItems(state.comments),
              state: state.syncPreview,
            })
          : null,

        // File picker overlay
        state.filePicker.open
          ? FilePicker({
              query: state.filePicker.query,
              files: filteredFiles,
              selectedIndex: state.filePicker.selectedIndex,
            })
          : null,

        // PR info panel is managed imperatively (see below)
      )
    )

    // Insert file tree panel into the content row as first child
    if (state.files.length > 0) {
      const contentRow = renderer.root.findDescendantById("main-content-row")
      if (contentRow && fileTreePanel.getContainer().parent !== contentRow) {
        const firstChild = contentRow.getChildren()[0]
        if (firstChild) {
          contentRow.insertBefore(fileTreePanel.getContainer(), firstChild)
        } else {
          contentRow.add(fileTreePanel.getContainer())
        }
      }
    }
    
    // Add PR info panel overlay if open
    if (state.prInfoPanel.open && prInfoPanel) {
      if (!prInfoPanel.getContainer().parent) {
        renderer.root.add(prInfoPanel.getContainer())
      }
    } else if (prInfoPanel && prInfoPanel.getContainer().parent) {
      // Remove panel if it was open but now closed
      prInfoPanel.destroy()
      prInfoPanel = null
    }
  }

  // Scroll offset - keep cursor this many lines from top/bottom edge
  const SCROLL_OFF = 5

  /**
   * Ensure cursor is visible with scrolloff margin (vim-like behavior)
   */
  function ensureCursorVisible(): void {
    const scrollBox = vimDiffView.getScrollBox()
    if (!scrollBox) return
    
    const cursorLine = vimState.line  // Already 0-indexed
    const scrollTop = scrollBox.scrollTop
    const viewportHeight = Math.floor(scrollBox.height)
    const maxScroll = Math.max(0, scrollBox.scrollHeight - viewportHeight)
    
    // Calculate the "safe zone" where cursor doesn't trigger scroll
    const topThreshold = scrollTop + SCROLL_OFF
    const bottomThreshold = scrollTop + viewportHeight - SCROLL_OFF - 1
    
    // Track the effective scroll position for cursor positioning
    let effectiveScrollTop = scrollTop
    
    if (cursorLine < topThreshold) {
      // Cursor is above the safe zone - scroll up
      const newScrollTop = Math.max(0, cursorLine - SCROLL_OFF)
      scrollBox.scrollTop = newScrollTop
      effectiveScrollTop = newScrollTop
    } else if (cursorLine > bottomThreshold) {
      // Cursor is below the safe zone - scroll down
      const newScrollTop = Math.min(maxScroll, cursorLine - viewportHeight + SCROLL_OFF + 1)
      scrollBox.scrollTop = newScrollTop
      effectiveScrollTop = newScrollTop
    }
    
    // Tell VimDiffView the expected scroll position to avoid stale reads
    vimDiffView.setExpectedScrollTop(effectiveScrollTop)
  }

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  /**
   * Handle expanding/collapsing a divider (Enter on divider line)
   * Returns true if a divider was toggled, false otherwise
   */
  async function handleExpandDivider(): Promise<boolean> {
    const dividerKey = lineMapping.getDividerKey(vimState.line)
    if (!dividerKey) return false  // Not on a divider
    
    const [filename] = dividerKey.split(":")
    if (!filename) return false
    
    // Check if we need to fetch the file content
    const cached = state.fileContentCache[filename]
    if (!cached || cached.error) {
      // Need to fetch file content
      state = setFileContentLoading(state, filename)
      render()
      
      try {
        let newContent: string | null = null
        let oldContent: string | null = null
        
        if (state.appMode === "pr" && state.prInfo) {
          // Fetch from GitHub
          [newContent, oldContent] = await Promise.all([
            getPrFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
            getPrBaseFileContent(state.prInfo.owner, state.prInfo.repo, state.prInfo.number, filename),
          ])
        } else {
          // Fetch from local VCS
          [newContent, oldContent] = await Promise.all([
            getFileContent(filename),
            getOldFileContent(filename),
          ])
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
    
    // Toggle the divider expansion
    state = toggleDividerExpansion(state, dividerKey)
    
    // Rebuild line mapping with new expansion state
    lineMapping = createLineMapping()
    render()
    return true
  }

  /**
   * Open the review preview (gS)
   */
  async function handleOpenReviewPreview(): Promise<void> {
    // Cache current user for own-PR detection
    if (cachedCurrentUser === null && state.appMode === "pr") {
      try {
        cachedCurrentUser = await getCurrentUser()
      } catch {
        cachedCurrentUser = ""
      }
    }
    state = openReviewPreview(state)
    render()

    // Fetch pending review in background (only for PR mode)
    // Pending review is now loaded when PR opens, no need to fetch again
  }

  /**
   * Open the sync preview (gs)
   */
  function handleOpenSyncPreview(): void {
    if (state.appMode !== "pr") {
      state = showToast(state, "Sync only available in PR mode", "error")
      render()
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 3000)
      return
    }
    
    state = {
      ...state,
      syncPreview: {
        ...state.syncPreview,
        open: true,
        loading: false,
        error: null,
      },
    }
    render()
  }

  /**
   * Full refresh - reload everything from scratch (PR data, diff, comments)
   */
  async function handleRefresh(): Promise<void> {
    // Show loading toast
    state = showToast(state, "Refreshing...", "info")
    render()
    
    try {
      if (state.appMode === "pr" && state.prInfo) {
        // PR mode - reload PR data
        const { owner, repo, number: prNumber } = state.prInfo
        const { prInfo: newPrInfo, diff: newDiff, comments: newComments, viewedStatuses, headSha } = await loadPrSession(
          prNumber,
          owner,
          repo
        )
        
        // Parse diff into files
        const newFiles = sortFiles(parseDiff(newDiff))
        const newFileTree = buildFileTree(newFiles)
        
        // Re-initialize state with new data
        state = createInitialState(
          newFiles,
          newFileTree,
          state.source,
          `#${prNumber}: ${newPrInfo.title}`,
          null, // no error
          state.session,
          newComments,
          "pr",
          newPrInfo
        )
        
        // Collapse resolved threads
        const threads = groupIntoThreads(newComments)
        state = collapseResolvedThreads(state, threads)
        
        // Load file statuses
        const localViewedStatuses = await loadViewedStatuses(state.source)
        state = loadFileStatuses(state, localViewedStatuses)
        
        // Merge GitHub viewed statuses
        if (viewedStatuses && headSha) {
          const mergedStatuses = new Map(state.fileStatuses)
          for (const [filename, viewed] of viewedStatuses) {
            const existing = mergedStatuses.get(filename)
            if (!existing) {
              mergedStatuses.set(filename, {
                filename,
                viewed,
                viewedAt: viewed ? new Date().toISOString() : undefined,
                viewedAtCommit: viewed ? headSha : undefined,
                githubSynced: true,
                syncedAt: new Date().toISOString(),
              })
            } else {
              mergedStatuses.set(filename, {
                ...existing,
                viewed,
                viewedAt: viewed ? new Date().toISOString() : undefined,
                viewedAtCommit: viewed ? headSha : undefined,
                githubSynced: true,
                syncedAt: new Date().toISOString(),
              })
            }
          }
          state = updateFileStatuses(state, mergedStatuses)
        }
        
        // Collapse viewed files
        state = collapseViewedFiles(state)
        
        // Reset cursor and rebuild line mapping
        vimState = createCursorState()
        lineMapping = createLineMapping()
        
        // Clear search state
        searchState = createSearchState()
        
        state = showToast(state, "Refreshed", "success")
      } else {
        // Local mode - reload diff
        const newDiff = await getLocalDiff(options.target)
        const newDescription = await getDiffDescription(options.target)
        const newComments = await loadComments(state.source)
        
        const newFiles = sortFiles(parseDiff(newDiff))
        const newFileTree = buildFileTree(newFiles)
        
        state = createInitialState(
          newFiles,
          newFileTree,
          state.source,
          newDescription,
          null,
          state.session,
          newComments,
          "local",
          null
        )
        
        vimState = createCursorState()
        lineMapping = createLineMapping()
        searchState = createSearchState()
        
        state = showToast(state, "Refreshed", "success")
      }
      
      render()
      
      // Auto-clear toast
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 2000)
    } catch (err) {
      state = showToast(state, `Refresh failed: ${err instanceof Error ? err.message : "Unknown error"}`, "error")
      render()
      
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 4000)
    }
  }

  /**
   * Open the PR info panel (gi) and load extended info
   */
  async function handleOpenPRInfoPanel(): Promise<void> {
    if (state.appMode !== "pr" || !state.prInfo) {
      return
    }
    
    const prInfo = state.prInfo
    state = openPRInfoPanel(state)
    
    // Load extended info (commits, reviews) first, then create panel
    try {
      const { owner, repo, number: prNumber } = prInfo
      const extendedInfo = await getPrExtendedInfo(prNumber, owner, repo)
      
      // Update prInfo with extended data
      const updatedPrInfo = {
        ...state.prInfo!,
        commits: extendedInfo.commits,
        reviews: extendedInfo.reviews,
        requestedReviewers: extendedInfo.requestedReviewers,
      }
      
      state = {
        ...state,
        prInfo: updatedPrInfo,
        prInfoPanel: {
          ...state.prInfoPanel,
          loading: false,
        },
      }
      
      // Create the panel instance with the updated prInfo
      prInfoPanel = new PRInfoPanelClass(renderer, updatedPrInfo)
      render()
    } catch (error) {
      // Still show panel with basic info
      prInfoPanel = new PRInfoPanelClass(renderer, state.prInfo!)
      state = setPRInfoPanelLoading(state, false)
      render()
    }
  }

  /**
   * Execute the sync operation
   */
  async function handleExecuteSync(): Promise<void> {
    if (!state.prInfo) return
    
    const { owner, repo, number: prNumber } = state.prInfo
    const syncItems = gatherSyncItems(state.comments)
    
    if (syncItems.length === 0) {
      state = {
        ...state,
        syncPreview: { ...state.syncPreview, open: false },
      }
      render()
      return
    }
    
    // Set loading state
    state = {
      ...state,
      syncPreview: { ...state.syncPreview, loading: true, error: null },
    }
    render()
    
    let successCount = 0
    let failedCount = 0
    let lastError: string | null = null
    
    for (const item of syncItems) {
      try {
        if (item.type === "edit" && item.newBody && item.comment.githubId) {
          const result = await updateComment(owner, repo, item.comment.githubId, item.newBody)
          if (result.success) {
            // Update comment: clear localEdit, set body to new value
            const updatedComment: Comment = {
              ...item.comment,
              body: item.newBody,
              localEdit: undefined,
            }
            // Update in state
            state = {
              ...state,
              comments: state.comments.map(c => c.id === updatedComment.id ? updatedComment : c),
            }
            await saveComment(updatedComment, source)
            successCount++
          } else {
            lastError = result.error || "Failed to update comment"
            failedCount++
          }
        }
        
        if (item.type === "reply" && item.parent?.githubId) {
          const result = await submitReply(owner, repo, prNumber, item.comment, item.parent.githubId)
          if (result.success) {
            // Update comment: set status to synced, add GitHub IDs
            const updatedComment: Comment = {
              ...item.comment,
              status: "synced",
              githubId: result.githubId,
              githubUrl: result.githubUrl,
            }
            // Update in state
            state = {
              ...state,
              comments: state.comments.map(c => c.id === updatedComment.id ? updatedComment : c),
            }
            await saveComment(updatedComment, source)
            successCount++
          } else {
            lastError = result.error || "Failed to submit reply"
            failedCount++
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Unknown error"
        failedCount++
      }
    }
    
    // Close sync preview
    state = {
      ...state,
      syncPreview: { ...state.syncPreview, open: false, loading: false },
    }
    
    // Show result toast
    if (failedCount === 0) {
      state = showToast(state, `Synced ${successCount} change${successCount !== 1 ? "s" : ""}`, "success")
    } else if (successCount > 0) {
      state = showToast(state, `Synced ${successCount}, failed ${failedCount}: ${lastError}`, "error")
    } else {
      state = showToast(state, `Sync failed: ${lastError}`, "error")
    }
    
    render()
    
    // Auto-clear toast
    setTimeout(() => {
      state = clearToast(state)
      render()
    }, 4000)
  }

  /**
   * Toggle the resolved state of the selected thread
   */
  async function handleToggleThreadResolved(): Promise<void> {
    // Get current selection
    const visibleComments = getVisibleComments(state)
    const threads = groupIntoThreads(visibleComments)
    const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
    const selectedNav = navItems[state.selectedCommentIndex]
    
    if (!selectedNav?.thread) {
      return
    }
    
    const thread = selectedNav.thread
    const rootComment = thread.comments[0]
    if (!rootComment) return
    
    const newResolved = !thread.resolved
    
    // For local-only threads (no GitHub thread ID), just update locally
    if (!thread.githubThreadId) {
      // Update state with new resolved value
      state = setThreadResolved(state, rootComment.id, newResolved)
      // Persist the change - get the updated comment from state
      const updatedComment = state.comments.find(c => c.id === rootComment.id)
      if (updatedComment) {
        await saveComment(updatedComment, source)
      }
      render()
      return
    }
    
    // For GitHub threads, call the API
    if (state.appMode !== "pr") {
      return
    }
    
    const result = await toggleThreadResolution(thread.githubThreadId, thread.resolved)
    
    if (result.success) {
      const finalResolved = result.isResolved ?? newResolved
      // Update local state
      state = setThreadResolved(state, rootComment.id, finalResolved)
      // Persist the change - get the updated comment from state
      const updatedComment = state.comments.find(c => c.id === rootComment.id)
      if (updatedComment) {
        await saveComment(updatedComment, source)
      }
      
      // Show toast
      const toastMsg = finalResolved ? "Thread resolved" : "Thread reopened"
      state = showToast(state, toastMsg, "success")
      render()
      
      // Auto-clear toast after 3 seconds
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 3000)
    } else {
      state = showToast(state, result.error ?? "Failed to update thread", "error")
      render()
      
      // Auto-clear error toast after 5 seconds
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 5000)
    }
  }

  // ============================================================================
  // Fold Handlers (za, zR, zM, zo, zc)
  // ============================================================================

  /**
   * Submit all local comments as a review batch (called from review preview)
   */
  async function handleConfirmReview(): Promise<void> {
    // Check we're in PR mode
    if (state.appMode !== "pr" || !state.prInfo) {
      return
    }

    // Get all local comments, excluding user-deselected ones, replies, and invalid comments
    const allLocalComments = state.comments.filter(c => 
      c.status === "local" && 
      !c.inReplyTo &&
      !state.reviewPreview.excludedCommentIds.has(c.id)
    )
    
    // Only submit comments that are valid (file exists in diff)
    const validatedComments = commentsFeature.validateCommentsForSubmit(allLocalComments, state.files)
    const localComments = validatedComments
      .filter(vc => vc.valid)
      .map(vc => vc.comment)
    
    const reviewEvent = state.reviewPreview.selectedEvent
    const hasBody = state.reviewPreview.body.trim().length > 0
    const hasPendingComments = (state.pendingReview?.comments.length ?? 0) > 0
    
    // For APPROVE, we don't need comments or body
    // For COMMENT or REQUEST_CHANGES, we need at least comments or body (or pending comments from GitHub)
    if (localComments.length === 0 && reviewEvent !== "APPROVE" && !hasBody && !hasPendingComments) {
      const invalidCount = validatedComments.filter(vc => !vc.valid).length
      const msg = invalidCount > 0 
        ? `No valid comments to submit (${invalidCount} skipped - not in diff)`
        : "Add a comment or summary to submit"
      state = setReviewPreviewError(state, msg)
      render()
      return
    }

    const prInfo = state.prInfo
    if (!prInfo) return

    // Set loading state
    state = setReviewPreviewLoading(state, true)
    render()

    // Get the PR head SHA
    const { owner, repo, number: prNumber } = prInfo
    let headSha: string
    try {
      headSha = await getPrHeadSha(prNumber, owner, repo)
    } catch (err) {
      state = setReviewPreviewError(state, err instanceof Error ? err.message : "Failed to get PR info")
      render()
      return
    }

    // Submit as a review batch with selected event and optional body
    // If there's a pending review, merge our comments into it
    const pendingReviewId = state.reviewPreview.pendingReview?.id
    const result = await submitReview(
      owner, 
      repo, 
      prNumber, 
      localComments, 
      headSha, 
      state.reviewPreview.selectedEvent,
      state.reviewPreview.body || undefined,
      pendingReviewId
    )

    if (result.success) {
      // Update all submitted comments to synced
      // Get the current user to set as author on synced comments
      let currentUser: string | undefined
      try {
        currentUser = await getCurrentUser()
      } catch {
        // Leave undefined if we can't get the user
      }
      
      // Note: GitHub doesn't return individual IDs for batch comments,
      // so we mark them synced but without individual githubId
      const submittedIds = new Set(localComments.map(c => c.id))
      
      state = {
        ...state,
        comments: state.comments.map(c =>
          submittedIds.has(c.id) 
            ? { ...c, status: "synced" as const, author: c.author || currentUser }
            : c
        ),
      }
      
      // Close the review preview and show success toast
      const pendingReviewCommentCount = state.reviewPreview.pendingReview?.comments.length ?? 0
      state = closeReviewPreview(state)
      const eventLabel = state.reviewPreview.selectedEvent === "APPROVE" 
        ? "Review approved" 
        : state.reviewPreview.selectedEvent === "REQUEST_CHANGES"
          ? "Changes requested"
          : "Review submitted"
      const totalComments = localComments.length + pendingReviewCommentCount
      const mergedNote = pendingReviewCommentCount > 0 ? " (merged with pending)" : ""
      state = showToast(state, `${eventLabel} (${totalComments} comment${totalComments !== 1 ? "s" : ""})${mergedNote}`, "success")
      
      // Persist to storage
      for (const comment of localComments) {
        await saveComment({ ...comment, status: "synced", author: comment.author || currentUser }, source)
      }
      
      render()
      
      // Auto-clear toast after 3 seconds
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 3000)
    } else {
      state = setReviewPreviewError(state, result.error ?? "Failed to submit review")
      render()
    }
  }

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

  // Action execution context for action-menu feature
  // Note: Some handlers are wrapped in functions to access contexts defined below
  const actionHandlers: actionMenu.ActionHandlers = {
    quit,
    handleRefresh,
    handleOpenReviewPreview,
    handleOpenSyncPreview,
    handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(commentsContext),
    handleOpenPRInfoPanel,
    handleOpenFileInEditor: () => externalTools.handleOpenFileInEditor(externalToolsContext),
    handleOpenExternalDiff: (viewer) => externalTools.handleOpenExternalDiff(viewer, externalToolsContext),
  }

  function executeAction(actionId: string) {
    actionMenu.executeAction(actionId, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      handlers: actionHandlers,
    })
  }

  // Folds context for fold operations
  const foldsContext: folds.FoldsContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    rebuildLineMapping: () => { lineMapping = createLineMapping() },
    getFileTreePanel: () => fileTreePanel,
    getCommentsViewPanel: () => commentsViewPanel,
    getVimDiffView: () => vimDiffView,
    updateFileTreePanel,
    ensureCursorVisible,
    render,
    handleExpandDivider,
  }

  // File navigation context
  const fileNavContext: fileNavigation.FileNavigationContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    getLineMapping: () => lineMapping,
    createLineMapping: () => { lineMapping = createLineMapping(); return lineMapping },
    getVimDiffView: () => vimDiffView,
    ensureCursorVisible,
    render,
    mode,
    prInfo: prInfo ?? null,
    source,
    getHeadSha: () => currentHeadSha,
    setHeadSha: (sha) => { currentHeadSha = sha },
  }

  // Comments context
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

  // External tools context
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

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    
    // F12 toggles debug console
    if (key.name === "f12") {
      renderer.console.toggle()
      return
    }
    
    // ========== ACTION MENU (captures all input when open) ==========
    if (actionMenu.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      executeAction,
    })) {
      return
    }
    
    // ========== FILE PICKER (captures all input when open) ==========
    if (filePicker.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      onFileSelected: () => {
        vimState = createCursorState()
        lineMapping = createLineMapping()
      },
    })) {
      return
    }
    
    // ========== PR INFO PANEL (captures all input when open) ==========
    if (prInfoPanelFeature.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      getPanel: () => prInfoPanel,
    })) {
      return
    }
    
    // ========== SYNC PREVIEW (captures all input when open) ==========
    if (syncPreview.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      onExecuteSync: handleExecuteSync,
    })) {
      return
    }
    
    // ========== REVIEW PREVIEW (captures all input when open) ==========
    if (reviewPreview.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      getValidatedComments: () => commentsFeature.validateCommentsForSubmit(
        state.comments.filter(c => (c.status === "local" || c.status === "pending") && !c.inReplyTo),
        state.files
      ),
      isOwnPr: state.prInfo !== null && cachedCurrentUser === state.prInfo.author,
      onConfirmReview: handleConfirmReview,
    })) {
      return
    }
    
    // ========== SEARCH INPUT (captures input when search prompt is active) ==========
    if (search.handleInput(key, { searchState, searchHandler })) {
      return
    }
    
    // ========== GLOBAL KEYS (work in any mode) ==========
    switch (key.name) {
      case "p":
        // Ctrl+p opens action menu
        if (key.ctrl) {
          state = openActionMenu(state)
          render()
          return
        }
        break

      case "f":
        // Ctrl+f opens file picker
        if (key.ctrl && state.files.length > 0) {
          state = openFilePicker(state)
          render()
          return
        }
        break

      case "q":
        quit()
        return

      case "g":
      case "G":
        // G (shift+g) - go to bottom (only for tree/comments, diff handled by vim)
        if ((key.name === "G" || key.shift) && state.focusedPanel !== "diff") {
          folds.handleGoToBottom(foldsContext)
          return
        }
        break

      case "b":
        if (key.ctrl) {
          state = toggleFilePanel(state)
          if (state.showFilePanel) {
            state = { ...state, focusedPanel: "tree" }
          }
          render()
          setTimeout(() => {
            render()  // Re-render to update VimDiffView
          }, 0)
          return
        }
        break

      case "tab":
        state = toggleViewMode(state)
        render()
        return

      case "backspace":
        // Ctrl+h produces backspace in most terminals
        if (state.showFilePanel && state.mode === "normal" && state.focusedPanel !== "tree") {
          state = { ...state, focusedPanel: "tree" }
          render()
          return
        }
        break

      case "l":
        if (key.ctrl) {
          state = { ...state, focusedPanel: state.viewMode === "diff" ? "diff" : "comments" }
          render()
          setTimeout(() => {
            render()  // Re-render to update VimDiffView
          }, 0)
          return
        }
        break
    }
    
    // ========== KEY SEQUENCES (]f, [f, gS, etc.) ==========
    if (pendingKey) {
      // Use key.name if available, otherwise fall back to key.sequence for single chars
      const keyChar = key.name || (key.sequence?.length === 1 ? key.sequence : "")
      const sequence = `${pendingKey}${keyChar}${key.shift ? "!" : ""}`
      clearPendingKey()

      if (sequence === "]f") {
        fileNavigation.navigateFileSelection(1, fileNavContext)
        return
      } else if (sequence === "[f") {
        fileNavigation.navigateFileSelection(-1, fileNavContext)
        return
      } else if (sequence === "]u") {
        fileNavigation.navigateToUnviewedFile(1, fileNavContext)
        return
      } else if (sequence === "[u") {
        fileNavigation.navigateToUnviewedFile(-1, fileNavContext)
        return
      } else if (sequence === "]o") {
        fileNavigation.navigateToOutdatedFile(1, fileNavContext)
        return
      } else if (sequence === "[o") {
        fileNavigation.navigateToOutdatedFile(-1, fileNavContext)
        return
      } else if (sequence === "gS!" || sequence === "gs!") {
        // gS (shift+S) - open review preview
        handleOpenReviewPreview()
        return
      } else if (sequence === "gs") {
        // gs - open sync preview
        handleOpenSyncPreview()
        return
      } else if (sequence === "go") {
        // go - open PR in browser
        if (state.appMode === "pr" && state.prInfo) {
          const { owner, repo, number: prNumber } = state.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      } else if (sequence === "gi") {
        // gi - open PR info panel
        if (state.appMode === "pr" && state.prInfo) {
          handleOpenPRInfoPanel()
        }
        return
      } else if (sequence === "gy") {
        // gy - copy PR URL to clipboard
        if (state.appMode === "pr" && state.prInfo) {
          executeAction("copy-pr-url")
        }
        return
      } else if (sequence === "gf") {
        // gf - open file in $EDITOR
        externalTools.handleOpenFileInEditor(externalToolsContext)
        return
      } else if (sequence === "gR!" || sequence === "gr!") {
        // gR - full refresh (reload PR/diff from scratch)
        handleRefresh()
        return
      } else if (sequence === "gg") {
        // gg - go to top
        folds.handleGoToTop(foldsContext)
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        // G - go to bottom (G is shift, so we check for the shift marker)
        folds.handleGoToBottom(foldsContext)
        return
      } else if (sequence === "za") {
        // za - toggle fold at cursor (file in all-files view, directory in tree)
        folds.handleToggleFoldAtCursor(foldsContext)
        return
      } else if (sequence === "zR!" || sequence === "zr!") {
        // zR - expand all folds
        folds.handleExpandAllFolds(foldsContext)
        return
      } else if (sequence === "zM!" || sequence === "zm!") {
        // zM - collapse all folds
        folds.handleCollapseAllFolds(foldsContext)
        return
      } else if (sequence === "zr") {
        // zr - expand all (lowercase alias)
        folds.handleExpandAllFolds(foldsContext)
        return
      } else if (sequence === "zm") {
        // zm - collapse all (lowercase alias)
        folds.handleCollapseAllFolds(foldsContext)
        return
      } else if (sequence === "zo") {
        // zo - open fold at cursor
        folds.handleOpenFoldAtCursor(foldsContext)
        return
      } else if (sequence === "zc") {
        // zc - close fold at cursor
        folds.handleCloseFoldAtCursor(foldsContext)
        return
      }
      // Other sequences like ]c, [c handled by vim handler
    }

    if (key.name === "]" || key.name === "[" || key.name === "g" || key.name === "z") {
      pendingKey = key.name
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return
    }

    // ========== TREE PANEL FOCUSED ==========
    if (fileTreeFeature.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      getPanel: () => fileTreePanel,
      updatePanel: updateFileTreePanel,
      onFileSelected: () => {
        vimState = createCursorState()
        lineMapping = createLineMapping()
      },
      toggleViewedForFile: (filename: string) => fileNavigation.toggleViewedForFile(filename, fileNavContext),
    })) {
      return
    }

    // ========== COMMENTS VIEW FOCUSED ==========
    if (commentsView.handleInput(key, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      getPanel: () => commentsViewPanel,
      getVimState: () => vimState,
      setVimState: (s) => { vimState = s },
      getLineMapping: () => lineMapping,
      rebuildLineMapping: () => {
        vimState = createCursorState()
        lineMapping = createLineMapping()
        return lineMapping
      },
      ensureCursorVisible,
      handleAddComment: () => commentsFeature.handleAddComment(commentsContext),
      handleSubmitSingleComment: (comment) => commentsFeature.handleSubmitSingleComment(commentsContext, comment),
      handleToggleThreadResolved,
    })) {
      return
    }

    // ========== DIFF VIEW FOCUSED ==========
    diffView.handleInput(key, {
      state,
      getVimState: () => vimState,
      setVimState: (s) => { vimState = s },
      vimHandler,
      vimDiffView,
      searchState,
      searchHandler,
      getCurrentComment: () => commentsFeature.getCurrentComment(commentsContext),
      handleAddComment: () => commentsFeature.handleAddComment(commentsContext),
      handleExpandDivider,
      handleToggleViewed: (advanceToNext: boolean) => fileNavigation.handleToggleViewed(advanceToNext, fileNavContext),
      handleSubmitSingleComment: () => commentsFeature.handleSubmitSingleComment(commentsContext),
    })
  })

  // Initial render
  render()

  // Load pending review asynchronously for PR mode
  if (mode === "pr" && prInfo) {
    getPendingReview(prInfo.owner, prInfo.repo, prInfo.number)
      .then(pendingReview => {
        state = setPendingReview(state, pendingReview)
        render()
      })
      .catch(() => {
        // Silently ignore - pending review detection is not critical
      })
  }

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
