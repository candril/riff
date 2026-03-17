import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"
import type { Comment, ReviewSession, AppMode, FileReviewStatus, ViewedStats } from "./types"
import type { PrInfo, PrCommit, PendingReview } from "./providers/github"
import { type ActionMenuState, createActionMenuState } from "./actions"
import type { ReviewEvent } from "./components/ReviewPreview"
import type { IgnoreMatcher } from "./utils/ignore"

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
 * Review preview section (tab navigation)
 */
export type ReviewPreviewSection = "input" | "comments"

/**
 * Review preview state
 */
export interface ReviewPreviewState {
  open: boolean
  selectedEvent: ReviewEvent
  loading: boolean
  error?: string
  /** Overall review comment/body */
  body: string
  /** IDs of comments to exclude from submission */
  excludedCommentIds: Set<string>
  /** Currently highlighted comment index for selection */
  highlightedIndex: number
  /** Which section is focused (tab navigation) */
  focusedSection: ReviewPreviewSection
  /** Existing pending review from GitHub (if any) */
  pendingReview: PendingReview | null
  /** Whether we're currently loading the pending review */
  pendingReviewLoading: boolean
}

/**
 * Sync preview state
 */
export interface SyncPreviewState {
  open: boolean
  loading: boolean
  error: string | null
  /** Index of highlighted item for navigation */
  highlightedIndex: number
}

/**
 * Toast notification state
 */
export interface ToastState {
  message: string | null
  type: "success" | "error" | "info"
}

/**
 * File picker state
 */
export interface FilePickerState {
  /** Whether the file picker is open */
  open: boolean
  /** Current search query */
  query: string
  /** Currently selected index */
  selectedIndex: number
}

/**
 * Thread preview state (quick view of comment thread from diff view)
 */
export interface ThreadPreviewState {
  open: boolean
  /** Comments to display in the thread preview */
  comments: Comment[]
  /** Filename where the thread is located */
  filename: string
  /** Line number in the file */
  line: number
}

/**
 * PR info panel state
 */
export type PRInfoPanelSection = 'description' | 'conversation' | 'files' | 'commits'

export interface PRInfoPanelState {
  open: boolean
  scrollOffset: number
  loading: boolean
  activeSection: PRInfoPanelSection  // Currently focused section
  cursorIndex: number  // Currently selected item within active section
}

/**
 * Commit picker state
 */
export interface CommitPickerState {
  /** Whether the commit picker is open */
  open: boolean
  /** Current search query */
  query: string
  /** Currently selected index (0 = "All commits" option) */
  selectedIndex: number
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
  collapsedThreadIds: Set<string>   // Thread IDs that are collapsed (root comment ID)

  // Comment state - comments stored separately from session
  session: ReviewSession | null
  comments: Comment[]
  commentInputLine: number | null
  commentInputText: string

  // Source info
  source: string
  description: string
  branchInfo: string | null
  error: string | null

  // PR info (only in PR mode)
  prInfo: PrInfo | null
  
  // Commits in this diff (PR commits or local commits)
  commits: PrCommit[]
  
  // Pending review from GitHub (draft review not yet submitted)
  pendingReview: PendingReview | null

  // File content cache for expansion
  fileContentCache: FileContentCache
  
  // Expanded dividers (key: "filename:dividerIndex")
  expandedDividers: Set<string>
  
  // Collapsed files in all-files diff view (filenames that are collapsed)
  collapsedFiles: Set<string>
  
  // Collapsed hunks (key: "filename:hunkIndex")
  collapsedHunks: Set<string>
  
  // Action menu state
  actionMenu: ActionMenuState
  
  // Review preview state
  reviewPreview: ReviewPreviewState
  
  // Sync preview state
  syncPreview: SyncPreviewState
  
  // Toast notification
  toast: ToastState
  
  // File picker state
  filePicker: FilePickerState
  
  // File review status (viewed/reviewed tracking)
  fileStatuses: Map<string, FileReviewStatus>
  viewedStats: ViewedStats
  
  // PR info panel state
  prInfoPanel: PRInfoPanelState
  
  // Thread preview state (quick view from diff view)
  threadPreview: ThreadPreviewState
  
  // Ignore patterns state
  ignoredFiles: Set<string>          // Filenames matching ignore patterns
  showHiddenFiles: boolean           // Toggle to show/hide ignored files in tree
  ignoreMatcher: IgnoreMatcher | null  // The matcher instance (null = no patterns)
  
  // Commit picker state
  commitPicker: CommitPickerState
  
  // Commit filtering - view changes from a specific commit
  viewingCommit: string | null       // null = all commits, string = specific commit SHA
  allFiles: DiffFile[]               // Full PR diff files (preserved when filtering by commit)
  allFileTree: FileTreeNode[]        // Full PR file tree (preserved when filtering by commit)
  commitDiffCache: Map<string, { files: DiffFile[]; fileTree: FileTreeNode[] }>  // Cached per-commit data
  
  // Confirmation dialog state
  confirmDialog: ConfirmDialogState | null
  
  // Help overlay state
  showHelp: boolean
}

/**
 * Confirmation dialog state
 */
export interface ConfirmDialogState {
  /** Dialog title */
  title: string
  /** Main message */
  message: string
  /** Optional details */
  details?: string
  /** Callback when user confirms (presses 'y') */
  onConfirm: () => void
  /** Callback when user cancels (presses 'n' or Escape) */
  onCancel: () => void
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
  prInfo: PrInfo | null = null,
  ignoreMatcher: IgnoreMatcher | null = null
): AppState {
  // Compute ignored files from matcher
  const ignoredFiles = ignoreMatcher
    ? ignoreMatcher.computeIgnoredSet(files)
    : new Set<string>()

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
    collapsedThreadIds: new Set(),
    session,
    comments,
    commentInputLine: null,
    commentInputText: "",
    source,
    description,
    branchInfo: null,
    error,
    prInfo,
    commits: [],
    pendingReview: null,
    fileContentCache: {},
    expandedDividers: new Set(),
    collapsedFiles: new Set(),
    collapsedHunks: new Set(),
    actionMenu: createActionMenuState(),
    reviewPreview: {
      open: false,
      selectedEvent: "COMMENT",
      loading: false,
      body: "",
      excludedCommentIds: new Set(),
      highlightedIndex: 0,
      focusedSection: "input",
      pendingReview: null,
      pendingReviewLoading: false,
    },
    syncPreview: {
      open: false,
      loading: false,
      error: null,
      highlightedIndex: 0,
    },
    toast: {
      message: null,
      type: "info",
    },
    filePicker: {
      open: false,
      query: "",
      selectedIndex: 0,
    },
    fileStatuses: new Map(),
    viewedStats: { total: files.length - ignoredFiles.size, viewed: 0, outdated: 0 },
    prInfoPanel: {
      open: false,
      scrollOffset: 0,
      loading: false,
      activeSection: 'commits',
      cursorIndex: 0,
    },
    threadPreview: {
      open: false,
      comments: [],
      filename: "",
      line: 0,
    },
    ignoredFiles,
    showHiddenFiles: false,
    ignoreMatcher,
    commitPicker: {
      open: false,
      query: "",
      selectedIndex: 0,
    },
    viewingCommit: null,
    allFiles: files,
    allFileTree: fileTree,
    commitDiffCache: new Map(),
    confirmDialog: null,
    showHelp: false,
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
 * Update thread resolved state on a root comment
 * The root comment is identified by its ID (thread ID matches root comment ID)
 */
export function setThreadResolved(state: AppState, rootCommentId: string, resolved: boolean): AppState {
  return {
    ...state,
    comments: state.comments.map(c =>
      c.id === rootCommentId ? { ...c, isThreadResolved: resolved } : c
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
 * Toggle thread collapse state
 */
export function toggleThreadCollapsed(state: AppState, threadId: string): AppState {
  const newSet = new Set(state.collapsedThreadIds)
  if (newSet.has(threadId)) {
    newSet.delete(threadId)
  } else {
    newSet.add(threadId)
  }
  return {
    ...state,
    collapsedThreadIds: newSet,
  }
}

/**
 * Collapse a thread
 */
export function collapseThread(state: AppState, threadId: string): AppState {
  if (state.collapsedThreadIds.has(threadId)) return state
  const newSet = new Set(state.collapsedThreadIds)
  newSet.add(threadId)
  return {
    ...state,
    collapsedThreadIds: newSet,
  }
}

/**
 * Expand a thread
 */
export function expandThread(state: AppState, threadId: string): AppState {
  if (!state.collapsedThreadIds.has(threadId)) return state
  const newSet = new Set(state.collapsedThreadIds)
  newSet.delete(threadId)
  return {
    ...state,
    collapsedThreadIds: newSet,
  }
}

/**
 * Initialize collapsed state for resolved threads
 */
export function collapseResolvedThreads(state: AppState, threads: { id: string; resolved: boolean }[]): AppState {
  const resolvedIds = threads.filter(t => t.resolved).map(t => t.id)
  if (resolvedIds.length === 0) return state
  
  const newSet = new Set(state.collapsedThreadIds)
  for (const id of resolvedIds) {
    newSet.add(id)
  }
  return {
    ...state,
    collapsedThreadIds: newSet,
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

// ============================================================================
// File Fold State (for all-files diff view)
// ============================================================================

/**
 * Toggle a file's collapsed state
 */
export function toggleFileFold(state: AppState, filename: string): AppState {
  const newCollapsed = new Set(state.collapsedFiles)
  if (newCollapsed.has(filename)) {
    newCollapsed.delete(filename)
  } else {
    newCollapsed.add(filename)
  }
  return {
    ...state,
    collapsedFiles: newCollapsed,
  }
}

/**
 * Collapse all files (zM)
 */
export function collapseAllFiles(state: AppState): AppState {
  const newCollapsed = new Set<string>()
  for (const file of state.files) {
    newCollapsed.add(file.filename)
  }
  return {
    ...state,
    collapsedFiles: newCollapsed,
  }
}

/**
 * Expand all files (zR)
 */
export function expandAllFiles(state: AppState): AppState {
  return {
    ...state,
    collapsedFiles: new Set(),
  }
}

// ============================================================================
// Hunk Fold State
// ============================================================================

/**
 * Toggle a hunk's collapsed state
 * @param hunkKey - Format: "filename:hunkIndex"
 */
export function toggleHunkFold(state: AppState, hunkKey: string): AppState {
  const newCollapsed = new Set(state.collapsedHunks)
  if (newCollapsed.has(hunkKey)) {
    newCollapsed.delete(hunkKey)
  } else {
    newCollapsed.add(hunkKey)
  }
  return {
    ...state,
    collapsedHunks: newCollapsed,
  }
}

/**
 * Check if a hunk is collapsed
 */
export function isHunkCollapsed(state: AppState, hunkKey: string): boolean {
  return state.collapsedHunks.has(hunkKey)
}

/**
 * Collapse all hunks
 */
export function collapseAllHunks(state: AppState): AppState {
  // This would need line mapping to know all hunk keys
  // For now, just return state - implement if needed
  return state
}

/**
 * Expand all hunks
 */
export function expandAllHunks(state: AppState): AppState {
  return {
    ...state,
    collapsedHunks: new Set(),
  }
}

/**
 * Check if a file is collapsed
 */
export function isFileCollapsed(state: AppState, filename: string): boolean {
  return state.collapsedFiles.has(filename)
}

/**
 * Collapse a file (for marking as viewed)
 */
export function collapseFile(state: AppState, filename: string): AppState {
  if (state.collapsedFiles.has(filename)) {
    return state  // Already collapsed
  }
  const newCollapsed = new Set(state.collapsedFiles)
  newCollapsed.add(filename)
  return {
    ...state,
    collapsedFiles: newCollapsed,
  }
}

/**
 * Collapse all viewed files
 */
export function collapseViewedFiles(state: AppState): AppState {
  const newCollapsed = new Set(state.collapsedFiles)
  for (const file of state.files) {
    if (state.fileStatuses.get(file.filename)?.viewed) {
      newCollapsed.add(file.filename)
    }
  }
  return {
    ...state,
    collapsedFiles: newCollapsed,
  }
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

// ============================================================================
// Action Menu State
// ============================================================================

/**
 * Open the action menu
 */
export function openActionMenu(state: AppState): AppState {
  return {
    ...state,
    actionMenu: {
      open: true,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Close the action menu
 */
export function closeActionMenu(state: AppState): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      open: false,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Update action menu query
 */
export function setActionMenuQuery(state: AppState, query: string): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      query,
      selectedIndex: 0, // Reset selection when query changes
    },
  }
}

/**
 * Move action menu selection (wraps around)
 */
export function moveActionMenuSelection(state: AppState, delta: number, maxIndex: number): AppState {
  let newIndex = state.actionMenu.selectedIndex + delta
  // Wrap around
  if (newIndex < 0) newIndex = maxIndex
  else if (newIndex > maxIndex) newIndex = 0
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      selectedIndex: newIndex,
    },
  }
}

// ============================================================================
// Review Preview State
// ============================================================================

/**
 * Open the review preview
 */
export function openReviewPreview(state: AppState): AppState {
  return {
    ...state,
    reviewPreview: {
      open: true,
      selectedEvent: "COMMENT",
      loading: false,
      error: undefined,
      body: "",
      excludedCommentIds: new Set(),
      highlightedIndex: 0,
      focusedSection: "input",
      // Use app-level pending review (already loaded when PR opened)
      pendingReview: state.pendingReview,
      pendingReviewLoading: false,
    },
  }
}

/**
 * Set the pending review at the app level (and sync to review preview if open)
 * Also adds pending review comments to the comments array with status="pending"
 */
export function setPendingReview(
  state: AppState,
  pendingReview: PendingReview | null
): AppState {
  // Remove any existing pending comments (they'll be re-added from the new pending review)
  const nonPendingComments = state.comments.filter(c => c.status !== "pending")
  
  // Convert pending review comments to Comment objects
  const pendingComments: Comment[] = pendingReview?.comments.map(pc => ({
    id: `pending-${pc.id}`,
    filename: pc.path,
    line: pc.line,
    side: pc.side,
    body: pc.body,
    createdAt: new Date().toISOString(),
    status: "pending" as const,
    githubId: pc.id,
    author: pendingReview.user,
  })) ?? []
  
  return {
    ...state,
    pendingReview,
    comments: [...nonPendingComments, ...pendingComments],
    reviewPreview: {
      ...state.reviewPreview,
      pendingReview,
      pendingReviewLoading: false,
    },
  }
}

/**
 * @deprecated Use setPendingReview instead
 */
export function setReviewPreviewPendingReview(
  state: AppState,
  pendingReview: PendingReview | null
): AppState {
  return setPendingReview(state, pendingReview)
}

/**
 * Close the review preview
 */
export function closeReviewPreview(state: AppState): AppState {
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      open: false,
      loading: false,
      error: undefined,
    },
  }
}

/**
 * Cycle through review events (Comment -> Approve -> Request Changes -> Comment)
 * @param direction 1 for next, -1 for previous (default: 1)
 */
export function cycleReviewEvent(state: AppState, direction: number = 1): AppState {
  const events: ReviewEvent[] = ["COMMENT", "APPROVE", "REQUEST_CHANGES"]
  const currentIndex = events.indexOf(state.reviewPreview.selectedEvent)
  const nextIndex = (currentIndex + direction + events.length) % events.length
  
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      selectedEvent: events[nextIndex]!,
    },
  }
}

/**
 * Set review preview loading state
 */
export function setReviewPreviewLoading(state: AppState, loading: boolean): AppState {
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      loading,
    },
  }
}

/**
 * Set review preview error
 */
export function setReviewPreviewError(state: AppState, error: string | undefined): AppState {
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      error,
      loading: false,
    },
  }
}

/**
 * Toggle a comment's inclusion in the review
 */
export function toggleReviewComment(state: AppState, commentId: string): AppState {
  const newExcluded = new Set(state.reviewPreview.excludedCommentIds)
  if (newExcluded.has(commentId)) {
    newExcluded.delete(commentId)
  } else {
    newExcluded.add(commentId)
  }
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      excludedCommentIds: newExcluded,
    },
  }
}

/**
 * Move review preview highlight
 */
export function moveReviewHighlight(state: AppState, delta: number, maxIndex: number): AppState {
  const newIndex = Math.max(0, Math.min(maxIndex, state.reviewPreview.highlightedIndex + delta))
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      highlightedIndex: newIndex,
    },
  }
}

/**
 * Toggle between input and comments section (Tab)
 */
export function toggleReviewSection(state: AppState): AppState {
  const newSection: ReviewPreviewSection = 
    state.reviewPreview.focusedSection === "input" ? "comments" : "input"
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      focusedSection: newSection,
    },
  }
}

/**
 * Set review event type directly
 */
export function setReviewEvent(state: AppState, event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES"): AppState {
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      selectedEvent: event,
    },
  }
}

/**
 * Update review body text
 */
export function setReviewBody(state: AppState, body: string): AppState {
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      body,
    },
  }
}

// ============================================================================
// Toast State
// ============================================================================

/**
 * Show a toast notification
 */
export function showToast(
  state: AppState, 
  message: string, 
  type: "success" | "error" | "info" = "info"
): AppState {
  return {
    ...state,
    toast: {
      message,
      type,
    },
  }
}

/**
 * Clear the toast notification
 */
export function clearToast(state: AppState): AppState {
  return {
    ...state,
    toast: {
      message: null,
      type: "info",
    },
  }
}

// ============================================================================
// Confirmation Dialog State
// ============================================================================

/**
 * Show a confirmation dialog
 */
export function showConfirmDialog(
  state: AppState,
  dialog: ConfirmDialogState
): AppState {
  return {
    ...state,
    confirmDialog: dialog,
  }
}

/**
 * Close the confirmation dialog
 */
export function closeConfirmDialog(state: AppState): AppState {
  return {
    ...state,
    confirmDialog: null,
  }
}

// ============================================================================
// File Picker State
// ============================================================================

/**
 * Open the file picker
 */
export function openFilePicker(state: AppState): AppState {
  return {
    ...state,
    filePicker: {
      open: true,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Close the file picker
 */
export function closeFilePicker(state: AppState): AppState {
  return {
    ...state,
    filePicker: {
      ...state.filePicker,
      open: false,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Update file picker query
 */
export function setFilePickerQuery(state: AppState, query: string): AppState {
  return {
    ...state,
    filePicker: {
      ...state.filePicker,
      query,
      selectedIndex: 0, // Reset selection when query changes
    },
  }
}

/**
 * Move file picker selection (wraps around)
 */
export function moveFilePickerSelection(state: AppState, delta: number, maxIndex: number): AppState {
  let newIndex = state.filePicker.selectedIndex + delta
  // Wrap around
  if (newIndex < 0) newIndex = maxIndex
  else if (newIndex > maxIndex) newIndex = 0
  return {
    ...state,
    filePicker: {
      ...state.filePicker,
      selectedIndex: newIndex,
    },
  }
}

// ============================================================================
// File Review Status (Viewed/Reviewed)
// ============================================================================

/**
 * Check if a file has been marked as viewed
 */
export function isFileViewed(state: AppState, filename: string): boolean {
  return state.fileStatuses.get(filename)?.viewed ?? false
}

/**
 * Toggle the viewed status of a file.
 * Note: For full functionality including viewedAtCommit, use the async version
 * toggleFileViewedWithCommit in the caller (app.ts).
 */
export function toggleFileViewed(state: AppState, filename: string): AppState {
  const current = state.fileStatuses.get(filename)?.viewed ?? false
  const newStatuses = new Map(state.fileStatuses)
  
  newStatuses.set(filename, {
    filename,
    viewed: !current,
    viewedAt: !current ? new Date().toISOString() : undefined,
  })
  
  return {
    ...state,
    fileStatuses: newStatuses,
    viewedStats: recomputeViewedStats(newStatuses, state.files, state.ignoredFiles),
  }
}

/**
 * Set the viewed status of a file with full status object
 */
export function setFileViewedStatus(state: AppState, status: FileReviewStatus): AppState {
  const newStatuses = new Map(state.fileStatuses)
  newStatuses.set(status.filename, status)
  
  return {
    ...state,
    fileStatuses: newStatuses,
    viewedStats: recomputeViewedStats(newStatuses, state.files, state.ignoredFiles),
  }
}

/**
 * Set the viewed status of a file (simple version)
 */
export function setFileViewed(state: AppState, filename: string, viewed: boolean): AppState {
  const newStatuses = new Map(state.fileStatuses)
  
  newStatuses.set(filename, {
    filename,
    viewed,
    viewedAt: viewed ? new Date().toISOString() : undefined,
  })
  
  return {
    ...state,
    fileStatuses: newStatuses,
    viewedStats: recomputeViewedStats(newStatuses, state.files, state.ignoredFiles),
  }
}

/**
 * Get review progress stats (uses cached viewedStats)
 */
export function getReviewProgress(state: AppState): { reviewed: number; total: number; outdated: number } {
  return {
    reviewed: state.viewedStats.viewed,
    total: state.viewedStats.total,
    outdated: state.viewedStats.outdated,
  }
}

/**
 * Load file statuses from storage data
 */
export function loadFileStatuses(state: AppState, statuses: FileReviewStatus[]): AppState {
  const newStatuses = new Map(state.fileStatuses)
  
  for (const status of statuses) {
    newStatuses.set(status.filename, status)
  }
  
  return {
    ...state,
    fileStatuses: newStatuses,
    viewedStats: recomputeViewedStats(newStatuses, state.files, state.ignoredFiles),
  }
}

/**
 * Update file statuses with a new map (e.g., after refresh)
 */
export function updateFileStatuses(state: AppState, statuses: Map<string, FileReviewStatus>): AppState {
  return {
    ...state,
    fileStatuses: statuses,
    viewedStats: recomputeViewedStats(statuses, state.files, state.ignoredFiles),
  }
}

/**
 * Recompute viewed stats from statuses and files.
 * Excludes ignored files from the total count.
 */
function recomputeViewedStats(
  statuses: Map<string, FileReviewStatus>,
  files: DiffFile[],
  ignoredFiles?: Set<string>
): ViewedStats {
  let total = 0
  let viewed = 0
  let outdated = 0
  
  for (const file of files) {
    // Skip ignored files from the count
    if (ignoredFiles?.has(file.filename)) continue
    
    total++
    const status = statuses.get(file.filename)
    if (status?.viewed) {
      viewed++
      if (status.isStale) {
        outdated++
      }
    }
  }
  
  return {
    total,
    viewed,
    outdated,
  }
}

/**
 * Check if a file is stale (viewed but modified since)
 */
export function isFileStale(state: AppState, filename: string): boolean {
  return state.fileStatuses.get(filename)?.isStale ?? false
}

// ============================================================================
// PR Info Panel State
// ============================================================================

/**
 * Open the PR info panel
 */
export function openPRInfoPanel(state: AppState): AppState {
  return {
    ...state,
    prInfoPanel: {
      open: true,
      scrollOffset: 0,
      loading: true,
      activeSection: 'commits',
      cursorIndex: 0,
    },
  }
}

/**
 * Set PR info panel loading state
 */
export function setPRInfoPanelLoading(state: AppState, loading: boolean): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      loading,
    },
  }
}

/**
 * Close the PR info panel
 */
export function closePRInfoPanel(state: AppState): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      open: false,
    },
  }
}

/**
 * Scroll the PR info panel
 */
export function scrollPRInfoPanel(state: AppState, delta: number): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      scrollOffset: Math.max(0, state.prInfoPanel.scrollOffset + delta),
    },
  }
}

/**
 * Move the cursor in the PR info panel
 */
export function movePRInfoPanelCursor(state: AppState, delta: number, maxIndex: number): AppState {
  const newIndex = Math.max(0, Math.min(maxIndex, state.prInfoPanel.cursorIndex + delta))
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      cursorIndex: newIndex,
    },
  }
}

/**
 * All PR info panel sections in order
 */
const PR_INFO_SECTIONS: PRInfoPanelSection[] = ['description', 'conversation', 'files', 'commits']

/**
 * Move to the next/previous section in the PR info panel
 */
export function cyclePRInfoPanelSection(state: AppState, delta: number): AppState {
  const currentIndex = PR_INFO_SECTIONS.indexOf(state.prInfoPanel.activeSection)
  const newIndex = (currentIndex + delta + PR_INFO_SECTIONS.length) % PR_INFO_SECTIONS.length
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      activeSection: PR_INFO_SECTIONS[newIndex]!,
      cursorIndex: 0,  // Reset cursor when changing sections
    },
  }
}

/**
 * Set the active section in the PR info panel
 */
export function setPRInfoPanelSection(state: AppState, section: PRInfoPanelSection): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      activeSection: section,
      cursorIndex: 0,
    },
  }
}

// ============================================================================
// Ignore Patterns State
// ============================================================================

/**
 * Open the thread preview for a specific line's comments
 */
export function openThreadPreview(
  state: AppState,
  comments: Comment[],
  filename: string,
  line: number
): AppState {
  return {
    ...state,
    threadPreview: {
      open: true,
      comments,
      filename,
      line,
    },
  }
}

/**
 * Close the thread preview
 */
export function closeThreadPreview(state: AppState): AppState {
  return {
    ...state,
    threadPreview: {
      ...state.threadPreview,
      open: false,
    },
  }
}

/**
 * Toggle visibility of hidden (ignored) files in the file tree
 */
export function toggleShowHiddenFiles(state: AppState): AppState {
  return {
    ...state,
    showHiddenFiles: !state.showHiddenFiles,
  }
}

// ============================================================================
// Commit Picker State
// ============================================================================

/**
 * Open the commit picker
 */
export function openCommitPicker(state: AppState): AppState {
  return {
    ...state,
    commitPicker: {
      open: true,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Close the commit picker
 */
export function closeCommitPicker(state: AppState): AppState {
  return {
    ...state,
    commitPicker: {
      ...state.commitPicker,
      open: false,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Update commit picker query
 */
export function setCommitPickerQuery(state: AppState, query: string): AppState {
  return {
    ...state,
    commitPicker: {
      ...state.commitPicker,
      query,
      selectedIndex: 0,
    },
  }
}

/**
 * Move commit picker selection (wraps around)
 */
export function moveCommitPickerSelection(state: AppState, delta: number, maxIndex: number): AppState {
  let newIndex = state.commitPicker.selectedIndex + delta
  if (newIndex < 0) newIndex = maxIndex
  else if (newIndex > maxIndex) newIndex = 0
  return {
    ...state,
    commitPicker: {
      ...state.commitPicker,
      selectedIndex: newIndex,
    },
  }
}

// ============================================================================
// Help Overlay State
// ============================================================================

/**
 * Toggle the help overlay
 */
export function toggleHelp(state: AppState): AppState {
  return {
    ...state,
    showHelp: !state.showHelp,
  }
}

/**
 * Open the help overlay
 */
export function openHelp(state: AppState): AppState {
  return {
    ...state,
    showHelp: true,
  }
}

/**
 * Close the help overlay
 */
export function closeHelp(state: AppState): AppState {
  return {
    ...state,
    showHelp: false,
  }
}

/**
 * Set the viewing commit and swap files/fileTree accordingly.
 * When switching to a specific commit, files/fileTree come from the cache.
 * When switching to null (all commits), restore allFiles/allFileTree.
 */
export function setViewingCommit(
  state: AppState,
  commitSha: string | null,
): AppState {
  if (commitSha === null) {
    // Restore full PR diff
    return {
      ...state,
      viewingCommit: null,
      files: state.allFiles,
      fileTree: state.allFileTree,
      selectedFileIndex: null,
      cursorLine: 1,
      collapsedFiles: new Set(),
      collapsedHunks: new Set(),
      expandedDividers: new Set(),
    }
  }

  // Switch to a specific commit's diff
  const cached = state.commitDiffCache.get(commitSha)
  if (!cached) return state  // Should not happen — caller caches first

  return {
    ...state,
    viewingCommit: commitSha,
    files: cached.files,
    fileTree: cached.fileTree,
    selectedFileIndex: null,
    cursorLine: 1,
    collapsedFiles: new Set(),
    collapsedHunks: new Set(),
    expandedDividers: new Set(),
  }
}
