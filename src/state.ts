import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"
import type { Comment, ReviewSession, AppMode } from "./types"
import type { PrInfo } from "./providers/github"

/**
 * UI mode for the app
 */
export type UIMode = "normal" | "comment-input" | "comments-list"

/**
 * Main view mode - which content to show
 */
export type ViewMode = "diff" | "comments"

/**
 * Cached file content (full file, not just diff)
 */
export interface FileContentCache {
  [filename: string]: {
    newContent: string | null  // After changes (HEAD or working copy)
    oldContent: string | null  // Before changes (parent revision)
    loading: boolean
    error?: string
  }
}

/**
 * Application state
 */
export interface AppState {
  // App mode
  appMode: AppMode

  // Diff data
  files: DiffFile[]
  fileTree: FileTreeNode[]

  // View mode and file selection
  viewMode: ViewMode
  selectedFileIndex: number | null  // null = no file selected, show all
  treeHighlightIndex: number        // Highlighted item in tree (for navigation)

  // UI state
  showFilePanel: boolean
  focusedPanel: "tree" | "diff" | "comments"
  mode: UIMode

  // Diff view state
  cursorLine: number                // Selected line in diff view

  // Comments view state
  selectedCommentIndex: number      // Selected comment in comments view

  // Comment state - comments stored separately from session
  session: ReviewSession | null
  comments: Comment[]
  commentInputLine: number | null
  commentInputText: string

  // Source info
  source: string
  description: string
  error: string | null

  // PR info (only in PR mode)
  prInfo: PrInfo | null

  // File content cache for expansion
  fileContentCache: FileContentCache
  
  // Expanded dividers (key: "filename:dividerIndex")
  expandedDividers: Set<string>
}

/**
 * Create initial state
 */
export function createInitialState(
  files: DiffFile[],
  fileTree: FileTreeNode[],
  source: string,
  description: string,
  error: string | null = null,
  session: ReviewSession | null = null,
  comments: Comment[] = [],
  appMode: AppMode = "local",
  prInfo: PrInfo | null = null
): AppState {
  return {
    appMode,
    files,
    fileTree,
    viewMode: "diff",
    selectedFileIndex: null,        // Default: no file selected, show all
    treeHighlightIndex: 0,          // Start highlight at first item
    showFilePanel: files.length > 1,
    focusedPanel: "diff",
    mode: "normal",
    cursorLine: 1,
    selectedCommentIndex: 0,
    session,
    comments,
    commentInputLine: null,
    commentInputText: "",
    source,
    description,
    error,
    prInfo,
    fileContentCache: {},
    expandedDividers: new Set(),
  }
}

/**
 * Select a file (scopes views to that file)
 */
export function selectFile(state: AppState, index: number | null): AppState {
  if (index !== null && (index < 0 || index >= state.files.length)) return state
  return {
    ...state,
    selectedFileIndex: index,
    cursorLine: 1,  // Reset cursor when changing file
    selectedCommentIndex: 0,  // Reset comment selection
  }
}

/**
 * Clear file selection (show all)
 */
export function clearFileSelection(state: AppState): AppState {
  return {
    ...state,
    selectedFileIndex: null,
    cursorLine: 1,
    selectedCommentIndex: 0,
  }
}

/**
 * Move tree highlight (navigation, not selection)
 */
export function moveTreeHighlight(state: AppState, delta: number, maxIndex: number): AppState {
  const newIndex = Math.max(0, Math.min(state.treeHighlightIndex + delta, maxIndex))
  return {
    ...state,
    treeHighlightIndex: newIndex,
  }
}

/**
 * Toggle view mode between diff and comments
 */
export function toggleViewMode(state: AppState): AppState {
  return {
    ...state,
    viewMode: state.viewMode === "diff" ? "comments" : "diff",
    focusedPanel: state.viewMode === "diff" ? "comments" : "diff",
  }
}

/**
 * Get the currently selected file (or null if showing all)
 */
export function getSelectedFile(state: AppState): DiffFile | null {
  if (state.selectedFileIndex === null) return null
  return state.files[state.selectedFileIndex] ?? null
}

/**
 * Toggle file panel visibility
 */
export function toggleFilePanel(state: AppState): AppState {
  return {
    ...state,
    showFilePanel: !state.showFilePanel,
  }
}

/**
 * Switch focus between panels
 */
export function toggleFocus(state: AppState): AppState {
  if (!state.showFilePanel) return state
  
  // Cycle: tree -> diff/comments -> tree
  if (state.focusedPanel === "tree") {
    return {
      ...state,
      focusedPanel: state.viewMode === "diff" ? "diff" : "comments",
    }
  }
  return {
    ...state,
    focusedPanel: "tree",
  }
}

/**
 * Update file tree (e.g., after toggling expansion)
 */
export function updateFileTree(state: AppState, fileTree: FileTreeNode[]): AppState {
  return {
    ...state,
    fileTree,
  }
}

/**
 * Move cursor in diff view
 */
export function moveCursor(state: AppState, delta: number, maxLine: number): AppState {
  const newLine = Math.max(1, Math.min(state.cursorLine + delta, maxLine))
  return {
    ...state,
    cursorLine: newLine,
  }
}

/**
 * Set cursor to specific line
 */
export function setCursorLine(state: AppState, line: number, maxLine: number): AppState {
  const newLine = Math.max(1, Math.min(line, maxLine))
  return {
    ...state,
    cursorLine: newLine,
  }
}

/**
 * Reset cursor when changing files
 */
export function resetCursor(state: AppState): AppState {
  return {
    ...state,
    cursorLine: 1,
  }
}

/**
 * Open comment input for a line
 */
export function openCommentInput(state: AppState, line: number): AppState {
  return {
    ...state,
    mode: "comment-input",
    commentInputLine: line,
    commentInputText: "",
  }
}

/**
 * Close comment input
 */
export function closeCommentInput(state: AppState): AppState {
  return {
    ...state,
    mode: "normal",
    commentInputLine: null,
    commentInputText: "",
  }
}

/**
 * Update comment input text
 */
export function updateCommentText(state: AppState, text: string): AppState {
  return {
    ...state,
    commentInputText: text,
  }
}

/**
 * Add a comment to state
 */
export function addComment(state: AppState, comment: Comment): AppState {
  return {
    ...state,
    mode: "normal",
    commentInputLine: null,
    commentInputText: "",
    comments: [...state.comments, comment],
  }
}

/**
 * Delete a comment by id
 */
export function deleteComment(state: AppState, commentId: string): AppState {
  return {
    ...state,
    comments: state.comments.filter(c => c.id !== commentId),
  }
}

/**
 * Update a comment body
 */
export function updateCommentBody(state: AppState, commentId: string, body: string): AppState {
  return {
    ...state,
    comments: state.comments.map(c =>
      c.id === commentId ? { ...c, body } : c
    ),
  }
}

/**
 * Move comments view selection
 */
export function moveCommentSelection(state: AppState, delta: number, maxIndex: number): AppState {
  const newIndex = Math.max(0, Math.min(state.selectedCommentIndex + delta, maxIndex))
  return {
    ...state,
    selectedCommentIndex: newIndex,
  }
}

/**
 * Get comments for current view scope (selected file or all)
 */
export function getVisibleComments(state: AppState): Comment[] {
  if (state.selectedFileIndex === null) {
    // No file selected - show all comments
    return state.comments
  }
  
  const selectedFile = state.files[state.selectedFileIndex]
  if (!selectedFile) return []
  
  return state.comments.filter(c => c.filename === selectedFile.filename)
}

/**
 * Get comment for a specific line in the selected file
 */
export function getCommentForLine(state: AppState, line: number): Comment | undefined {
  const selectedFile = getSelectedFile(state)
  if (!selectedFile) return undefined
  
  return state.comments.find(
    c => c.filename === selectedFile.filename && c.line === line
  )
}

/**
 * Update the session
 */
export function updateSession(state: AppState, session: ReviewSession): AppState {
  return {
    ...state,
    session,
  }
}

/**
 * Set file content loading state
 */
export function setFileContentLoading(state: AppState, filename: string): AppState {
  return {
    ...state,
    fileContentCache: {
      ...state.fileContentCache,
      [filename]: {
        newContent: null,
        oldContent: null,
        loading: true,
      },
    },
  }
}

/**
 * Set file content (after loading)
 */
export function setFileContent(
  state: AppState,
  filename: string,
  newContent: string | null,
  oldContent: string | null
): AppState {
  return {
    ...state,
    fileContentCache: {
      ...state.fileContentCache,
      [filename]: {
        newContent,
        oldContent,
        loading: false,
      },
    },
  }
}

/**
 * Set file content error
 */
export function setFileContentError(state: AppState, filename: string, error: string): AppState {
  return {
    ...state,
    fileContentCache: {
      ...state.fileContentCache,
      [filename]: {
        newContent: null,
        oldContent: null,
        loading: false,
        error,
      },
    },
  }
}

/**
 * Toggle divider expansion
 */
export function toggleDividerExpansion(state: AppState, dividerKey: string): AppState {
  const newExpanded = new Set(state.expandedDividers)
  if (newExpanded.has(dividerKey)) {
    newExpanded.delete(dividerKey)
  } else {
    newExpanded.add(dividerKey)
  }
  return {
    ...state,
    expandedDividers: newExpanded,
  }
}

/**
 * Check if a divider is expanded
 */
export function isDividerExpanded(state: AppState, dividerKey: string): boolean {
  return state.expandedDividers.has(dividerKey)
}

/**
 * Get file content from cache
 */
export function getFileContent(state: AppState, filename: string): { 
  newContent: string | null
  oldContent: string | null
  loading: boolean
  error?: string 
} | null {
  return state.fileContentCache[filename] ?? null
}
