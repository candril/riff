import { createCliRenderer, Box, Text, BoxRenderable, TextRenderable, type KeyEvent, type ScrollBoxRenderable, getTreeSitterClient } from "@opentui/core"
import { registerSyntaxParsers } from "./syntax-parsers"
import { Header, StatusBar, getFlatTreeItems, VimDiffView, ActionMenu, ReviewPreview, Toast, FilePicker, type ValidatedComment, type FilteredFile, canSubmit, SyncPreview, gatherSyncItems, PRInfoPanelClass, SearchPrompt } from "./components"
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
  markFileViewedOnGitHub,
  loadPrSession,
  getPendingReview,
  type SubmitResult,
} from "./providers/github"
import { parseDiff, sortFiles, getFiletype, countVisibleDiffLines, getTotalLineCount } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion, expandToFile, findFileTreeIndex } from "./utils/file-tree"
import { openCommentEditor, extractDiffHunk, parseEditorOutput, openFileInEditor, openExternalDiffViewer, type EditorResult } from "./utils/editor"
import {
  createInitialState,
  selectFile,
  clearFileSelection,
  moveTreeHighlight,
  toggleViewMode,
  getSelectedFile,
  toggleFilePanel,
  updateFileTree,
  addComment,
  moveCommentSelection,
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
  toggleReviewComment,
  moveReviewHighlight,
  toggleReviewSection,
  setReviewEvent,
  setReviewBody,
  showToast,
  clearToast,
  openFilePicker,
  closeFilePicker,
  setFilePickerQuery,
  moveFilePickerSelection,
  setThreadResolved,
  collapseThread,
  expandThread,
  toggleThreadCollapsed,
  collapseResolvedThreads,
  toggleFileViewed,
  isFileViewed,
  getReviewProgress,
  loadFileStatuses,
  setFileViewedStatus,
  updateFileStatuses,
  openPRInfoPanel,
  closePRInfoPanel,
  setPRInfoPanelLoading,
  toggleFileFold,
  collapseAllFiles,
  expandAllFiles,
  collapseFile,
  collapseViewedFiles,
  type AppState,
} from "./state"
import { colors, theme } from "./theme"
import { loadOrCreateSession, loadComments, saveComment, deleteCommentFile, loadViewedStatuses, saveFileViewedStatus } from "./storage"
import { createComment, type Comment, type AppMode, type FileReviewStatus } from "./types"
import { createViewedStatus, getHeadCommit } from "./utils/viewed-status"
import type { PrInfo } from "./providers/github"
import { flattenThreadsForNav, groupIntoThreads } from "./utils/threads"
import { getAvailableActions, type Action } from "./actions"
import { fuzzyFilter } from "./utils/fuzzy"

// Feature modules
import * as actionMenu from "./features/action-menu"

// Vim navigation imports
import { DiffLineMapping } from "./vim-diff/line-mapping"
import { 
  createCursorState, 
  getSelectionRange, 
  enterVisualLineMode, 
  exitVisualMode,
} from "./vim-diff/cursor-state"
import type { VimCursorState } from "./vim-diff/types"
import { VimMotionHandler, type KeyEvent as VimKeyEvent } from "./vim-diff/motion-handler"
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

  /**
   * Validate comments for GitHub submission.
   * Checks if the comment's file/line exists in the current diff.
   */
  function validateCommentsForSubmit(comments: Comment[]): ValidatedComment[] {
    return comments.map(comment => {
      // Check if file exists in the diff
      const file = state.files.find(f => f.filename === comment.filename)
      if (!file) {
        return { comment, valid: false, reason: "file not in diff" }
      }
      
      // For now, if the file exists and we have a line number, assume valid
      // (The line was validated when the comment was created via isCommentable)
      // TODO: Could add more granular validation by checking if line is in a hunk
      return { comment, valid: true }
    })
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
    const allFiles: FilteredFile[] = state.files.map((file, index) => {
      const viewed = state.fileStatuses.get(file.filename)?.viewed ?? false
      const commentCount = state.comments.filter(c => c.filename === file.filename).length
      return { file, index, viewed, commentCount }
    })
    const filteredFiles = state.filePicker.query
      ? fuzzyFilter(state.filePicker.query, allFiles, f => [f.file.filename])
      : allFiles

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
              comments: validateCommentsForSubmit(
                // Show both local (new) and pending (from GitHub draft) comments
                state.comments.filter(c => (c.status === "local" || c.status === "pending") && !c.inReplyTo)
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



  // Save a comment to disk
  async function persistComment(comment: Comment) {
    await saveComment(comment, source)
  }

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  /**
   * Get files in tree order (as they appear visually in the file tree).
   */
  function getFilesInTreeOrder(): number[] {
    const flatItems = getFlatTreeItems(state.fileTree, state.files)
    return flatItems
      .filter(item => item.fileIndex !== undefined)
      .map(item => item.fileIndex!)
  }

  /**
   * Navigate to next/previous file selection.
   */
  function navigateFileSelection(direction: 1 | -1): void {
    const treeOrder = getFilesInTreeOrder()
    if (treeOrder.length === 0) return

    if (state.selectedFileIndex === null) {
      const newIndex = direction === 1 ? treeOrder[0] : treeOrder[treeOrder.length - 1]
      if (newIndex !== undefined) {
        state = selectFile(state, newIndex)
        const flatItems = getFlatTreeItems(state.fileTree, state.files)
        const treeIndex = flatItems.findIndex(item => item.fileIndex === newIndex)
        if (treeIndex !== -1) {
          state = { ...state, treeHighlightIndex: treeIndex }
        }
      }
    } else {
      const currentPosInTree = treeOrder.indexOf(state.selectedFileIndex)
      if (currentPosInTree === -1) return

      const newPosInTree = currentPosInTree + direction
      if (newPosInTree < 0 || newPosInTree >= treeOrder.length) return

      const newFileIndex = treeOrder[newPosInTree]!
      state = selectFile(state, newFileIndex)
      
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const treeIndex = flatItems.findIndex(item => item.fileIndex === newFileIndex)
      if (treeIndex !== -1) {
        state = { ...state, treeHighlightIndex: treeIndex }
      }
    }
    
    // Reset vim cursor and rebuild line mapping
    vimState = createCursorState()
    lineMapping = createLineMapping()
    render()
          setTimeout(() => {
            render()  // Re-render to update VimDiffView
          }, 0)
  }

  /**
   * Find the visual line where a file starts in the diff
   */
  function findFileStartLine(filename: string): number | null {
    for (let i = 0; i < lineMapping.lineCount; i++) {
      const line = lineMapping.getLine(i)
      if (line?.type === "file-header" && line.filename === filename) {
        return i
      }
    }
    return null
  }

  /**
   * Navigate to next file in tree order (after collapsing current file).
   * Used when marking a file as viewed in all-files mode.
   * First tries to find next unviewed file, falls back to next file in order.
   */
  function navigateToNextFile(currentFilename: string): void {
    const treeOrder = getFilesInTreeOrder()
    if (treeOrder.length === 0) return

    // Find current file's position in tree order
    const currentFileIndex = state.files.findIndex(f => f.filename === currentFilename)
    const currentPos = currentFileIndex !== -1 
      ? treeOrder.indexOf(currentFileIndex)
      : -1

    if (currentPos === -1) return

    // First, try to find next unviewed file
    for (let i = 1; i <= treeOrder.length; i++) {
      const pos = (currentPos + i) % treeOrder.length
      const fileIndex = treeOrder[pos]!
      const file = state.files[fileIndex]
      
      if (file && !isFileViewed(state, file.filename)) {
        // Found next unviewed file - scroll to it
        const targetLine = findFileStartLine(file.filename)
        if (targetLine !== null) {
          vimState = { ...vimState, line: targetLine }
          vimDiffView.updateCursor(vimState)
          ensureCursorVisible()
        }
        
        // Update tree highlight
        const flatItems = getFlatTreeItems(state.fileTree, state.files)
        const treeIndex = flatItems.findIndex(item => item.fileIndex === fileIndex)
        if (treeIndex !== -1) {
          state = { ...state, treeHighlightIndex: treeIndex }
        }
        return
      }
    }

    // All files viewed - just go to next file in order
    const nextPos = (currentPos + 1) % treeOrder.length
    const nextFileIndex = treeOrder[nextPos]!
    const nextFile = state.files[nextFileIndex]
    
    if (nextFile) {
      const targetLine = findFileStartLine(nextFile.filename)
      if (targetLine !== null) {
        vimState = { ...vimState, line: targetLine }
        vimDiffView.updateCursor(vimState)
        ensureCursorVisible()
      }
      
      // Update tree highlight
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const treeIndex = flatItems.findIndex(item => item.fileIndex === nextFileIndex)
      if (treeIndex !== -1) {
        state = { ...state, treeHighlightIndex: treeIndex }
      }
    }
  }

  /**
   * Navigate to next/previous unviewed file.
   * In all-files view: scrolls to the file
   * In single-file view: selects the file
   */
  function navigateToUnviewedFile(direction: 1 | -1): void {
    const treeOrder = getFilesInTreeOrder()
    if (treeOrder.length === 0) return

    const inAllFilesView = state.selectedFileIndex === null

    // Find current file
    let currentFilename: string | null = null
    if (inAllFilesView) {
      const line = lineMapping.getLine(vimState.line)
      currentFilename = line?.filename ?? null
    } else {
      currentFilename = state.files[state.selectedFileIndex!]?.filename ?? null
    }

    // Find starting position in tree order
    const currentFileIndex = currentFilename 
      ? state.files.findIndex(f => f.filename === currentFilename)
      : -1
    const startPos = currentFileIndex !== -1 
      ? treeOrder.indexOf(currentFileIndex)
      : (direction === 1 ? -1 : treeOrder.length)

    // Search in the given direction
    for (let i = 1; i <= treeOrder.length; i++) {
      const pos = startPos + (direction * i)
      // Wrap around
      const wrappedPos = ((pos % treeOrder.length) + treeOrder.length) % treeOrder.length
      const fileIndex = treeOrder[wrappedPos]!
      const file = state.files[fileIndex]
      
      if (file && !isFileViewed(state, file.filename)) {
        if (inAllFilesView) {
          // In all-files view: scroll to the file without selecting
          const targetLine = findFileStartLine(file.filename)
          if (targetLine !== null) {
            vimState = { ...vimState, line: targetLine }
            vimDiffView.updateCursor(vimState)
            ensureCursorVisible()
          }
        } else {
          // In single-file view: select the file
          state = selectFile(state, fileIndex)
          vimState = createCursorState()
          lineMapping = createLineMapping()
        }
        
        // Update tree highlight
        const flatItems = getFlatTreeItems(state.fileTree, state.files)
        const treeIndex = flatItems.findIndex(item => item.fileIndex === fileIndex)
        if (treeIndex !== -1) {
          state = { ...state, treeHighlightIndex: treeIndex }
        }
        
        render()
        setTimeout(() => {
          render()
        }, 0)
        return
      }
    }
    
    // No unviewed files found - show toast
    state = showToast(state, "All files reviewed!", "success")
    render()
    setTimeout(() => {
      state = clearToast(state)
      render()
    }, 2000)
  }

  /**
   * Navigate to next/previous outdated file (viewed but changed since).
   */
  function navigateToOutdatedFile(direction: 1 | -1): void {
    const treeOrder = getFilesInTreeOrder()
    if (treeOrder.length === 0) return

    const inAllFilesView = state.selectedFileIndex === null

    // Find current file
    let currentFilename: string | null = null
    if (inAllFilesView) {
      const line = lineMapping.getLine(vimState.line)
      currentFilename = line?.filename ?? null
    } else {
      currentFilename = state.files[state.selectedFileIndex!]?.filename ?? null
    }

    // Find starting position in tree order
    const currentFileIndex = currentFilename 
      ? state.files.findIndex(f => f.filename === currentFilename)
      : -1
    const startPos = currentFileIndex !== -1 
      ? treeOrder.indexOf(currentFileIndex)
      : (direction === 1 ? -1 : treeOrder.length)

    // Search in the given direction for outdated files
    for (let i = 1; i <= treeOrder.length; i++) {
      const pos = startPos + (direction * i)
      // Wrap around
      const wrappedPos = ((pos % treeOrder.length) + treeOrder.length) % treeOrder.length
      const fileIndex = treeOrder[wrappedPos]!
      const file = state.files[fileIndex]
      
      // Check if file is outdated (viewed but stale)
      const status = file ? state.fileStatuses.get(file.filename) : null
      if (file && status?.viewed && status?.isStale) {
        if (inAllFilesView) {
          // In all-files view: scroll to the file without selecting
          const targetLine = findFileStartLine(file.filename)
          if (targetLine !== null) {
            vimState = { ...vimState, line: targetLine }
            vimDiffView.updateCursor(vimState)
            ensureCursorVisible()
          }
        } else {
          // In single-file view: select the file
          state = selectFile(state, fileIndex)
          vimState = createCursorState()
          lineMapping = createLineMapping()
        }
        
        // Update tree highlight
        const flatItems = getFlatTreeItems(state.fileTree, state.files)
        const treeIndex = flatItems.findIndex(item => item.fileIndex === fileIndex)
        if (treeIndex !== -1) {
          state = { ...state, treeHighlightIndex: treeIndex }
        }
        
        render()
        setTimeout(() => {
          render()
        }, 0)
        return
      }
    }
    
    // No outdated files found - show toast
    state = showToast(state, "No outdated files", "info")
    render()
    setTimeout(() => {
      state = clearToast(state)
      render()
    }, 2000)
  }

  /**
   * Toggle viewed status for a specific file.
   * Handles persisting locally and syncing to GitHub.
   * Returns the new viewed status.
   */
  async function toggleViewedForFile(filename: string): Promise<boolean> {
    // Get current HEAD for viewedAtCommit
    // In PR mode, use cached headSha; in local mode, get from git
    const commitSha = currentHeadSha || await getHeadCommit()
    if (!currentHeadSha && commitSha) {
      currentHeadSha = commitSha
    }
    
    // Get current status and toggle
    const currentStatus = state.fileStatuses.get(filename)
    const newViewed = !currentStatus?.viewed
    
    // Create the new status with viewedAtCommit
    const newStatus: FileReviewStatus = createViewedStatus(filename, commitSha, newViewed)
    
    // Update state
    state = setFileViewedStatus(state, newStatus)
    
    // Persist locally
    await saveFileViewedStatus(source, newStatus)
    
    // Sync to GitHub in PR mode (fire and forget, don't block UI)
    if (mode === "pr" && prInfo) {
      markFileViewedOnGitHub(
        prInfo.owner,
        prInfo.repo,
        prInfo.number,
        filename,
        newViewed
      ).then(result => {
        if (result.success) {
          // Update status to mark as synced
          const syncedStatus = state.fileStatuses.get(filename)
          if (syncedStatus) {
            const updated = { ...syncedStatus, githubSynced: true, syncedAt: new Date().toISOString() }
            state = setFileViewedStatus(state, updated)
            saveFileViewedStatus(source, updated)
          }
        }
        // Silently ignore sync failures - local state is still valid
      })
    }
    
    return newViewed
  }
  
  /**
   * Toggle viewed status for current file and optionally advance to next
   */
  async function handleToggleViewed(advanceToNext: boolean = false): Promise<void> {
    let filename: string | null = null
    const inAllFilesView = state.selectedFileIndex === null
    
    // Get filename from selected file or from cursor position in all-files view
    const selectedFile = getSelectedFile(state)
    if (selectedFile) {
      filename = selectedFile.filename
    } else {
      // In all-files view - get filename from cursor position
      const line = lineMapping.getLine(vimState.line)
      if (line?.filename) {
        filename = line.filename
      }
    }
    
    if (!filename) return

    const newViewed = await toggleViewedForFile(filename)
    
    // In all-files view, when marking as viewed: collapse the file and jump to next
    if (inAllFilesView && newViewed) {
      state = collapseFile(state, filename)
      // Rebuild line mapping with the collapsed file
      lineMapping = createLineMapping()
      // Navigate to next unviewed file (or next file if all viewed)
      navigateToNextFile(filename)
    }
    
    render()
    
    // If advancing (and not in all-files view) and the file is now marked as viewed, go to next unviewed
    if (advanceToNext && !inAllFilesView && newViewed) {
      navigateToUnviewedFile(1)
    }
  }

  /**
   * Handle adding a comment on current line or selection
   */
  async function handleAddComment() {
    if (state.files.length === 0) return

    let startLine: number
    let endLine: number

    // Check if in visual line mode
    const selectionRange = getSelectionRange(vimState)
    if (selectionRange) {
      [startLine, endLine] = selectionRange
    } else {
      startLine = endLine = vimState.line
    }

    // Find the first commentable line in the range
    let anchor = lineMapping.getCommentAnchor(startLine)
    for (let i = startLine; i <= endLine && !anchor; i++) {
      anchor = lineMapping.getCommentAnchor(i)
    }

    if (!anchor) {
      // No commentable lines in selection
      return
    }

    // Find the file
    const file = state.files.find(f => f.filename === anchor!.filename)
    if (!file) return

    // Find existing thread for this location (all comments on this line)
    const thread = state.comments.filter(
      c => c.filename === anchor!.filename && c.line === anchor!.line && c.side === anchor!.side
    )

    // Build diff context from the selection range
    const contextLines: string[] = []
    for (let i = startLine; i <= endLine; i++) {
      const line = lineMapping.getLine(i)
      if (line && lineMapping.isCommentable(i)) {
        contextLines.push(line.rawLine)
      }
    }

    // Get current username (GitHub username for PR mode, @you for local)
    let username = "@you"
    if (state.appMode === "pr") {
      try {
        username = await getCurrentUser()
      } catch {
        // Fall back to @you
      }
    }

    // Suspend TUI and open editor
    renderer.suspend()

    try {
      const rawContent = await openCommentEditor({
        diffContent: contextLines.length > 0 ? contextLines.join("\n") : file.content,
        filePath: anchor.filename,
        line: anchor.line,
        thread,
        username,
      })

      if (rawContent !== null) {
        const result = parseEditorOutput(rawContent)
        
        // Handle edited comments
        for (const [shortId, newBody] of result.editedComments) {
          // Find the full comment by short ID
          const comment = state.comments.find(c => 
            c.id.startsWith(shortId) || c.id === shortId
          )
          if (!comment) continue
          
          // Get the current display body (localEdit or body)
          const currentBody = comment.localEdit ?? comment.body
          // Compare trimmed versions to avoid whitespace-only changes
          if (newBody.trim() === currentBody.trim()) continue
          
          let updatedComment: Comment
          
          if (comment.status === "synced") {
            // For synced comments, store edit in localEdit (user presses S to push)
            // If edit matches original body, clear localEdit
            if (newBody === comment.body) {
              updatedComment = { ...comment, localEdit: undefined }
            } else {
              updatedComment = { ...comment, localEdit: newBody }
            }
          } else {
            // For local/pending comments, edit body directly
            updatedComment = { ...comment, body: newBody }
          }
          
          state = {
            ...state,
            comments: state.comments.map(c =>
              c.id === comment.id ? updatedComment : c
            ),
          }
          await persistComment(updatedComment)
        }
        
        // Handle new reply
        if (result.newReply) {
          const comment = createComment(anchor.filename, anchor.line, result.newReply, anchor.side, username)
          // Use the selection context if available, otherwise extract from file
          comment.diffHunk = contextLines.length > 0 
            ? contextLines.join("\n") 
            : extractDiffHunk(file.content, anchor.line)
          
          // If there's an existing thread, mark as reply to the last comment
          if (thread.length > 0) {
            comment.inReplyTo = thread[thread.length - 1]!.id
          }
          
          state = addComment(state, comment)
          await persistComment(comment)
        }
      }
    } finally {
      // Exit visual mode if we were in it
      if (vimState.mode === "visual-line") {
        vimState = exitVisualMode(vimState)
      }
      
      // Resume TUI
      renderer.resume()
      render()
    }
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
   * Get the comment under cursor (in diff view) or selected comment (in comments view)
   */
  function getCurrentComment(): Comment | null {
    if (state.viewMode === "comments") {
      // In comments view, use selected comment
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      const selectedNav = navItems[state.selectedCommentIndex]
      return selectedNav?.comment ?? null
    } else {
      // In diff view, find comment for current cursor position
      const anchor = lineMapping.getCommentAnchor(vimState.line)
      if (!anchor) return null
      
      // Find submittable comments on this line:
      // - local comments (not yet on GitHub)
      // - synced comments with localEdit (pending update)
      const submittableComments = state.comments.filter(
        c => c.filename === anchor.filename && 
             c.line === anchor.line && 
             c.side === anchor.side &&
             (c.status === "local" || c.localEdit !== undefined)
      )
      
      // Return the last submittable comment (most recent)
      return submittableComments[submittableComments.length - 1] ?? null
    }
  }

  /**
   * Submit a single comment immediately to GitHub
   */
  async function handleSubmitSingleComment(comment?: Comment): Promise<void> {
    // Check we're in PR mode
    if (state.appMode !== "pr" || !state.prInfo) {
      return
    }

    // Get the comment to submit
    const toSubmit = comment ?? getCurrentComment()
    if (!toSubmit) {
      return
    }

    // Check if this is an edit to a synced comment
    const isEdit = toSubmit.status === "synced" && toSubmit.localEdit !== undefined
    
    // Must be either local or an edited synced comment
    if (toSubmit.status !== "local" && !isEdit) {
      return
    }

    const { owner, repo, number: prNumber } = state.prInfo
    let result: SubmitResult

    if (isEdit && toSubmit.githubId) {
      // Update existing comment on GitHub
      result = await updateComment(owner, repo, toSubmit.githubId, toSubmit.localEdit!)
    } else {
      // New comment - need head SHA
      let headSha: string
      try {
        headSha = await getPrHeadSha(prNumber, owner, repo)
      } catch (err) {
        state = showToast(state, "Failed to get PR info", "error")
        render()
        setTimeout(() => { state = clearToast(state); render() }, 5000)
        return
      }

      // Check if this is a reply
      if (toSubmit.inReplyTo) {
        // Find parent comment's GitHub ID
        const parentComment = state.comments.find(c => c.id === toSubmit.inReplyTo)
        if (!parentComment?.githubId) {
          // Can't reply to unsynced comment
          return
        }
        result = await submitReply(owner, repo, prNumber, toSubmit, parentComment.githubId)
      } else {
        result = await submitSingleComment(owner, repo, prNumber, toSubmit, headSha)
      }
    }

    if (result.success) {
      // Ensure we have the author set (might be missing for older comments)
      let author = toSubmit.author
      if (!author) {
        try {
          author = await getCurrentUser()
        } catch {
          // Leave undefined if we can't get the user
        }
      }
      
      let updatedComment: Comment
      let toastMessage: string
      
      if (isEdit) {
        // For edits: update body with localEdit content, clear localEdit
        updatedComment = {
          ...toSubmit,
          body: toSubmit.localEdit!,
          localEdit: undefined,
          author,
        }
        toastMessage = "Comment updated"
      } else {
        // For new comments: set synced status and GitHub IDs
        updatedComment = {
          ...toSubmit,
          status: "synced",
          githubId: result.githubId,
          githubUrl: result.githubUrl,
          author,
        }
        toastMessage = "Comment submitted"
      }
      
      // Update state and show success toast
      state = {
        ...state,
        comments: state.comments.map(c =>
          c.id === toSubmit.id ? updatedComment : c
        ),
      }
      state = showToast(state, toastMessage, "success")
      
      // Persist to storage
      await saveComment(updatedComment, source)
      
      render()
      
      // Auto-clear toast after 3 seconds
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 3000)
    } else {
      // Check for pending review error and provide actionable message
      let errorMessage = result.error ?? "Failed to submit comment"
      if (errorMessage.includes("pending review") || errorMessage.includes("user_id can only have one")) {
        errorMessage = "You have a pending review. Use gS to submit as review instead."
      }
      state = showToast(state, errorMessage, "error")
      render()
      
      // Auto-clear error toast after 5 seconds
      setTimeout(() => {
        state = clearToast(state)
        render()
      }, 5000)
    }
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
   * Open the current file in $EDITOR (gf)
   * Works from: single file view, all files view (file at cursor), file tree
   */
  async function handleOpenFileInEditor(): Promise<void> {
    let filename: string | null = null
    let lineNumber: number | undefined = undefined
    
    // Determine which file to open based on context
    if (state.focusedPanel === "tree") {
      // From file tree - use highlighted file
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const highlightedItem = flatItems[state.treeHighlightIndex]
      if (highlightedItem && !highlightedItem.node.isDirectory) {
        filename = highlightedItem.node.path
      }
    } else if (state.selectedFileIndex !== null) {
      // Single file view - use selected file
      const file = state.files[state.selectedFileIndex]
      if (file) {
        filename = file.filename
        // Get line number from cursor position if on a code line
        const currentLine = lineMapping.getLine(vimState.line)
        if (currentLine?.newLineNum) {
          lineNumber = currentLine.newLineNum
        }
      }
    } else {
      // All files view - use file at cursor
      const currentLine = lineMapping.getLine(vimState.line)
      if (currentLine?.filename) {
        filename = currentLine.filename
        // Get line number if on a code line
        if (currentLine.newLineNum) {
          lineNumber = currentLine.newLineNum
        }
      }
    }
    
    if (!filename) {
      state = showToast(state, "No file selected", "info")
      render()
      return
    }
    
    // Fetch the file content
    let content: string | null = null
    
    state = showToast(state, `Opening ${filename}...`, "info")
    render()
    
    try {
      if (state.appMode === "pr" && state.prInfo) {
        // Fetch from GitHub (head version)
        content = await getPrFileContent(
          state.prInfo.owner,
          state.prInfo.repo,
          state.prInfo.number,
          filename
        )
      } else {
        // Fetch from local (current working tree version)
        content = await getFileContent(filename)
      }
      
      if (content === null) {
        state = showToast(state, `Could not fetch ${filename}`, "error")
        render()
        return
      }
      
      // Suspend the TUI and open editor
      state = clearToast(state)
      renderer.suspend()
      
      await openFileInEditor(filename, content, lineNumber)
      
      // Resume the TUI
      renderer.resume()
      render()
      
    } catch (err) {
      renderer.resume()
      const msg = err instanceof Error ? err.message : "Unknown error"
      state = showToast(state, `Error: ${msg}`, "error")
      render()
    }
  }

  /**
   * Open current file in an external diff viewer (difftastic, delta, nvim)
   */
  async function handleOpenExternalDiff(viewer: "difftastic" | "delta" | "nvim"): Promise<void> {
    let filename: string | null = null
    
    // Determine which file to diff based on context
    if (state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const highlightedItem = flatItems[state.treeHighlightIndex]
      if (highlightedItem && !highlightedItem.node.isDirectory) {
        filename = highlightedItem.node.path
      }
    } else if (state.selectedFileIndex !== null) {
      const file = state.files[state.selectedFileIndex]
      if (file) {
        filename = file.filename
      }
    } else {
      const currentLine = lineMapping.getLine(vimState.line)
      if (currentLine?.filename) {
        filename = currentLine.filename
      }
    }
    
    if (!filename) {
      state = showToast(state, "No file selected", "info")
      render()
      return
    }
    
    const viewerNames = { difftastic: "difftastic", delta: "delta", nvim: "nvim diff" }
    state = showToast(state, `Opening ${filename} in ${viewerNames[viewer]}...`, "info")
    render()
    
    try {
      let oldContent: string | null = null
      let newContent: string | null = null
      
      if (state.appMode === "pr" && state.prInfo) {
        // For PRs, fetch both base and head versions from GitHub
        const { owner, repo, number: prNumber } = state.prInfo
        const [baseContent, headContent] = await Promise.all([
          getPrBaseFileContent(owner, repo, prNumber, filename),
          getPrFileContent(owner, repo, prNumber, filename),
        ])
        oldContent = baseContent
        newContent = headContent
      } else {
        // For local diffs, get old (HEAD/@-) and new (working copy) versions
        oldContent = await getOldFileContent(filename, options.target)
        newContent = await getFileContent(filename, options.target)
      }
      
      if (oldContent === null && newContent === null) {
        state = showToast(state, `Could not fetch ${filename}`, "error")
        render()
        return
      }
      
      // Handle new files (no old content) or deleted files (no new content)
      oldContent = oldContent ?? ""
      newContent = newContent ?? ""
      
      // Suspend the TUI and open diff viewer
      state = clearToast(state)
      renderer.suspend()
      
      await openExternalDiffViewer(oldContent, newContent, filename, viewer)
      
      // Resume the TUI
      renderer.resume()
      render()
      
    } catch (err) {
      renderer.resume()
      const msg = err instanceof Error ? err.message : "Unknown error"
      state = showToast(state, `Error: ${msg}`, "error")
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
   * Get the filename at the current cursor position in all-files mode
   */
  function getFilenameAtCursor(): string | null {
    if (state.selectedFileIndex !== null) {
      // Single file mode - return current file
      const file = state.files[state.selectedFileIndex]
      return file?.filename ?? null
    }
    // All files mode - find file at cursor position
    const lineInfo = lineMapping.getLine(vimState.line)
    if (lineInfo?.filename) {
      return lineInfo.filename
    }
    return null
  }

  /**
   * Go to top (gg) - works in tree, comments, and diff views
   */
  function handleGoToTop(): void {
    if (state.focusedPanel === "tree") {
      state = { ...state, treeHighlightIndex: 0 }
      updateFileTreePanel()
      fileTreePanel.ensureHighlightVisible()
      return
    }
    
    if (state.focusedPanel === "comments") {
      state = { ...state, selectedCommentIndex: 0 }
      const scrollBox = commentsViewPanel.getScrollBox()
      if (scrollBox) {
        scrollBox.scrollTop = 0
      }
      render()
      return
    }
    
    // Diff view - go to first line
    vimState = { ...vimState, line: 0, col: 0 }
    vimDiffView.updateCursor(vimState)
    ensureCursorVisible()
  }

  /**
   * Go to bottom (G) - works in tree, comments, and diff views
   */
  function handleGoToBottom(): void {
    if (state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      state = { ...state, treeHighlightIndex: Math.max(0, flatItems.length - 1) }
      updateFileTreePanel()
      fileTreePanel.ensureHighlightVisible()
      return
    }
    
    if (state.focusedPanel === "comments") {
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      state = { ...state, selectedCommentIndex: Math.max(0, navItems.length - 1) }
      const scrollBox = commentsViewPanel.getScrollBox()
      if (scrollBox) {
        scrollBox.scrollTop = scrollBox.scrollHeight
      }
      render()
      return
    }
    
    // Diff view - go to last line
    const lastLine = Math.max(0, lineMapping.lineCount - 1)
    vimState = { ...vimState, line: lastLine, col: 0 }
    vimDiffView.updateCursor(vimState)
    ensureCursorVisible()
  }

  /**
   * Find the file header line for a given filename in the current line mapping
   */
  function findFileHeaderLine(filename: string): number {
    for (let i = 0; i < lineMapping.lineCount; i++) {
      const line = lineMapping.getLine(i)
      if (line?.type === "file-header" && line.filename === filename) {
        return i
      }
    }
    return 0
  }

  /**
   * Toggle fold at cursor (za)
   * In diff view: toggle file collapse in all-files mode
   * In tree view: toggle directory expansion OR file collapse in diff
   * In comments view: toggle thread collapse
   */
  function handleToggleFoldAtCursor(): void {
    if (state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const highlightedItem = flatItems[state.treeHighlightIndex]
      if (!highlightedItem) return
      
      if (highlightedItem.node.isDirectory) {
        // Toggle directory expansion
        const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
        state = updateFileTree(state, newTree)
        render()
      } else {
        // On a file - find and toggle parent directory
        for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
          const item = flatItems[i]
          if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
            const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
            state = updateFileTree(state, newTree)
            state = { ...state, treeHighlightIndex: i }
            render()
            break
          }
        }
      }
      return
    }
    
    if (state.focusedPanel === "comments") {
      // Toggle thread collapse
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      const selectedNav = navItems[state.selectedCommentIndex]
      if (selectedNav?.thread) {
        state = toggleThreadCollapsed(state, selectedNav.thread.id)
        render()
      }
      return
    }
    
    // In diff view - toggle folds (file headers, dividers)
    // First try to expand/collapse a divider (works in both single and all-files mode)
    // Check if cursor is on a divider - if so, only handle the divider
    const dividerKey = lineMapping.getDividerKey(vimState.line)
    if (dividerKey) {
      handleExpandDivider()
      return
    }
    
    // Not on a divider - in all-files mode, try to toggle file fold
    if (state.selectedFileIndex === null) {
      const currentLine = lineMapping.getLine(vimState.line)
      if (!currentLine) return
      
      // On a file header or within a file - toggle file fold
      const filename = currentLine.filename ?? getFilenameAtCursor()
      if (filename) {
        state = toggleFileFold(state, filename)
        lineMapping = createLineMapping()
        // Move cursor to the file header after fold/unfold
        const headerLine = findFileHeaderLine(filename)
        vimState = { ...vimState, line: headerLine, col: 0 }
        render()
      }
    }
  }

  /**
   * Open fold at cursor (zo)
   */
  function handleOpenFoldAtCursor(): void {
    if (state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const highlightedItem = flatItems[state.treeHighlightIndex]
      if (!highlightedItem) return
      
      if (highlightedItem.node.isDirectory && !highlightedItem.node.expanded) {
        // Expand directory
        const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
        state = updateFileTree(state, newTree)
        render()
      } else if (!highlightedItem.node.isDirectory) {
        // On a file - find and expand parent directory (if collapsed)
        for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
          const item = flatItems[i]
          if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
            if (!item.node.expanded) {
              const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
              state = updateFileTree(state, newTree)
              render()
            }
            break
          }
        }
      }
      return
    }
    
    if (state.focusedPanel === "comments") {
      // Expand thread
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      const selectedNav = navItems[state.selectedCommentIndex]
      if (selectedNav?.thread) {
        state = expandThread(state, selectedNav.thread.id)
        render()
      }
      return
    }
    
    // In diff view - expand file in all-files mode
    if (state.selectedFileIndex !== null) return
    
    const filename = getFilenameAtCursor()
    if (filename && state.collapsedFiles.has(filename)) {
      state = toggleFileFold(state, filename)
      lineMapping = createLineMapping()
      // Move cursor to the file header after expanding
      const headerLine = findFileHeaderLine(filename)
      vimState = { ...vimState, line: headerLine, col: 0 }
      render()
    }
  }

  /**
   * Close fold at cursor (zc)
   */
  function handleCloseFoldAtCursor(): void {
    if (state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)
      const highlightedItem = flatItems[state.treeHighlightIndex]
      if (!highlightedItem) return
      
      if (highlightedItem.node.isDirectory && highlightedItem.node.expanded) {
        // Collapse directory
        const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
        state = updateFileTree(state, newTree)
        render()
      } else if (!highlightedItem.node.isDirectory) {
        // On a file - find and collapse parent directory (and move to it)
        for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
          const item = flatItems[i]
          if (item && item.node.isDirectory && item.depth < highlightedItem.depth) {
            if (item.node.expanded) {
              const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
              state = updateFileTree(state, newTree)
              state = { ...state, treeHighlightIndex: i }
              render()
            }
            break
          }
        }
      }
      return
    }
    
    if (state.focusedPanel === "comments") {
      // Collapse thread
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      const selectedNav = navItems[state.selectedCommentIndex]
      if (selectedNav?.thread) {
        state = collapseThread(state, selectedNav.thread.id)
        render()
      }
      return
    }
    
    // In diff view - collapse file in all-files mode
    if (state.selectedFileIndex !== null) return
    
    const filename = getFilenameAtCursor()
    if (filename && !state.collapsedFiles.has(filename)) {
      state = toggleFileFold(state, filename)
      lineMapping = createLineMapping()
      // Move cursor to the file header after collapsing
      const headerLine = findFileHeaderLine(filename)
      vimState = { ...vimState, line: headerLine, col: 0 }
      render()
    }
  }

  /**
   * Expand all folds (zR)
   * In diff view: expand all files
   * In tree view: expand all directories AND expand all files in diff
   * In comments view: expand all threads
   */
  function handleExpandAllFolds(): void {
    if (state.focusedPanel === "tree") {
      // In tree panel - expand all directories AND all files in diff
      const expandAll = (nodes: typeof state.fileTree): typeof state.fileTree => {
        return nodes.map(node => ({
          ...node,
          expanded: node.isDirectory ? true : node.expanded,
          children: node.isDirectory ? expandAll(node.children) : node.children,
        }))
      }
      state = updateFileTree(state, expandAll(state.fileTree))
      state = expandAllFiles(state)
      lineMapping = createLineMapping()
      render()
      return
    }
    
    if (state.focusedPanel === "comments") {
      // Expand all threads
      state = { ...state, collapsedThreadIds: new Set() }
      render()
      return
    }
    
    // In diff view - expand all files
    // Remember current file to restore cursor position
    const currentFilename = getFilenameAtCursor()
    state = expandAllFiles(state)
    lineMapping = createLineMapping()
    // Try to stay on the same file's header
    if (currentFilename) {
      const headerLine = findFileHeaderLine(currentFilename)
      vimState = { ...vimState, line: headerLine, col: 0 }
    } else {
      vimState = { ...vimState, line: 0, col: 0 }
    }
    render()
  }

  /**
   * Collapse all folds (zM)
   * In diff view: collapse all files
   * In tree view: collapse all directories AND collapse all files in diff
   * In comments view: collapse all threads
   */
  function handleCollapseAllFolds(): void {
    if (state.focusedPanel === "tree") {
      // In tree panel - collapse all directories AND all files in diff
      const collapseAll = (nodes: typeof state.fileTree): typeof state.fileTree => {
        return nodes.map(node => ({
          ...node,
          expanded: node.isDirectory ? false : node.expanded,
          children: node.isDirectory ? collapseAll(node.children) : node.children,
        }))
      }
      state = updateFileTree(state, collapseAll(state.fileTree))
      state = collapseAllFiles(state)
      lineMapping = createLineMapping()
      render()
      return
    }
    
    if (state.focusedPanel === "comments") {
      // Collapse all threads
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const allThreadIds = new Set(threads.map(t => t.id))
      state = { ...state, collapsedThreadIds: allThreadIds }
      render()
      return
    }
    
    // In diff view - collapse all files
    // Remember current file to restore cursor position
    const currentFilename = getFilenameAtCursor()
    state = collapseAllFiles(state)
    lineMapping = createLineMapping()
    // Try to stay on the same file's header
    if (currentFilename) {
      const headerLine = findFileHeaderLine(currentFilename)
      vimState = { ...vimState, line: headerLine, col: 0 }
    } else {
      vimState = { ...vimState, line: 0, col: 0 }
    }
    render()
  }

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
    const validatedComments = validateCommentsForSubmit(allLocalComments)
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
  const actionHandlers: actionMenu.ActionHandlers = {
    quit,
    handleRefresh,
    handleOpenReviewPreview,
    handleOpenSyncPreview,
    handleSubmitSingleComment,
    handleOpenPRInfoPanel,
    handleOpenFileInEditor,
    handleOpenExternalDiff,
  }

  function executeAction(actionId: string) {
    actionMenu.executeAction(actionId, {
      state,
      setState: (fn) => { state = fn(state) },
      render,
      handlers: actionHandlers,
    })
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
    if (state.filePicker.open) {
      const allFiles: FilteredFile[] = state.files.map((file, index) => {
        const viewed = state.fileStatuses.get(file.filename)?.viewed ?? false
        const commentCount = state.comments.filter(c => c.filename === file.filename).length
        return { file, index, viewed, commentCount }
      })
      const filteredFiles = state.filePicker.query
        ? fuzzyFilter(state.filePicker.query, allFiles, f => [f.file.filename])
        : allFiles
      
      switch (key.name) {
        case "escape":
          state = closeFilePicker(state)
          render()
          return
        
        case "return":
        case "enter":
          const selectedFile = filteredFiles[state.filePicker.selectedIndex]
          if (selectedFile) {
            state = closeFilePicker(state)
            
            // Expand tree to show the selected file
            const filename = state.files[selectedFile.index]?.filename
            if (filename) {
              const expandedTree = expandToFile(state.fileTree, filename)
              state = updateFileTree(state, expandedTree)
              
              // Find and set the tree highlight index
              const treeIndex = findFileTreeIndex(expandedTree, state.files, filename)
              if (treeIndex !== -1) {
                state = { ...state, treeHighlightIndex: treeIndex }
              }
            }
            
            // Select the file
            state = selectFile(state, selectedFile.index)
            
            // Reset vim cursor and rebuild line mapping
            vimState = createCursorState()
            lineMapping = createLineMapping()
            render()
          }
          return
        
        case "up":
          state = moveFilePickerSelection(state, -1, filteredFiles.length - 1)
          render()
          return
        
        case "down":
          state = moveFilePickerSelection(state, 1, filteredFiles.length - 1)
          render()
          return
        
        case "p":
          // Ctrl+p moves up
          if (key.ctrl) {
            state = moveFilePickerSelection(state, -1, filteredFiles.length - 1)
            render()
            return
          }
          // Otherwise type 'p'
          state = setFilePickerQuery(state, state.filePicker.query + "p")
          render()
          return
        
        case "n":
          // Ctrl+n moves down
          if (key.ctrl) {
            state = moveFilePickerSelection(state, 1, filteredFiles.length - 1)
            render()
            return
          }
          // Otherwise type 'n'
          state = setFilePickerQuery(state, state.filePicker.query + "n")
          render()
          return
        
        case "backspace":
          if (state.filePicker.query.length > 0) {
            state = setFilePickerQuery(state, state.filePicker.query.slice(0, -1))
            render()
          }
          return
        
        default:
          // Type characters into search
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            state = setFilePickerQuery(state, state.filePicker.query + key.sequence)
            render()
          }
          return
      }
    }
    
    // ========== PR INFO PANEL (captures all input when open) ==========
    if (state.prInfoPanel.open) {
      switch (key.name) {
        case "escape":
        case "q":
          state = closePRInfoPanel(state)
          render()
          return
        case "o":
          // Open PR in browser
          if (state.prInfo) {
            Bun.spawn(["open", state.prInfo.url])
          }
          return
        case "y": {
          // y: Copy selected commit SHA, Y: Copy PR URL
          if (state.prInfo) {
            if (key.shift) {
              // Y = copy PR URL
              Bun.spawn(["sh", "-c", `echo -n "${state.prInfo.url}" | pbcopy`])
              state = showToast(state, "PR URL copied", "success")
            } else {
              // y = copy selected commit SHA
              const commit = prInfoPanel?.getSelectedCommit()
              if (commit) {
                Bun.spawn(["sh", "-c", `echo -n "${commit.sha}" | pbcopy`])
                state = showToast(state, `Copied ${commit.sha.slice(0, 8)}`, "success")
              }
            }
            render()
            setTimeout(() => {
              state = clearToast(state)
              render()
            }, 2000)
          }
          return
        }
        case "j":
        case "down": {
          // Move cursor down in commit list (no re-render needed)
          if (prInfoPanel) {
            prInfoPanel.moveCursor(1)
          }
          return
        }
        case "k":
        case "up": {
          // Move cursor up in commit list (no re-render needed)
          if (prInfoPanel) {
            prInfoPanel.moveCursor(-1)
          }
          return
        }
        case "d": {
          // Ctrl+d: page down
          if (key.ctrl && prInfoPanel) {
            prInfoPanel.getScrollBox().scrollBy(10)
          }
          return
        }
        case "u": {
          // Ctrl+u: page up
          if (key.ctrl && prInfoPanel) {
            prInfoPanel.getScrollBox().scrollBy(-10)
          }
          return
        }
        case "g": {
          // gg: scroll to top, G: scroll to bottom
          if (prInfoPanel) {
            const scrollBox = prInfoPanel.getScrollBox()
            if (key.shift) {
              // G = scroll to bottom
              scrollBox.scrollTo(scrollBox.scrollHeight)
            } else {
              // g = scroll to top (simplified, no gg detection)
              scrollBox.scrollTo(0)
            }
          }
          return
        }
      }
      // Capture all other keys
      return
    }
    
    // ========== SYNC PREVIEW (captures all input when open) ==========
    if (state.syncPreview.open) {
      // Escape closes
      if (key.name === "escape") {
        state = {
          ...state,
          syncPreview: { ...state.syncPreview, open: false },
        }
        render()
        return
      }
      
      // Enter executes sync
      if (key.name === "return" || key.name === "enter") {
        if (!state.syncPreview.loading) {
          handleExecuteSync()
        }
        return
      }
      
      // Ignore all other keys when sync preview is open
      return
    }
    
    // ========== REVIEW PREVIEW (captures all input when open) ==========
    // Tab-based navigation through 4 sections:
    // Simplified review preview:
    // - 1/2/3: Select review type (Comment/Approve/Request Changes)
    // - Tab: Toggle between summary input and comments list
    // - Ctrl+Enter: Submit
    // - j/k: Navigate comments (when in comments section)
    // - Space: Toggle comment selection (when in comments section)
    if (state.reviewPreview.open) {
      const validatedComments = validateCommentsForSubmit(
        // Include both local (new) and pending (from GitHub draft) comments
        state.comments.filter(c => (c.status === "local" || c.status === "pending") && !c.inReplyTo)
      )
      const validComments = validatedComments.filter(c => c.valid)
      const section = state.reviewPreview.focusedSection
      const includedCount = validComments.filter(c => !state.reviewPreview.excludedCommentIds.has(c.comment.id)).length
      const isOwn = state.prInfo !== null && cachedCurrentUser === state.prInfo.author
      
      // Escape always closes
      if (key.name === "escape") {
        state = closeReviewPreview(state)
        render()
        return
      }
      
      // Enter submits
      if (key.name === "return" || key.name === "enter") {
        if (!state.reviewPreview.loading && canSubmit(state.reviewPreview, includedCount, isOwn)) {
          handleConfirmReview()
        }
        return
      }
      
      // 1/2/3 select review type (works in any section)
      if (key.name === "1") {
        state = setReviewEvent(state, "COMMENT")
        render()
        return
      }
      if (key.name === "2") {
        state = setReviewEvent(state, "APPROVE")
        render()
        return
      }
      if (key.name === "3") {
        state = setReviewEvent(state, "REQUEST_CHANGES")
        render()
        return
      }
      
      // Tab toggles between input and comments
      if (key.name === "tab") {
        state = toggleReviewSection(state)
        render()
        return
      }
      
      // Section-specific key handling
      if (section === "input") {
        // Ctrl+j adds newline
        if (key.name === "j" && key.ctrl) {
          state = setReviewBody(state, state.reviewPreview.body + "\n")
          render()
          return
        }
        // Backspace removes last character
        if (key.name === "backspace") {
          if (state.reviewPreview.body.length > 0) {
            state = setReviewBody(state, state.reviewPreview.body.slice(0, -1))
            render()
          }
          return
        }
        // Type characters (but not 1/2/3 which select type)
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          state = setReviewBody(state, state.reviewPreview.body + key.sequence)
          render()
          return
        }
      } else if (section === "comments") {
        // j/down = next comment
        if (key.name === "j" || key.name === "down") {
          state = moveReviewHighlight(state, 1, validComments.length - 1)
          render()
          return
        }
        // k/up = previous comment
        if (key.name === "k" || key.name === "up") {
          state = moveReviewHighlight(state, -1, validComments.length - 1)
          render()
          return
        }
        // Space toggles selection
        if (key.name === "space") {
          const highlightedComment = validComments[state.reviewPreview.highlightedIndex]
          if (highlightedComment) {
            state = toggleReviewComment(state, highlightedComment.comment.id)
            render()
          }
          return
        }
      }
      
      // Capture all other keys (don't let them escape to normal mode)
      return
    }
    
    // ========== SEARCH INPUT (captures input when search prompt is active) ==========
    if (searchState.active) {
      switch (key.name) {
        case "escape":
          searchHandler.cancelSearch()
          return
        
        case "return":
        case "enter":
          searchHandler.confirmSearch()
          return
        
        case "backspace":
          searchHandler.handleBackspace()
          return
        
        default:
          // Ctrl+W deletes word backwards
          if (key.name === "w" && key.ctrl) {
            searchHandler.handleDeleteWord()
            return
          }
          // Type characters into search
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            searchHandler.handleCharInput(key.sequence)
          }
          return
      }
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
          handleGoToBottom()
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
        navigateFileSelection(1)
        return
      } else if (sequence === "[f") {
        navigateFileSelection(-1)
        return
      } else if (sequence === "]u") {
        navigateToUnviewedFile(1)
        return
      } else if (sequence === "[u") {
        navigateToUnviewedFile(-1)
        return
      } else if (sequence === "]o") {
        navigateToOutdatedFile(1)
        return
      } else if (sequence === "[o") {
        navigateToOutdatedFile(-1)
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
        handleOpenFileInEditor()
        return
      } else if (sequence === "gR!" || sequence === "gr!") {
        // gR - full refresh (reload PR/diff from scratch)
        handleRefresh()
        return
      } else if (sequence === "gg") {
        // gg - go to top
        handleGoToTop()
        return
      } else if (sequence === "gG!" || sequence === "G!") {
        // G - go to bottom (G is shift, so we check for the shift marker)
        handleGoToBottom()
        return
      } else if (sequence === "za") {
        // za - toggle fold at cursor (file in all-files view, directory in tree)
        handleToggleFoldAtCursor()
        return
      } else if (sequence === "zR!" || sequence === "zr!") {
        // zR - expand all folds
        handleExpandAllFolds()
        return
      } else if (sequence === "zM!" || sequence === "zm!") {
        // zM - collapse all folds
        handleCollapseAllFolds()
        return
      } else if (sequence === "zr") {
        // zr - expand all (lowercase alias)
        handleExpandAllFolds()
        return
      } else if (sequence === "zm") {
        // zm - collapse all (lowercase alias)
        handleCollapseAllFolds()
        return
      } else if (sequence === "zo") {
        // zo - open fold at cursor
        handleOpenFoldAtCursor()
        return
      } else if (sequence === "zc") {
        // zc - close fold at cursor
        handleCloseFoldAtCursor()
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
    if (state.showFilePanel && state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)

      switch (key.name) {
        case "j":
        case "down":
          state = moveTreeHighlight(state, 1, flatItems.length - 1)
          updateFileTreePanel()
          fileTreePanel.ensureHighlightVisible()
          return

        case "k":
        case "up":
          state = moveTreeHighlight(state, -1, flatItems.length - 1)
          updateFileTreePanel()
          fileTreePanel.ensureHighlightVisible()
          return

        case "return":
        case "enter":
          const highlightedItem = flatItems[state.treeHighlightIndex]
          if (highlightedItem) {
            if (highlightedItem.node.isDirectory) {
              const newTree = toggleNodeExpansion(state.fileTree, highlightedItem.node.path)
              state = updateFileTree(state, newTree)
            } else if (typeof highlightedItem.fileIndex === "number") {
              state = selectFile(state, highlightedItem.fileIndex)
              state = { ...state, focusedPanel: state.viewMode === "diff" ? "diff" : "comments" }
              // Reset vim cursor and rebuild line mapping
              vimState = createCursorState()
              lineMapping = createLineMapping()
              setTimeout(() => {
                render()  // Re-render to update VimDiffView
              }, 0)
            }
          }
          render()
          return

        case "l":
        case "right":
          const expandItem = flatItems[state.treeHighlightIndex]
          if (expandItem?.node.isDirectory && !expandItem.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, expandItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          }
          return

        case "h":
        case "left":
          const collapseItem = flatItems[state.treeHighlightIndex]
          if (collapseItem?.node.isDirectory && collapseItem.node.expanded) {
            // Collapse this directory
            const newTree = toggleNodeExpansion(state.fileTree, collapseItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          } else if (collapseItem && !collapseItem.node.isDirectory) {
            // On a file - find parent directory and collapse it
            // Parent is the nearest directory above this item in the flat list
            for (let i = state.treeHighlightIndex - 1; i >= 0; i--) {
              const item = flatItems[i]
              if (item && item.node.isDirectory && item.depth < collapseItem.depth) {
                // Found parent directory - collapse it and move highlight to it
                const newTree = toggleNodeExpansion(state.fileTree, item.node.path)
                state = updateFileTree(state, newTree)
                state = { ...state, treeHighlightIndex: i }
                render()
                break
              }
            }
          }
          return

        case "escape":
          state = clearFileSelection(state)
          state = { ...state, focusedPanel: state.viewMode === "diff" ? "diff" : "comments" }
          vimState = createCursorState()
          lineMapping = createLineMapping()
          render()
          setTimeout(() => {
            render()  // Re-render to update VimDiffView
          }, 0)
          return

        case "v":
          // Toggle viewed status for highlighted item
          const viewItem = flatItems[state.treeHighlightIndex]
          if (!viewItem) return
          
          if (viewItem.node.isDirectory) {
            // Directory: toggle viewed for all files under this directory
            const dirPath = viewItem.node.path + "/"
            const filesToToggle = state.files.filter(f => f.filename.startsWith(dirPath))
            
            if (filesToToggle.length > 0) {
              // Check if any file in dir is unviewed - if so, mark all as viewed
              // Otherwise, mark all as unviewed
              const anyUnviewed = filesToToggle.some(f => !isFileViewed(state, f.filename))
              const targetViewed = anyUnviewed
              
              // Toggle all files in the directory
              Promise.all(
                filesToToggle.map(f => {
                  const currentlyViewed = isFileViewed(state, f.filename)
                  if (currentlyViewed !== targetViewed) {
                    return toggleViewedForFile(f.filename)
                  }
                  return Promise.resolve(currentlyViewed)
                })
              ).then(() => {
                render()
              })
            }
          } else if (viewItem.fileIndex !== undefined) {
            // File: toggle viewed for this file only (don't jump to next)
            const file = state.files[viewItem.fileIndex]
            if (file) {
              toggleViewedForFile(file.filename).then(() => {
                render()
              })
            }
          }
          return
      }
    }

    // ========== COMMENTS VIEW FOCUSED ==========
    if (state.viewMode === "comments" && state.focusedPanel === "comments") {
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null, state.collapsedThreadIds)
      
      switch (key.name) {
        case "j":
        case "down": {
          const oldIndex = state.selectedCommentIndex
          state = moveCommentSelection(state, 1, navItems.length - 1)
          if (state.selectedCommentIndex !== oldIndex) {
            commentsViewPanel.scrollBy(1)
          }
          render()
          return
        }

        case "k":
        case "up": {
          const oldIndex = state.selectedCommentIndex
          state = moveCommentSelection(state, -1, navItems.length - 1)
          if (state.selectedCommentIndex !== oldIndex) {
            commentsViewPanel.scrollBy(-1)
          }
          render()
          return
        }
        
        case "d":
          // Ctrl+d: scroll down half page
          if (key.ctrl) {
            const scrollBox = commentsViewPanel.getScrollBox()
            if (scrollBox) {
              const viewportHeight = Math.floor(scrollBox.height || 20)
              const halfPage = Math.floor(viewportHeight / 2)
              scrollBox.scrollTop = Math.min(
                scrollBox.scrollHeight - viewportHeight,
                scrollBox.scrollTop + halfPage
              )
            }
          }
          return
        
        case "u":
          // Ctrl+u: scroll up half page
          if (key.ctrl) {
            const scrollBox = commentsViewPanel.getScrollBox()
            if (scrollBox) {
              const viewportHeight = Math.floor(scrollBox.height || 20)
              const halfPage = Math.floor(viewportHeight / 2)
              scrollBox.scrollTop = Math.max(0, scrollBox.scrollTop - halfPage)
            }
          }
          return

        case "return":
        case "enter":
          const selectedNav = navItems[state.selectedCommentIndex]
          if (selectedNav?.comment) {
            const fileIndex = state.files.findIndex(
              f => f.filename === selectedNav.comment!.filename
            )
            if (fileIndex >= 0) {
              state = selectFile(state, fileIndex)
              state = { 
                ...state, 
                viewMode: "diff",
                focusedPanel: "diff",
              }
              // Reset vim cursor to the comment's line
              vimState = createCursorState()
              lineMapping = createLineMapping()
              // Find the visual line for this comment
              const visualLine = lineMapping.findLineForComment(selectedNav.comment)
              if (visualLine !== null) {
                vimState = { ...vimState, line: visualLine }
              }
              render()
              setTimeout(() => {
                ensureCursorVisible()
              }, 0)
            }
          }
          return

        case "r":
          const replyNav = navItems[state.selectedCommentIndex]
          if (replyNav?.comment) {
            const fileIndex = state.files.findIndex(
              f => f.filename === replyNav.comment!.filename
            )
            if (fileIndex >= 0) {
              state = selectFile(state, fileIndex)
              state = { 
                ...state, 
                viewMode: "diff",
                focusedPanel: "diff",
              }
              vimState = createCursorState()
              lineMapping = createLineMapping()
              const visualLine = lineMapping.findLineForComment(replyNav.comment)
              if (visualLine !== null) {
                vimState = { ...vimState, line: visualLine }
              }
              render()
              setTimeout(() => {
                ensureCursorVisible()
                handleAddComment()
              }, 0)
            }
          }
          return
        
        case "s":
          // S (shift+s) - submit selected comment (local or edited synced)
          if (key.shift) {
            const submitNav = navItems[state.selectedCommentIndex]
            if (submitNav?.comment) {
              const c = submitNav.comment
              // Submit if local OR synced with local edits
              if (c.status === "local" || c.localEdit !== undefined) {
                handleSubmitSingleComment(c)
              }
            }
          }
          return
        
        case "x":
          // x - toggle resolved state on thread
          handleToggleThreadResolved()
          return
        
        case "h":
        case "minus":
          // h or - : collapse thread
          {
            const selectedNav = navItems[state.selectedCommentIndex]
            if (selectedNav?.thread) {
              state = collapseThread(state, selectedNav.thread.id)
              render()
            }
          }
          return
        
        case "l":
        case "equal":
          // l or + : expand thread (+ is shift+= on most keyboards)
          {
            const selectedNav = navItems[state.selectedCommentIndex]
            if (selectedNav?.thread) {
              state = expandThread(state, selectedNav.thread.id)
              render()
            }
          }
          return
      }
    }

    // ========== DIFF VIEW FOCUSED ==========
    if (state.viewMode === "diff" && state.focusedPanel === "diff") {
      // Convert KeyEvent to VimKeyEvent format
      const vimKey: VimKeyEvent = {
        name: key.name,
        sequence: key.sequence,
        ctrl: key.ctrl,
        shift: key.shift,
      }

      // Let vim handler try first
      if (vimHandler.handleKey(vimKey)) {
        return
      }

      // Handle 'c' for comment (not handled by vim handler)
      if (key.name === "c" && !key.ctrl) {
        handleAddComment()
        return
      }

      // Handle Enter to expand/collapse dividers
      if (key.name === "return" || key.name === "enter") {
        handleExpandDivider()
        return
      }

      // Handle 'V' for visual line mode (explicit check)
      if (key.name === "v" && key.shift) {
        vimState = enterVisualLineMode(vimState)
        vimDiffView.updateCursor(vimState)
        return
      }

      // Handle 'v' for toggle viewed status (lowercase, no shift)
      if (key.name === "v" && !key.shift && !key.ctrl) {
        handleToggleViewed(true)  // Advance to next unviewed after marking
        return
      }

      // Handle escape to exit visual mode OR clear search
      if (key.name === "escape") {
        if (vimState.mode === "visual-line") {
          vimState = exitVisualMode(vimState)
          vimDiffView.updateCursor(vimState)
          return
        }
        // Clear search highlights (if any)
        if (searchState.pattern) {
          searchHandler.clearSearch()
          return
        }
      }

      // Handle '/' for forward search
      if ((key.name === "/" || key.sequence === "/") && !key.ctrl) {
        searchHandler.startSearch("forward")
        return
      }
      
      // Handle '?' for backward search
      if ((key.name === "?" || key.sequence === "?") && !key.ctrl) {
        searchHandler.startSearch("backward")
        return
      }
      
      // Handle '*' for word under cursor search (forward)
      if (key.sequence === "*" || (key.name === "8" && key.shift)) {
        searchHandler.searchWordUnderCursor("forward")
        return
      }
      
      // Handle '#' for word under cursor search (backward)
      if (key.sequence === "#" || (key.name === "3" && key.shift)) {
        searchHandler.searchWordUnderCursor("backward")
        return
      }

      // Handle 'n' and 'N' for search repeat
      if (key.name === "n" && !key.ctrl) {
        if (searchState.pattern) {
          searchHandler.jumpToMatch(key.shift ? "prev" : "next")
        } else {
          vimHandler.repeatSearch(key.shift)
        }
        return
      }

      // Handle 'S' for submit comment (local or edited synced)
      if (key.name === "s" && key.shift) {
        const currentComment = getCurrentComment()
        if (currentComment) {
          // Submit if local OR synced with local edits
          if (currentComment.status === "local" || currentComment.localEdit !== undefined) {
            handleSubmitSingleComment(currentComment)
          }
        }
        return
      }
    }
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
