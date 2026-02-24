import { createCliRenderer, Box, Text, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { Header, StatusBar, DiffView, getScrollBox, getFlatTreeItems, CommentsList, Gutter, CursorIndicator, CommentIndicators } from "./components"
import { FileTreePanel } from "./components/FileTreePanel"
import { getLocalDiff, getDiffDescription } from "./providers/local"
import { parseDiff, getFiletype, countDiffLines } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "./utils/file-tree"
import { openCommentEditor } from "./utils/editor"
import {
  createInitialState,
  goToFile,
  toggleFilePanel,
  toggleFocus,
  updateFileTree,
  addComment,
  deleteComment,
  openCommentsList,
  closeCommentsList,
  moveCommentsListSelection,
  getCommentsForCurrentFile,
  getCommentForLine,
  moveCursor,
  setCursorLine,
  resetCursor,
  type AppState,
} from "./state"
import { colors, theme } from "./theme"
import { loadOrCreateSession, saveSession, loadComments, saveComment, deleteCommentFile } from "./storage"
import { createComment, type Comment } from "./types"

export interface AppOptions {
  target?: string
}

export async function createApp(options: AppOptions = {}) {
  const { target } = options

  // Get diff content
  let rawDiff = ""
  let description = ""
  let error: string | null = null

  try {
    rawDiff = await getLocalDiff(target)
    description = await getDiffDescription(target)
  } catch (err) {
    error = err instanceof Error ? err.message : "Unknown error"
  }

  // Parse diff into files
  const files = parseDiff(rawDiff)
  const fileTree = buildFileTree(files)

  // Load or create session and comments
  const source = target ?? "local"
  const session = await loadOrCreateSession(source)
  const comments = await loadComments()

  // Initialize state
  let state = createInitialState(files, fileTree, source, description, error, session, comments)

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Create file tree panel (class-based to avoid flicker)
  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })

  // Update file tree panel with current state
  function updateFileTreePanel() {
    fileTreePanel.update(
      state.files,
      state.fileTree,
      state.currentFileIndex,
      state.selectedTreeIndex,
      state.focusedPanel === "tree"
    )
    fileTreePanel.visible = state.showFilePanel
  }

  // Render function
  function render() {
    const currentFile = state.files[state.currentFileIndex]
    const flatItems = getFlatTreeItems(state.fileTree, state.files)
    const fileComments = getCommentsForCurrentFile(state)
    const totalComments = state.comments.length

    // Build hints based on context and mode
    const hints: string[] = []
    if (state.mode === "normal") {
      if (state.files.length > 1) {
        hints.push("]f/[f: file")
      }
      if (state.files.length > 0) {
        hints.push("c: comment")
        if (totalComments > 0) {
          hints.push(`C: list (${totalComments})`)
        }
        hints.push("Ctrl+b: panel")
      }
      hints.push("j/k: scroll", "q: quit")
    } else if (state.mode === "comments-list") {
      hints.push("j/k: navigate", "Enter: jump", "d: delete", "Esc: close")
    }

    // Update file tree panel state
    updateFileTreePanel()

    // Main content
    const content = state.error
      ? Text({ content: `Error: ${state.error}`, fg: colors.error })
      : state.files.length === 0
        ? Text({ content: "No changes to display", fg: colors.textDim })
        : Box(
            {
              id: "main-content-row",
              width: "100%",
              height: "100%",
              flexDirection: "row",
            },
            // File tree panel is added as first child via insertBefore below
            // Gutter for cursor and comment indicators
            Gutter(),
            // Diff view (with relative positioning for overlays)
            Box(
              {
                flexGrow: 1,
                height: "100%",
                flexDirection: "column",
                position: "relative",
              },
              DiffView({
                diff: currentFile?.content ?? "",
                filetype: currentFile ? getFiletype(currentFile.filename) : undefined,
              }),
              // Comments list overlay
              state.mode === "comments-list"
                ? CommentsList({
                    comments: fileComments,
                    selectedIndex: state.commentsListIndex,
                    filename: currentFile?.filename ?? "",
                  })
                : null
            )
          )

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

    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
        },
        // Header with file info
        Header({
          title: "neoriff",
          subtitle: state.description,
          currentFile,
          fileIndex: state.currentFileIndex,
          totalFiles: state.files.length,
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
          lineInfo: state.files.length > 0 ? `L:${state.cursorLine}` : undefined,
        })
      )
    )

    // Insert file tree panel into the content row as first child
    if (state.files.length > 0) {
      const contentRow = renderer.root.findDescendantById("main-content-row")
      if (contentRow && fileTreePanel.getContainer().parent !== contentRow) {
        const gutter = renderer.root.findDescendantById("gutter")
        if (gutter) {
          contentRow.insertBefore(fileTreePanel.getContainer(), gutter)
        }
      }
    }
  }

  // Get scroll box reference
  let scrollBox: ScrollBoxRenderable | null = null
  function updateScrollBox() {
    scrollBox = getScrollBox(renderer)
  }

  // Calculate the left offset for indicators based on file panel visibility
  function getIndicatorLeftOffset(): number {
    // File tree panel width + border (1 char)
    const filePanelWidth = state.showFilePanel ? 36 : 0
    return filePanelWidth
  }

  // Create cursor and comment indicators (positioned absolutely)
  const cursorIndicator = new CursorIndicator({
    renderer,
    topOffset: 1, // Account for header
    leftOffset: getIndicatorLeftOffset(),
  })

  const commentIndicators = new CommentIndicators({
    renderer,
    topOffset: 1, // Account for header
    leftOffset: getIndicatorLeftOffset(),
  })

  // Scroll offset - keep cursor this many lines from top/bottom edge
  const SCROLL_OFF = 5

  // Update indicators (cursor + comments)
  function updateIndicators() {
    const currentFile = state.files[state.currentFileIndex]
    if (!currentFile || !scrollBox) {
      cursorIndicator.hide()
      commentIndicators.hide()
      return
    }
    
    const fileComments = getCommentsForCurrentFile(state)
    const scrollTop = scrollBox.scrollTop
    const viewportHeight = Math.floor(scrollBox.height)
    
    // Update left offset in case file panel was toggled
    const leftOffset = getIndicatorLeftOffset()
    cursorIndicator.setLeftOffset(leftOffset)
    commentIndicators.setLeftOffset(leftOffset)
    
    // Update cursor indicator (cursorLine is 1-indexed, convert to 0-indexed)
    cursorIndicator.update(state.cursorLine - 1, scrollTop, viewportHeight)
    
    // Update comment indicators
    commentIndicators.update(fileComments, scrollTop, viewportHeight)
  }

  /**
   * Ensure cursor is visible with scrolloff margin (vim-like behavior)
   * Only scrolls if cursor is outside the "safe zone"
   */
  function ensureCursorVisible() {
    if (!scrollBox) return
    
    const cursorLine = state.cursorLine - 1 // Convert to 0-indexed
    const scrollTop = scrollBox.scrollTop
    const viewportHeight = Math.floor(scrollBox.height)
    const maxScroll = scrollBox.scrollHeight - viewportHeight
    
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

  // Get max line for current file
  function getMaxLine(): number {
    const currentFile = state.files[state.currentFileIndex]
    if (!currentFile) return 1
    return countDiffLines(currentFile.content)
  }

  // Save a comment to disk
  async function persistComment(comment: Comment) {
    await saveComment(comment)
  }

  // Delete a comment from disk
  async function removeCommentFile(commentId: string) {
    await deleteCommentFile(commentId)
  }

  function quit() {
    renderer.destroy()
    process.exit(0)
  }

  // Key sequence tracking for ]f, [f
  let pendingKey: string | null = null
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null

  function clearPendingKey() {
    pendingKey = null
    if (pendingTimeout) {
      clearTimeout(pendingTimeout)
      pendingTimeout = null
    }
  }

  /**
   * Get files in tree order (as they appear visually in the file tree).
   * Returns array of file indices in display order.
   */
  function getFilesInTreeOrder(): number[] {
    const flatItems = getFlatTreeItems(state.fileTree, state.files)
    return flatItems
      .filter(item => item.fileIndex !== undefined)
      .map(item => item.fileIndex!)
  }

  /**
   * Navigate to next/previous file in tree order.
   * @param direction 1 for next, -1 for previous
   */
  function navigateFileInTreeOrder(direction: 1 | -1): void {
    const treeOrder = getFilesInTreeOrder()
    if (treeOrder.length === 0) return

    const currentPosInTree = treeOrder.indexOf(state.currentFileIndex)
    if (currentPosInTree === -1) return

    const newPosInTree = currentPosInTree + direction
    if (newPosInTree < 0 || newPosInTree >= treeOrder.length) return

    const newFileIndex = treeOrder[newPosInTree]!
    state = goToFile(state, newFileIndex)
    state = resetCursor(state)
    
    // Also update tree selection to match
    const flatItems = getFlatTreeItems(state.fileTree, state.files)
    const newTreeIndex = flatItems.findIndex(item => item.fileIndex === newFileIndex)
    if (newTreeIndex !== -1) {
      state = { ...state, selectedTreeIndex: newTreeIndex }
    }
    
    render()
    setTimeout(() => {
      updateScrollBox()
      updateIndicators()
    }, 0)
  }

  /**
   * Open external editor to write a comment on the current cursor line.
   * Suspends the TUI while the editor is open.
   */
  async function handleOpenCommentEditor() {
    const currentFile = state.files[state.currentFileIndex]
    if (!currentFile) return

    const line = state.cursorLine
    const existingComment = getCommentForLine(state, line)

    // Suspend TUI and open editor
    renderer.suspend()

    try {
      const commentBody = await openCommentEditor({
        diffContent: currentFile.content,
        filePath: currentFile.filename,
        line,
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
          // Create new comment
          const comment = createComment(currentFile.filename, line, commentBody)
          state = addComment(state, comment)
          await persistComment(comment)
        }
      }
    } finally {
      // Resume TUI
      renderer.resume()
      render()
      setTimeout(updateIndicators, 0)
    }
  }

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // ========== COMMENTS LIST MODE ==========
    if (state.mode === "comments-list") {
      const fileComments = getCommentsForCurrentFile(state)
      
      switch (key.name) {
        case "escape":
          state = closeCommentsList(state)
          render()
          setTimeout(updateIndicators, 0)
          return
          
        case "j":
        case "down":
          state = moveCommentsListSelection(state, 1)
          render()
          return
          
        case "k":
        case "up":
          state = moveCommentsListSelection(state, -1)
          render()
          return
          
        case "return":
        case "enter":
          // Jump to selected comment's line
          const selectedComment = fileComments[state.commentsListIndex]
          if (selectedComment) {
            state = setCursorLine(state, selectedComment.line, getMaxLine())
            state = closeCommentsList(state)
            render()
            setTimeout(() => {
              updateIndicators()
              // Scroll to show the line
              scrollBox?.scrollTo(selectedComment.line - 5)
            }, 0)
          }
          return
          
        case "d":
          // Delete selected comment
          const commentToDelete = fileComments[state.commentsListIndex]
          if (commentToDelete) {
            state = deleteComment(state, commentToDelete.id)
            removeCommentFile(commentToDelete.id)
            render()
          }
          return
      }
      return
    }
    
    // ========== NORMAL MODE ==========
    
    // Handle key sequences
    if (pendingKey) {
      const sequence = `${pendingKey}${key.name}`
      clearPendingKey()

      if (sequence === "]f") {
        navigateFileInTreeOrder(1)
        return
      } else if (sequence === "[f") {
        navigateFileInTreeOrder(-1)
        return
      }
    }

    // Start sequence
    if (key.name === "]" || key.name === "[") {
      pendingKey = key.name
      pendingTimeout = setTimeout(clearPendingKey, 500)
      return
    }

    // Handle tree panel focus
    if (state.showFilePanel && state.focusedPanel === "tree") {
      const flatItems = getFlatTreeItems(state.fileTree, state.files)

      switch (key.name) {
        case "j":
        case "down":
          state = {
            ...state,
            selectedTreeIndex: Math.min(state.selectedTreeIndex + 1, flatItems.length - 1),
          }
          updateFileTreePanel()
          fileTreePanel.ensureSelectedVisible()
          return

        case "k":
        case "up":
          state = {
            ...state,
            selectedTreeIndex: Math.max(state.selectedTreeIndex - 1, 0),
          }
          updateFileTreePanel()
          fileTreePanel.ensureSelectedVisible()
          return

        case "return":
        case "enter":
          const selectedItem = flatItems[state.selectedTreeIndex]
          if (selectedItem) {
            if (selectedItem.node.isDirectory) {
              // Toggle folder expansion
              const newTree = toggleNodeExpansion(state.fileTree, selectedItem.node.path)
              state = updateFileTree(state, newTree)
            } else if (typeof selectedItem.fileIndex === "number") {
              // Go to file
              state = goToFile(state, selectedItem.fileIndex)
              state = resetCursor(state)
              state = { ...state, focusedPanel: "diff" }
              setTimeout(() => {
                updateScrollBox()
                updateIndicators()
              }, 0)
            }
          }
          render()
          return

        case "l":
        case "right":
          // Expand folder
          const expandItem = flatItems[state.selectedTreeIndex]
          if (expandItem?.node.isDirectory && !expandItem.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, expandItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          }
          return

        case "h":
        case "left":
          // Collapse folder
          const collapseItem = flatItems[state.selectedTreeIndex]
          if (collapseItem?.node.isDirectory && collapseItem.node.expanded) {
            const newTree = toggleNodeExpansion(state.fileTree, collapseItem.node.path)
            state = updateFileTree(state, newTree)
            render()
          }
          return

        case "escape":
          // Return focus to diff
          state = { ...state, focusedPanel: "diff" }
          render()
          return
      }
    }

    // Global keybindings (normal mode, diff focused)
    switch (key.name) {
      case "q":
        quit()
        break

      case "b":
        if (key.ctrl) {
          state = toggleFilePanel(state)
          // Focus the panel when opening it
          if (state.showFilePanel) {
            state = { ...state, focusedPanel: "tree" }
          }
          render()
        }
        break

      case "tab":
        state = toggleFocus(state)
        render()
        break

      case "j":
      case "down":
        if (state.focusedPanel === "diff") {
          // Move cursor down, scroll only if needed (vim-like)
          state = moveCursor(state, 1, getMaxLine())
          ensureCursorVisible()
          updateIndicators()
        }
        break

      case "k":
      case "up":
        if (state.focusedPanel === "diff") {
          // Move cursor up, scroll only if needed (vim-like)
          state = moveCursor(state, -1, getMaxLine())
          ensureCursorVisible()
          updateIndicators()
        }
        break

      case "d":
        if (key.ctrl && state.focusedPanel === "diff") {
          // Half page down
          const height = renderer.height ?? 20
          const delta = Math.floor(height / 2)
          state = moveCursor(state, delta, getMaxLine())
          ensureCursorVisible()
          updateIndicators()
        }
        break

      case "u":
        if (key.ctrl && state.focusedPanel === "diff") {
          // Half page up
          const height = renderer.height ?? 20
          const delta = Math.floor(height / 2)
          state = moveCursor(state, -delta, getMaxLine())
          ensureCursorVisible()
          updateIndicators()
        }
        break

      case "g":
        if (state.focusedPanel === "diff") {
          // Go to top
          state = setCursorLine(state, 1, getMaxLine())
          scrollBox?.scrollTo(0)
          updateIndicators()
        }
        break

      case "G":
        if (key.shift && state.focusedPanel === "diff") {
          // Go to bottom
          const maxLine = getMaxLine()
          state = setCursorLine(state, maxLine, maxLine)
          ensureCursorVisible()
          updateIndicators()
        }
        break
        
      case "c":
        if (state.focusedPanel === "diff" && state.files.length > 0) {
          if (key.shift) {
            // Shift+C: Open comments list
            state = openCommentsList(state)
            render()
          } else {
            // c: Open external editor to add/edit comment on current cursor line
            handleOpenCommentEditor()
          }
        }
        break
    }
  })

  // Initial render
  render()
  setTimeout(() => {
    updateScrollBox()
    updateIndicators()
  }, 0)

  return {
    renderer,
    quit,
    getState: () => state,
  }
}
