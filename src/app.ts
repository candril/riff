import { createCliRenderer, Box, Text, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { Header, StatusBar, getFlatTreeItems, CommentsView, VimDiffView } from "./components"
import { FileTreePanel } from "./components/FileTreePanel"
import { getLocalDiff, getDiffDescription } from "./providers/local"
import { parseDiff, getFiletype, countVisibleDiffLines, getTotalLineCount } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "./utils/file-tree"
import { openCommentEditor, extractDiffHunk } from "./utils/editor"
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
  type AppState,
} from "./state"
import { colors, theme } from "./theme"
import { loadOrCreateSession, loadComments, saveComment, deleteCommentFile } from "./storage"
import { createComment, type Comment, type AppMode } from "./types"
import type { PrInfo } from "./providers/github"
import { flattenThreadsForNav, groupIntoThreads } from "./utils/threads"

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

export interface AppOptions {
  mode?: AppMode
  target?: string
  // For PR mode - pre-loaded data
  diff?: string
  comments?: Comment[]
  prInfo?: PrInfo
}

export async function createApp(options: AppOptions = {}) {
  const { mode = "local", target, diff: preloadedDiff, comments: preloadedComments, prInfo } = options

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
    comments = await loadComments()
  }

  // Parse diff into files
  const files = parseDiff(rawDiff)
  const fileTree = buildFileTree(files)

  // Build source identifier
  const source = mode === "pr" && prInfo
    ? `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`
    : target ?? "local"

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

  // Initialize vim cursor state
  let vimState = createCursorState()

  // Line mapping (recreated when file selection changes)
  let lineMapping = createLineMapping()

  function createLineMapping(): DiffLineMapping {
    const mappingMode = state.selectedFileIndex === null ? "all" : "single"
    return new DiffLineMapping(state.files, mappingMode, state.selectedFileIndex ?? undefined)
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Create file tree panel (class-based to avoid flicker)
  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })

  // Create VimDiffView (class-based for cursor highlighting)
  const vimDiffView = new VimDiffView({ renderer })

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
      updateLineInfo()
    },
    getViewportHeight,
    onCursorMove: () => {
      ensureCursorVisible()
      vimDiffView.updateCursor(vimState)
      updateLineInfo()
    },
  })

  // Update file tree panel with current state
  function updateFileTreePanel() {
    fileTreePanel.update(
      state.files,
      state.fileTree,
      state.treeHighlightIndex,
      state.selectedFileIndex,
      state.focusedPanel === "tree"
    )
    fileTreePanel.visible = state.showFilePanel
    // Tell VimDiffView about file panel visibility for cursor positioning
    vimDiffView.setFilePanelVisible(state.showFilePanel, 35)
  }

  // Render function
  function render() {
    const selectedFile = getSelectedFile(state)
    const visibleComments = getVisibleComments(state)

    // Build hints based on context and view mode
    const hints: string[] = []
    hints.push("Tab: view")
    
    if (state.viewMode === "diff") {
      if (state.files.length > 0) {
        if (vimState.mode === "visual-line") {
          hints.push("c: comment selection", "Esc: cancel")
        } else {
          hints.push("V: select", "c: comment")
        }
      }
      hints.push("j/k/w/b: move")
    } else {
      hints.push("j/k: navigate", "Enter: jump")
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

    // Update file tree panel state
    updateFileTreePanel()

    // Main content based on view mode
    let content
    if (state.error) {
      content = Text({ content: `Error: ${state.error}`, fg: colors.error })
    } else if (state.files.length === 0) {
      content = Text({ content: "No changes to display", fg: colors.textDim })
    } else if (state.viewMode === "comments") {
      // Comments view
      content = Box(
        {
          id: "main-content-row",
          width: "100%",
          height: "100%",
          flexDirection: "row",
        },
        Box(
          {
            flexGrow: 1,
            height: "100%",
            flexDirection: "column",
          },
          CommentsView({
            comments: visibleComments,
            selectedIndex: state.selectedCommentIndex,
            selectedFilename: selectedFile?.filename ?? null,
          })
        )
      )
    } else {
      // Diff view with VimDiffView (handles cursor highlighting internally)
      // Update VimDiffView with current state
      vimDiffView.update(
        state.files,
        state.selectedFileIndex,
        lineMapping,
        vimState,
        state.comments
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

    // Build line info for status bar
    let lineInfo: string | undefined
    if (state.viewMode === "diff" && state.files.length > 0) {
      const line = vimState.line + 1  // Convert to 1-indexed for display
      const col = vimState.col + 1    // Convert to 1-indexed for display
      const total = lineMapping.lineCount
      const modeStr = vimState.mode === "visual-line" ? " [V-LINE]" : ""
      lineInfo = `${line}:${col}/${total}${modeStr}`
    }

    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        // Header
        Header({
          title: "neoriff",
          viewMode: state.viewMode,
          selectedFile,
          totalFiles: state.files.length,
          prInfo: state.prInfo,
        }),
        // Main content area
        Box(
          {
            flexGrow: 1,
            width: "100%",
          },
          content
        ),
        // Status bar
        StatusBar({ 
          hints,
          lineInfo,
        })
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
  }

  // Scroll offset - keep cursor this many lines from top/bottom edge
  const SCROLL_OFF = 5

  // Line info renderable for status bar (created lazily)
  let lineInfoRenderable: any = null
  
  /**
   * Update the line info in status bar
   */
  function updateLineInfo(): void {
    // Trigger a re-render to update the status bar with new cursor position
    render()
  }

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
    
    if (cursorLine < topThreshold) {
      // Cursor is above the safe zone - scroll up
      const newScrollTop = Math.max(0, cursorLine - SCROLL_OFF)
      scrollBox.scrollTop = newScrollTop
    } else if (cursorLine > bottomThreshold) {
      // Cursor is below the safe zone - scroll down
      const newScrollTop = Math.min(maxScroll, cursorLine - viewportHeight + SCROLL_OFF + 1)
      scrollBox.scrollTop = newScrollTop
    }
  }

  // Save a comment to disk
  async function persistComment(comment: Comment) {
    await saveComment(comment)
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

    // Find existing comment for this location
    const existingComment = state.comments.find(
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

    // Suspend TUI and open editor
    renderer.suspend()

    try {
      const commentBody = await openCommentEditor({
        diffContent: contextLines.length > 0 ? contextLines.join("\n") : file.content,
        filePath: anchor.filename,
        line: anchor.line,
        existingComment: existingComment?.body,
      })

      if (commentBody !== null) {
        if (existingComment) {
          // Update existing comment
          const updatedComment = { ...existingComment, body: commentBody }
          state = {
            ...state,
            comments: state.comments.map(c =>
              c.id === existingComment.id ? updatedComment : c
            ),
          }
          await persistComment(updatedComment)
        } else {
          // Create new comment with diff context
          const comment = createComment(anchor.filename, anchor.line, commentBody, anchor.side)
          comment.diffHunk = extractDiffHunk(file.content, anchor.line)
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

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    
    // ========== GLOBAL KEYS (work in any mode) ==========
    switch (key.name) {
      case "q":
        quit()
        return

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
    
    // ========== KEY SEQUENCES (]f, [f) ==========
    if (pendingKey) {
      const sequence = `${pendingKey}${key.name}`
      clearPendingKey()

      if (sequence === "]f") {
        navigateFileSelection(1)
        return
      } else if (sequence === "[f") {
        navigateFileSelection(-1)
        return
      }
      // Other sequences like ]c, [c handled by vim handler
    }

    if (key.name === "]" || key.name === "[") {
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
            const newTree = toggleNodeExpansion(state.fileTree, collapseItem.node.path)
            state = updateFileTree(state, newTree)
            render()
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
      }
    }

    // ========== COMMENTS VIEW FOCUSED ==========
    if (state.viewMode === "comments" && state.focusedPanel === "comments") {
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null)
      
      switch (key.name) {
        case "j":
        case "down":
          state = moveCommentSelection(state, 1, navItems.length - 1)
          render()
          return

        case "k":
        case "up":
          state = moveCommentSelection(state, -1, navItems.length - 1)
          render()
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

      // Handle 'V' for visual line mode (explicit check)
      if (key.name === "v" && key.shift) {
        vimState = enterVisualLineMode(vimState)
        vimDiffView.updateCursor(vimState)
        return
      }

      // Handle escape to exit visual mode
      if (key.name === "escape" && vimState.mode === "visual-line") {
        vimState = exitVisualMode(vimState)
        vimDiffView.updateCursor(vimState)
        return
      }

      // Handle 'n' and 'N' for search repeat
      if (key.name === "n" && !key.ctrl) {
        vimHandler.repeatSearch(key.shift)
        return
      }
    }
  })

  // Initial render
  render()

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
