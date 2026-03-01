import { createCliRenderer, Box, Text, BoxRenderable, TextRenderable, type KeyEvent, type ScrollBoxRenderable } from "@opentui/core"
import { Header, StatusBar, getFlatTreeItems, VimDiffView, ActionMenu, ReviewPreview, Toast, FilePicker, type ValidatedComment, type FilteredFile, canSubmit, getVisualActionOrder } from "./components"
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
  type SubmitResult,
} from "./providers/github"
import { parseDiff, getFiletype, countVisibleDiffLines, getTotalLineCount } from "./utils/diff-parser"
import { buildFileTree, toggleNodeExpansion } from "./utils/file-tree"
import { openCommentEditor, extractDiffHunk, parseEditorOutput, type EditorResult } from "./utils/editor"
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
  closeActionMenu,
  setActionMenuQuery,
  moveActionMenuSelection,
  openReviewPreview,
  closeReviewPreview,
  cycleReviewEvent,
  setReviewPreviewLoading,
  setReviewPreviewError,
  toggleReviewComment,
  moveReviewHighlight,
  nextReviewSection,
  prevReviewSection,
  setReviewBody,
  showToast,
  clearToast,
  openFilePicker,
  closeFilePicker,
  setFilePickerQuery,
  moveFilePickerSelection,
  setThreadResolved,
  type AppState,
} from "./state"
import { colors, theme } from "./theme"
import { loadOrCreateSession, loadComments, saveComment, deleteCommentFile } from "./storage"
import { createComment, type Comment, type AppMode } from "./types"
import type { PrInfo } from "./providers/github"
import { flattenThreadsForNav, groupIntoThreads } from "./utils/threads"
import { getAvailableActions, type Action } from "./actions"
import { fuzzyFilter } from "./utils/fuzzy"

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

  // Parse diff into files
  const files = parseDiff(rawDiff)
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
      }
    )
  }

  const renderer = await createCliRenderer({
    exitOnCtrlC: true,
  })

  // Create file tree panel (class-based to avoid flicker)
  const fileTreePanel = new FileTreePanel({ renderer, width: 35 })

  // Create VimDiffView (class-based for cursor highlighting)
  const vimDiffView = new VimDiffView({ renderer })
  
  // Create CommentsViewPanel (class-based to avoid flicker)
  const commentsViewPanel = new CommentsViewPanel({ renderer })
  
  // ReviewPreview is now functional, no instance needed

  // Post-process function for action menu and file picker cursor
  renderer.addPostProcessFn(() => {
    if (state.actionMenu.open) {
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
          hints.push("V: select", "c: comment")
        }
      }
      hints.push("j/k/w/b: move")
    } else {
      hints.push("j/k: navigate", "Enter: jump", "x: resolve")
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
      // Comments view - update class-based panel
      commentsViewPanel.update(
        visibleComments,
        state.selectedCommentIndex,
        selectedFile?.filename ?? null
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

    // Get filtered actions for action menu
    const availableActions = getAvailableActions(state)
    const filteredActions = state.actionMenu.query
      ? fuzzyFilter(state.actionMenu.query, availableActions, a => [a.label, a.id, a.description])
      : availableActions

    // Get filtered files for file picker
    const allFiles: FilteredFile[] = state.files.map((file, index) => ({ file, index }))
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
                state.comments.filter(c => c.status === "local" && !c.inReplyTo)
              ),
              state: state.reviewPreview,
              isOwnPr: state.prInfo !== null && cachedCurrentUser === state.prInfo.author,
            })
          : null,

        // File picker overlay
        state.filePicker.open
          ? FilePicker({
              query: state.filePicker.query,
              files: filteredFiles,
              selectedIndex: state.filePicker.selectedIndex,
            })
          : null
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
          if (newBody === currentBody) continue
          
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
   */
  async function handleExpandDivider() {
    const dividerKey = lineMapping.getDividerKey(vimState.line)
    if (!dividerKey) return  // Not on a divider
    
    const [filename] = dividerKey.split(":")
    if (!filename) return
    
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
          return
        }
        
        state = setFileContent(state, filename, newContent, oldContent)
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        state = setFileContentError(state, filename, msg)
        render()
        return
      }
    }
    
    // Toggle the divider expansion
    state = toggleDividerExpansion(state, dividerKey)
    
    // Rebuild line mapping with new expansion state
    lineMapping = createLineMapping()
    render()
  }

  /**
   * Get the comment under cursor (in diff view) or selected comment (in comments view)
   */
  function getCurrentComment(): Comment | null {
    if (state.viewMode === "comments") {
      // In comments view, use selected comment
      const visibleComments = getVisibleComments(state)
      const threads = groupIntoThreads(visibleComments)
      const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null)
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
      state = showToast(state, result.error ?? "Failed to submit comment", "error")
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
  }

  /**
   * Toggle the resolved state of the selected thread
   */
  async function handleToggleThreadResolved(): Promise<void> {
    // Get current selection
    const visibleComments = getVisibleComments(state)
    const threads = groupIntoThreads(visibleComments)
    const navItems = flattenThreadsForNav(threads, state.selectedFileIndex === null)
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
    
    if (localComments.length === 0) {
      const invalidCount = validatedComments.filter(vc => !vc.valid).length
      const msg = invalidCount > 0 
        ? `No valid comments to submit (${invalidCount} skipped - not in diff)`
        : "No comments selected to submit"
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
    const result = await submitReview(
      owner, 
      repo, 
      prNumber, 
      localComments, 
      headSha, 
      state.reviewPreview.selectedEvent,
      state.reviewPreview.body || undefined
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
      state = closeReviewPreview(state)
      const eventLabel = state.reviewPreview.selectedEvent === "APPROVE" 
        ? "Review approved" 
        : state.reviewPreview.selectedEvent === "REQUEST_CHANGES"
          ? "Changes requested"
          : "Review submitted"
      state = showToast(state, `${eventLabel} (${localComments.length} comment${localComments.length !== 1 ? "s" : ""})`, "success")
      
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

  // Action handlers (called when action is executed)
  async function executeAction(actionId: string) {
    switch (actionId) {
      case "quit":
        quit()
        break
      case "find-files":
        state = openFilePicker(state)
        render()
        break
      case "toggle-file-panel":
        state = toggleFilePanel(state)
        if (state.showFilePanel) {
          state = { ...state, focusedPanel: "tree" }
        }
        render()
        break
      case "toggle-view":
        state = toggleViewMode(state)
        render()
        break
      case "refresh":
        // TODO: Implement refresh
        break
      case "submit-review":
        handleOpenReviewPreview()
        break
      case "submit-comment":
        await handleSubmitSingleComment()
        break
      case "create-pr":
        // TODO: Implement create PR flow
        break
      case "open-in-browser":
        if (state.prInfo) {
          const { owner, repo, number: prNumber } = state.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        break
    }
  }

  // Keyboard handling
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    
    // ========== ACTION MENU (captures all input when open) ==========
    if (state.actionMenu.open) {
      const availableActions = getAvailableActions(state)
      const filteredActions = state.actionMenu.query
        ? fuzzyFilter(state.actionMenu.query, availableActions, a => [a.label, a.id, a.description])
        : availableActions
      // Get actions in visual order (grouped by category)
      const visualActions = getVisualActionOrder(filteredActions)
      
      switch (key.name) {
        case "escape":
          state = closeActionMenu(state)
          render()
          return
        
        case "return":
        case "enter":
          const selectedAction = visualActions[state.actionMenu.selectedIndex]
          if (selectedAction) {
            state = closeActionMenu(state)
            render()
            executeAction(selectedAction.id)
          }
          return
        
        case "up":
          state = moveActionMenuSelection(state, -1, visualActions.length - 1)
          render()
          return
        
        case "down":
          state = moveActionMenuSelection(state, 1, visualActions.length - 1)
          render()
          return
        
        case "p":
          // Ctrl+p moves up
          if (key.ctrl) {
            state = moveActionMenuSelection(state, -1, visualActions.length - 1)
            render()
            return
          }
          // Otherwise type 'p'
          state = setActionMenuQuery(state, state.actionMenu.query + "p")
          render()
          return
        
        case "n":
          // Ctrl+n moves down
          if (key.ctrl) {
            state = moveActionMenuSelection(state, 1, visualActions.length - 1)
            render()
            return
          }
          // Otherwise type 'n'
          state = setActionMenuQuery(state, state.actionMenu.query + "n")
          render()
          return
        
        case "backspace":
          if (state.actionMenu.query.length > 0) {
            state = setActionMenuQuery(state, state.actionMenu.query.slice(0, -1))
            render()
          }
          return
        
        default:
          // Type characters into search
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            state = setActionMenuQuery(state, state.actionMenu.query + key.sequence)
            render()
          }
          return
      }
    }
    
    // ========== FILE PICKER (captures all input when open) ==========
    if (state.filePicker.open) {
      const allFiles: FilteredFile[] = state.files.map((file, index) => ({ file, index }))
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
    
    // ========== REVIEW PREVIEW (captures all input when open) ==========
    // Tab-based navigation through 4 sections:
    // 1. Input - type summary/body
    // 2. Type - h/l to pick Comment/Approve/Request Changes
    // 3. Comments - j/k navigate, space toggle
    // 4. Submit - Enter to submit
    if (state.reviewPreview.open) {
      const validatedComments = validateCommentsForSubmit(
        state.comments.filter(c => c.status === "local" && !c.inReplyTo)
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
      
      // Tab moves to next section
      if (key.name === "tab" && !key.shift) {
        state = nextReviewSection(state)
        render()
        return
      }
      
      // Shift+Tab moves to previous section
      if (key.name === "tab" && key.shift) {
        state = prevReviewSection(state)
        render()
        return
      }
      
      // Section-specific key handling
      switch (section) {
        case "input":
          // Enter adds newline
          if (key.name === "return" || key.name === "enter") {
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
          // Type characters
          if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
            state = setReviewBody(state, state.reviewPreview.body + key.sequence)
            render()
            return
          }
          break
          
        case "type":
          // h/left = previous type
          if (key.name === "h" || key.name === "left") {
            state = cycleReviewEvent(state, -1)
            render()
            return
          }
          // l/right = next type
          if (key.name === "l" || key.name === "right") {
            state = cycleReviewEvent(state, 1)
            render()
            return
          }
          break
          
        case "comments":
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
          break
          
        case "submit":
          // Enter submits
          if (key.name === "return" || key.name === "enter") {
            if (!state.reviewPreview.loading && canSubmit(state.reviewPreview, includedCount, isOwn)) {
              handleConfirmReview()
            }
            return
          }
          break
      }
      
      // Capture all other keys (don't let them escape to normal mode)
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
      const sequence = `${pendingKey}${key.name}${key.shift ? "!" : ""}`
      clearPendingKey()

      if (sequence === "]f") {
        navigateFileSelection(1)
        return
      } else if (sequence === "[f") {
        navigateFileSelection(-1)
        return
      } else if (sequence === "gS!" || sequence === "gs!") {
        // gS (shift+S) - open review preview
        handleOpenReviewPreview()
        return
      } else if (sequence === "go") {
        // go - open PR in browser
        if (state.appMode === "pr" && state.prInfo) {
          const { owner, repo, number: prNumber } = state.prInfo
          Bun.spawn(["gh", "pr", "view", String(prNumber), "--web", "-R", `${owner}/${repo}`])
        }
        return
      }
      // Other sequences like ]c, [c handled by vim handler
    }

    if (key.name === "]" || key.name === "[" || key.name === "g") {
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
          commentsViewPanel.ensureSelectedVisible(state.selectedCommentIndex)
          return

        case "k":
        case "up":
          state = moveCommentSelection(state, -1, navItems.length - 1)
          render()
          commentsViewPanel.ensureSelectedVisible(state.selectedCommentIndex)
          return
        
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

  return {
    renderer,
    quit,
    getState: () => state,
    getVimState: () => vimState,
  }
}
