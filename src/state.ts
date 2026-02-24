import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"
import type { Comment, ReviewSession } from "./types"

/**
 * UI mode for the app
 */
export type UIMode = "normal" | "comment-input" | "comments-list"

/**
 * Application state
 */
export interface AppState {
  // Diff data
  files: DiffFile[]
  fileTree: FileTreeNode[]
  currentFileIndex: number

  // UI state
  showFilePanel: boolean
  focusedPanel: "tree" | "diff"
  selectedTreeIndex: number
  mode: UIMode

  // Diff cursor - the selected line in the diff view
  cursorLine: number

  // Comment state - comments stored separately from session
  session: ReviewSession | null
  comments: Comment[]
  commentInputLine: number | null
  commentInputText: string
  commentsListIndex: number // Selected index in comments list

  // Source info
  source: string
  description: string
  error: string | null
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
  comments: Comment[] = []
): AppState {
  return {
    files,
    fileTree,
    currentFileIndex: 0,
    showFilePanel: files.length > 1,
    focusedPanel: "diff",
    selectedTreeIndex: 0,
    mode: "normal",
    cursorLine: 1,
    session,
    comments,
    commentInputLine: null,
    commentInputText: "",
    commentsListIndex: 0,
    source,
    description,
    error,
  }
}

/**
 * Navigate to next file
 */
export function nextFile(state: AppState): AppState {
  if (state.files.length === 0) return state
  const newIndex = Math.min(state.currentFileIndex + 1, state.files.length - 1)
  return {
    ...state,
    currentFileIndex: newIndex,
  }
}

/**
 * Navigate to previous file
 */
export function prevFile(state: AppState): AppState {
  if (state.files.length === 0) return state
  const newIndex = Math.max(state.currentFileIndex - 1, 0)
  return {
    ...state,
    currentFileIndex: newIndex,
  }
}

/**
 * Go to specific file by index
 */
export function goToFile(state: AppState, index: number): AppState {
  if (index < 0 || index >= state.files.length) return state
  return {
    ...state,
    currentFileIndex: index,
  }
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
  return {
    ...state,
    focusedPanel: state.focusedPanel === "tree" ? "diff" : "tree",
  }
}

/**
 * Move selection in tree
 */
export function moveTreeSelection(state: AppState, delta: number): AppState {
  // This will be calculated based on flattened tree
  return {
    ...state,
    selectedTreeIndex: Math.max(0, state.selectedTreeIndex + delta),
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
 * Open comments list
 */
export function openCommentsList(state: AppState): AppState {
  return {
    ...state,
    mode: "comments-list",
    commentsListIndex: 0,
  }
}

/**
 * Close comments list
 */
export function closeCommentsList(state: AppState): AppState {
  return {
    ...state,
    mode: "normal",
  }
}

/**
 * Move comments list selection
 */
export function moveCommentsListSelection(state: AppState, delta: number): AppState {
  const currentFileComments = getCommentsForCurrentFile(state)
  const maxIndex = Math.max(0, currentFileComments.length - 1)
  
  return {
    ...state,
    commentsListIndex: Math.max(0, Math.min(state.commentsListIndex + delta, maxIndex)),
  }
}

/**
 * Get comments for the current file
 */
export function getCommentsForCurrentFile(state: AppState): Comment[] {
  if (state.files.length === 0) return []

  const currentFile = state.files[state.currentFileIndex]
  if (!currentFile) return []

  return state.comments.filter(c => c.filename === currentFile.filename)
}

/**
 * Get comment for a specific line in the current file
 */
export function getCommentForLine(state: AppState, line: number): Comment | undefined {
  return getCommentsForCurrentFile(state).find(c => c.line === line)
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
