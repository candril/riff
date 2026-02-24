import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"

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
  error: string | null = null
): AppState {
  return {
    files,
    fileTree,
    currentFileIndex: 0,
    showFilePanel: files.length > 1,
    focusedPanel: "diff",
    selectedTreeIndex: 0,
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
