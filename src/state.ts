import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"
import type { Comment, ReviewSession, AppMode, FileReviewStatus, ViewedStats, ReactionContent, ReactionSummary, ReactionTarget } from "./types"
import type { PrInfo, PrCommit, PendingReview } from "./providers/github"
import { type ActionMenuState, type ActionSubmenu, createActionMenuState } from "./actions"
import type { ReviewEvent } from "./components/ReviewPreview"
import type { IgnoreMatcher } from "./utils/ignore"
import type { JumpListState } from "./features/jumplist/types"
import { createJumpListState } from "./features/jumplist/types"

/**
 * UI mode for the app
 */
export type UIMode = "normal" | "comment-input" | "comments-list"

/**
 * Main view mode - which content to show.
 * "pr" is only reachable in PR mode (spec 041).
 */
export type ViewMode = "pr" | "diff"

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
  /** Cursor position within body (0..body.length) */
  cursorOffset: number
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
 * Comments picker state (spec 044). PR-wide fuzzy picker over every
 * comment in the diff. Triggered by `gC`. Shape mirrors FilePickerState.
 */
export interface CommentsPickerState {
  open: boolean
  query: string
  selectedIndex: number
}

/**
 * Inline comment overlay state (spec 039).
 *
 * Single surface for every comment action — read, reply, edit, delete,
 * resolve, submit. Opened with `Enter` on a commented line (view mode)
 * or `c` on any line (compose mode). Replaces the read-only ThreadPreview
 * modal that used to fill this slot.
 */
export type InlineCommentOverlayMode = "view" | "compose" | "edit"

export interface InlineCommentOverlayState {
  open: boolean
  mode: InlineCommentOverlayMode
  /** Filename where the thread is located */
  filename: string
  /** Line number in the file */
  line: number
  /** Which side (LEFT/RIGHT) — scopes the comment filter */
  side: "LEFT" | "RIGHT"
  /** Index of the currently highlighted comment in the derived thread.
   *  Target of view-mode actions (d, S, R, E, x) and of the palette
   *  React… submenu (spec 042). */
  highlightedIndex: number
  /** Draft body shown in the inline composer when in compose / edit mode. */
  input: string
  /** Comment id being edited (only meaningful in edit mode). */
  editingId: string | null
}

/**
 * PR info panel state
 */
export type PRInfoPanelSection = 'description' | 'checks' | 'conversation' | 'files' | 'commits'

export interface PRInfoPanelState {
  scrollOffset: number
  loading: boolean
  activeSection: PRInfoPanelSection  // Currently focused section
  cursorIndex: number  // Currently selected item within active section
  // PR-level comment input
  commentInputOpen: boolean
  commentInputText: string
  commentInputLoading: boolean
  commentInputError: string | null
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
  // Tree multi-select (visual-line mode in the sidebar). When non-null,
  // the range between this path and the row under the cursor is selected.
  // Stored as a node.path (not an index) so expand/collapse doesn't drift
  // the anchor; it's only auto-cleared if the anchor row vanishes entirely.
  treeSelectionAnchor: string | null

  // UI state
  showFilePanel: boolean
  filePanelExpanded: boolean  // When true, file panel takes full width
  focusedPanel: "tree" | "diff"
  mode: UIMode

  // Diff view state
  cursorLine: number                // Selected line in diff view

  // Comment thread state
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

  // Comments picker state (spec 044)
  commentsPicker: CommentsPickerState
  
  // File review status (viewed/reviewed tracking)
  fileStatuses: Map<string, FileReviewStatus>
  viewedStats: ViewedStats
  
  // PR info panel state
  prInfoPanel: PRInfoPanelState
  
  // Inline comment overlay state (spec 039 — actionable thread overlay)
  inlineCommentOverlay: InlineCommentOverlayState
  
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

  // Claude drafted-comment notification (spec 036). Non-null when the
  // background poller has detected a valid `draft-comment.json` for the
  // current PR. Pinned bottom-right, does not auto-dismiss.
  draftNotification: DraftNotificationState | null

  // Claude drafted-comment review dialog (spec 036). Non-null when the
  // user has triggered "review drafted comment" (via Ctrl+p, `gd`, or the
  // action menu). Captures the full draft so the dialog can render the
  // body and re-post it on approval without another disk read.
  draftReview: DraftReviewDialogState | null

  // What the palette's "React…" action targets right now (spec 042).
  // Views set this when they focus a reactable item (e.g. the inline
  // overlay's highlighted comment) and clear it when they're dismissed.
  // Null means the React action is not available in this context.
  reactionTarget: ReactionTarget | null

  // App-level jumplist (spec 038). Records "big" navigation events so
  // Ctrl-O/Ctrl-I can retrace them. See features/jumplist/.
  jumpList: JumpListState
}

/**
 * Display-only snapshot of a Claude-drafted inline PR comment (spec 036).
 * The full draft lives on disk at `draftPathFor(...)`; we store just
 * enough here to render the notification. The review action re-reads and
 * re-validates from disk so we always post what's actually there.
 */
export interface DraftNotificationState {
  filename: string
  line: number
  startLine?: number
  side: "LEFT" | "RIGHT"
  /** First ~140 chars of the draft body, newlines collapsed. */
  bodyPreview: string
  /** mtimeMs of the draft file at the last successful load. Used by the
   * poller to skip unchanged ticks. */
  mtimeMs: number
}

/**
 * Modal state for the drafted-comment review dialog (spec 036). Opened
 * when the user triggers "review drafted comment"; drives the bigger
 * preview + `y` / `e` / `d` / `Esc` key handling in
 * `src/app/global-keys.ts`.
 *
 * We inline the draft fields instead of importing `DraftCommentFile` from
 * `features/ai-review/post-draft.ts` to keep `state.ts` dependency-free
 * (that module imports from `state.ts` itself).
 */
export interface DraftReviewDialogState {
  filename: string
  side: "LEFT" | "RIGHT"
  line: number
  startLine?: number
  body: string
  draftedAt: string
  /** Absolute path to the JSON file on disk, used on approve/discard. */
  draftPath: string
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
    viewMode: appMode === "pr" ? "pr" : "diff",
    selectedFileIndex: null,        // Default: no file selected, show all
    treeHighlightIndex: 0,          // Start highlight at first item
    treeSelectionAnchor: null,      // No multi-select active
    // In PR mode we open on the PR overview (spec 041), so the tree
    // sidebar starts hidden and the user reveals it with Ctrl+B. In
    // local mode the diff is the first thing shown, so keep the tree
    // visible when there's more than one file to navigate.
    showFilePanel: appMode === "pr" ? false : files.length > 1,
    filePanelExpanded: false,
    focusedPanel: "diff",
    mode: "normal",
    cursorLine: 1,
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
      cursorOffset: 0,
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
    commentsPicker: {
      open: false,
      query: "",
      selectedIndex: 0,
    },
    fileStatuses: new Map(),
    viewedStats: { total: files.length - ignoredFiles.size, viewed: 0, outdated: 0 },
    prInfoPanel: {
      scrollOffset: 0,
      loading: false,
      activeSection: 'description',
      cursorIndex: -1,
      commentInputOpen: false,
      commentInputText: "",
      commentInputLoading: false,
      commentInputError: null,
    },
    inlineCommentOverlay: {
      open: false,
      mode: "view",
      filename: "",
      line: 0,
      side: "RIGHT",
      highlightedIndex: 0,
      input: "",
      editingId: null,
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
    draftNotification: null,
    draftReview: null,
    reactionTarget: null,
    jumpList: createJumpListState(),
  }
}

/**
 * Select a file (scopes views to that file).
 * If the app is in PR view, automatically switches to diff view — picking
 * a file from tree, file picker, Enter-on-files-section, etc. all funnel
 * through here so the view switch is one rule (spec 041).
 */
export function selectFile(state: AppState, index: number | null): AppState {
  if (index !== null && (index < 0 || index >= state.files.length)) return state
  return {
    ...state,
    viewMode: state.viewMode === "pr" ? "diff" : state.viewMode,
    selectedFileIndex: index,
    cursorLine: 1,  // Reset cursor when changing file
  }
}

/**
 * Clear file selection (show all)
 */
export function clearFileSelection(state: AppState): AppState {
  return {
    ...state,
    viewMode: state.viewMode === "pr" ? "diff" : state.viewMode,
    selectedFileIndex: null,
    cursorLine: 1,
  }
}

/**
 * Move tree highlight (navigation, not selection).
 *
 * Preserves `treeSelectionAnchor` — when multi-select is active, j/k extend
 * the derived range without touching the anchor.
 */
export function moveTreeHighlight(state: AppState, delta: number, maxIndex: number): AppState {
  const newIndex = Math.max(0, Math.min(state.treeHighlightIndex + delta, maxIndex))
  return {
    ...state,
    treeHighlightIndex: newIndex,
  }
}

/**
 * Enter tree multi-select mode: anchor the range at the current highlight.
 * Idempotent — callers pass the node.path they want to anchor at.
 */
export function setTreeSelectionAnchor(state: AppState, anchorPath: string): AppState {
  return { ...state, treeSelectionAnchor: anchorPath }
}

/**
 * Exit tree multi-select mode.
 */
export function clearTreeSelectionAnchor(state: AppState): AppState {
  if (state.treeSelectionAnchor === null) return state
  return { ...state, treeSelectionAnchor: null }
}

/**
 * Cycle main view mode.
 *
 * In PR mode this toggles pr ↔ diff. In local mode it's a no-op
 * (only "diff" exists outside PR mode).
 */
export function toggleViewMode(state: AppState): AppState {
  if (state.appMode !== "pr") return state
  const next: ViewMode = state.viewMode === "pr" ? "diff" : "pr"
  return {
    ...state,
    viewMode: next,
    focusedPanel: "diff",
  }
}

/**
 * Switch to the PR overview. Clears file selection so the PR view isn't
 * scoped to an individual file (spec 041). No-op outside PR mode.
 */
export function enterPrView(state: AppState): AppState {
  if (state.appMode !== "pr") return state
  return {
    ...state,
    viewMode: "pr",
    selectedFileIndex: null,
    focusedPanel: "diff",
  }
}

/**
 * Switch to the diff view, preserving file selection (spec 041).
 * Clears any reaction target inherited from the PR view so the React…
 * palette entry doesn't linger in contexts where it can't act (spec 042).
 */
export function enterDiffView(state: AppState): AppState {
  return {
    ...state,
    viewMode: "diff",
    focusedPanel: "diff",
    reactionTarget: null,
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
 * Toggle file panel expanded mode (full width vs normal)
 */
export function toggleFilePanelExpanded(state: AppState): AppState {
  return {
    ...state,
    filePanelExpanded: !state.filePanelExpanded,
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
  // Update the comment's resolved flag
  const newComments = state.comments.map(c =>
    c.id === rootCommentId ? { ...c, isThreadResolved: resolved } : c
  )

  // Auto-collapse when resolving, auto-expand when unresolving
  const newCollapsed = new Set(state.collapsedThreadIds)
  if (resolved) {
    newCollapsed.add(rootCommentId)
  } else {
    newCollapsed.delete(rootCommentId)
  }

  return {
    ...state,
    comments: newComments,
    collapsedThreadIds: newCollapsed,
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
      submenu: null,
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
      submenu: null,
    },
  }
}

/**
 * Swap the palette into a submenu. Resets query + selection so fuzzy
 * matching and up/down start fresh inside the new context (spec 042).
 */
export function openActionSubmenu(state: AppState, submenu: ActionSubmenu): AppState {
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      submenu,
      query: "",
      selectedIndex: 0,
    },
  }
}

/**
 * Back out of a submenu to the main action list. Query/selection reset
 * so the user doesn't see a filter they didn't type.
 */
export function closeActionSubmenu(state: AppState): AppState {
  if (state.actionMenu.submenu === null) return state
  return {
    ...state,
    actionMenu: {
      ...state.actionMenu,
      submenu: null,
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
      cursorOffset: 0,
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
  // A pending reply's parent could be a synced comment (gh-${id}) or another pending comment (pending-${id})
  const syncedGithubIds = new Set(nonPendingComments.filter(c => c.githubId).map(c => c.githubId))
  const pendingComments: Comment[] = pendingReview?.comments.map(pc => {
    let inReplyTo: string | undefined
    if (pc.inReplyToId) {
      // Check if parent is a synced comment first, then fall back to pending
      if (syncedGithubIds.has(pc.inReplyToId)) {
        inReplyTo = `gh-${pc.inReplyToId}`
      } else {
        inReplyTo = `pending-${pc.inReplyToId}`
      }
    }
    return {
      id: `pending-${pc.id}`,
      filename: pc.path,
      line: pc.line,
      side: pc.side,
      body: pc.body,
      createdAt: new Date().toISOString(),
      status: "pending" as const,
      githubId: pc.id,
      author: pendingReview.user,
      inReplyTo,
    }
  }) ?? []
  
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
 * Update review body text and cursor position.
 * If cursorOffset is omitted, defaults to the end of the new body.
 */
export function setReviewBody(
  state: AppState,
  body: string,
  cursorOffset?: number
): AppState {
  const nextCursor = Math.max(
    0,
    Math.min(body.length, cursorOffset ?? body.length)
  )
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      body,
      cursorOffset: nextCursor,
    },
  }
}

/**
 * Update cursor position within the review body (clamped).
 */
export function setReviewCursor(state: AppState, cursorOffset: number): AppState {
  const nextCursor = Math.max(
    0,
    Math.min(state.reviewPreview.body.length, cursorOffset)
  )
  return {
    ...state,
    reviewPreview: {
      ...state.reviewPreview,
      cursorOffset: nextCursor,
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
// Draft Notification State (spec 036)
// ============================================================================

/** Replace the drafted-comment notification (or set it for the first time). */
export function setDraftNotification(
  state: AppState,
  notification: DraftNotificationState,
): AppState {
  return { ...state, draftNotification: notification }
}

/** Clear the drafted-comment notification. Idempotent. */
export function clearDraftNotification(state: AppState): AppState {
  if (state.draftNotification === null) return state
  return { ...state, draftNotification: null }
}

/** Open the drafted-comment review dialog with the given draft snapshot. */
export function openDraftReview(
  state: AppState,
  review: DraftReviewDialogState,
): AppState {
  return { ...state, draftReview: review }
}

/** Close the drafted-comment review dialog. Idempotent. */
export function closeDraftReview(state: AppState): AppState {
  if (state.draftReview === null) return state
  return { ...state, draftReview: null }
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
// Comments Picker State (spec 044)
// ============================================================================

export function openCommentsPicker(state: AppState): AppState {
  return {
    ...state,
    commentsPicker: {
      open: true,
      query: "",
      selectedIndex: 0,
    },
  }
}

export function closeCommentsPicker(state: AppState): AppState {
  return {
    ...state,
    commentsPicker: {
      ...state.commentsPicker,
      open: false,
      query: "",
      selectedIndex: 0,
    },
  }
}

export function setCommentsPickerQuery(state: AppState, query: string): AppState {
  return {
    ...state,
    commentsPicker: {
      ...state.commentsPicker,
      query,
      selectedIndex: 0,
    },
  }
}

/** Wraps around at both ends, mirroring moveFilePickerSelection. */
export function moveCommentsPickerSelection(
  state: AppState,
  delta: number,
  maxIndex: number
): AppState {
  let newIndex = state.commentsPicker.selectedIndex + delta
  if (newIndex < 0) newIndex = maxIndex
  else if (newIndex > maxIndex) newIndex = 0
  return {
    ...state,
    commentsPicker: {
      ...state.commentsPicker,
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
 * Enter PR overview (spec 041). Resets panel cursor to the top section
 * so the user lands at a predictable starting point.
 */
export function openPRInfoPanel(state: AppState): AppState {
  return {
    ...enterPrView(state),
    prInfoPanel: {
      scrollOffset: 0,
      loading: false,
      activeSection: 'description',
      cursorIndex: -1,
      commentInputOpen: false,
      commentInputText: "",
      commentInputLoading: false,
      commentInputError: null,
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
 * Leave PR overview (spec 041). Returns to the diff view.
 */
export function closePRInfoPanel(state: AppState): AppState {
  return enterDiffView(state)
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

/**
 * Open PR-level comment input in PR info panel
 */
export function openPRCommentInput(state: AppState): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      commentInputOpen: true,
      commentInputText: "",
      commentInputLoading: false,
      commentInputError: null,
    },
  }
}

/**
 * Close PR-level comment input
 */
export function closePRCommentInput(state: AppState): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      commentInputOpen: false,
      commentInputText: "",
      commentInputLoading: false,
      commentInputError: null,
    },
  }
}

/**
 * Update PR-level comment input text
 */
export function setPRCommentInputText(state: AppState, text: string): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      commentInputText: text,
    },
  }
}

/**
 * Set PR comment input loading state
 */
export function setPRCommentInputLoading(state: AppState, loading: boolean): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      commentInputLoading: loading,
    },
  }
}

/**
 * Set PR comment input error
 */
export function setPRCommentInputError(state: AppState, error: string | null): AppState {
  return {
    ...state,
    prInfoPanel: {
      ...state.prInfoPanel,
      commentInputError: error,
    },
  }
}

// ============================================================================
// Ignore Patterns State
// ============================================================================

/**
 * Open the inline comment overlay (spec 039) for a specific line/side.
 * Comments are derived live via `getInlineCommentOverlayComments` — we
 * only stash the anchor here.
 *
 * Also points `reactionTarget` at the first comment in the thread so the
 * palette's "React…" action becomes available immediately (spec 042).
 */
export function openInlineCommentOverlay(
  state: AppState,
  filename: string,
  line: number,
  side: "LEFT" | "RIGHT",
  mode: InlineCommentOverlayMode = "view"
): AppState {
  const nextState: AppState = {
    ...state,
    inlineCommentOverlay: {
      open: true,
      mode,
      filename,
      line,
      side,
      highlightedIndex: 0,
      input: "",
      editingId: null,
    },
  }
  // Compute the reaction target from the derived comment list of the new
  // state (so we use the same filter as the renderer).
  const first = getInlineCommentOverlayComments(nextState)[0]
  const reactionTarget: ReactionTarget | null = first?.githubId
    ? { kind: "review-comment", githubId: first.githubId }
    : null
  return { ...nextState, reactionTarget }
}

/**
 * Close the inline comment overlay. Clears the reaction target so the
 * "React…" palette entry disappears while no thread is visible
 * (spec 042).
 */
export function closeInlineCommentOverlay(state: AppState): AppState {
  return {
    ...state,
    inlineCommentOverlay: {
      ...state.inlineCommentOverlay,
      open: false,
      mode: "view",
      input: "",
      editingId: null,
    },
    reactionTarget: null,
  }
}

/**
 * Derive the comments to show in the inline overlay from current state.
 * Returns a stable-ordered list: root comments on the anchor line/side,
 * plus all transitive replies.
 */
export function getInlineCommentOverlayComments(state: AppState): Comment[] {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return []
  const rootComments = state.comments.filter(
    (c) => c.filename === ov.filename && c.line === ov.line && c.side === ov.side && !c.inReplyTo
  )
  if (rootComments.length === 0) return []
  const threadIds = new Set(rootComments.map((c) => c.id))
  let added = true
  while (added) {
    added = false
    for (const c of state.comments) {
      if (!threadIds.has(c.id) && c.inReplyTo && threadIds.has(c.inReplyTo)) {
        threadIds.add(c.id)
        added = true
      }
    }
  }
  return state.comments.filter((c) => threadIds.has(c.id))
}

/**
 * Move the highlighted comment in the overlay by delta, clamped against
 * the current derived comment list. Also re-points `reactionTarget` at
 * the newly highlighted comment so the palette's React… submenu acts on
 * it (spec 042).
 */
export function moveInlineCommentOverlayHighlight(state: AppState, delta: number): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  const derived = getInlineCommentOverlayComments(state)
  if (derived.length === 0) return state
  const next = Math.max(0, Math.min(derived.length - 1, ov.highlightedIndex + delta))
  if (next === ov.highlightedIndex) return state
  const highlighted = derived[next]
  const reactionTarget: ReactionTarget | null = highlighted?.githubId
    ? { kind: "review-comment", githubId: highlighted.githubId }
    : null
  return {
    ...state,
    inlineCommentOverlay: { ...ov, highlightedIndex: next },
    reactionTarget,
  }
}

/**
 * Switch the overlay into compose mode (replying or new comment).
 */
export function startInlineCompose(state: AppState, prefill: string = ""): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mode: "compose",
      input: prefill,
      editingId: null,
    },
  }
}

/**
 * Switch the overlay into edit mode for a specific comment.
 */
export function startInlineEdit(
  state: AppState,
  commentId: string,
  prefill: string
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mode: "edit",
      input: prefill,
      editingId: commentId,
    },
  }
}

/**
 * Drop back to view mode without submitting; clears the draft.
 */
export function cancelInlineComposer(state: AppState): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mode: "view",
      input: "",
      editingId: null,
    },
  }
}

/**
 * Replace the composer draft (used as the user types).
 */
export function setInlineCommentInput(state: AppState, input: string): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return {
    ...state,
    inlineCommentOverlay: { ...ov, input },
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

// ============================================================================
// Reactions (spec 042)
// ============================================================================

/**
 * Declare what the palette's "React…" action should act on. Called by views
 * whenever their focused reactable item changes.
 */
export function setReactionTarget(state: AppState, target: ReactionTarget | null): AppState {
  // Identity check to avoid pointless re-renders when a view re-declares
  // the same target on every focus/hover tick.
  const cur = state.reactionTarget
  if (cur === target) return state
  if (cur && target && reactionTargetsEqual(cur, target)) return state
  return { ...state, reactionTarget: target }
}

function reactionTargetsEqual(a: ReactionTarget, b: ReactionTarget): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case "review-comment":
    case "issue-comment":
      return a.githubId === (b as typeof a).githubId
    case "review":
      return a.reviewId === (b as typeof a).reviewId && a.prNumber === (b as typeof a).prNumber
    case "issue":
      return a.prNumber === (b as typeof a).prNumber
  }
}

/**
 * Apply a reaction toggle to a target, optimistically or to reflect a
 * server response. The toggle handler calls this twice: first optimistically
 * with `wasReacted` = the *previous* viewerHasReacted value, then again (to
 * invert) if the network call fails.
 *
 * `reactionId` is only meaningful when adding — carry it into state so a
 * subsequent remove doesn't need an extra GET to find the viewer's reaction
 * id.
 */
export function applyReactionToggle(
  state: AppState,
  target: ReactionTarget,
  content: ReactionContent,
  nextReacted: boolean,
  reactionId: number | undefined,
): AppState {
  const mutate = (existing: ReactionSummary[] | undefined): ReactionSummary[] => {
    const list = existing ? [...existing] : []
    const idx = list.findIndex(r => r.content === content)
    if (idx === -1) {
      // No existing entry — add one if we're transitioning to "reacted".
      if (!nextReacted) return list
      list.push({ content, count: 1, viewerHasReacted: true, viewerReactionId: reactionId })
      return list
    }
    const cur = list[idx]!
    const wasReacted = cur.viewerHasReacted
    if (wasReacted === nextReacted) {
      // No change in viewer state; still honor an incoming reactionId so
      // a remove after the add has it cached.
      if (reactionId !== undefined) {
        list[idx] = { ...cur, viewerReactionId: reactionId }
      }
      return list
    }
    const delta = nextReacted ? 1 : -1
    const nextCount = Math.max(0, cur.count + delta)
    if (nextCount === 0 && !nextReacted) {
      list.splice(idx, 1)
      return list
    }
    list[idx] = {
      ...cur,
      count: nextCount,
      viewerHasReacted: nextReacted,
      viewerReactionId: nextReacted ? reactionId : undefined,
    }
    return list
  }

  switch (target.kind) {
    case "review-comment": {
      // The inline overlay derives its comments live from state.comments
      // via getInlineCommentOverlayComments, so updating comments here is
      // enough — the overlay's ReactionRow re-renders from the same source.
      const comments = state.comments.map(c =>
        c.githubId === target.githubId ? { ...c, reactions: mutate(c.reactions) } : c
      )
      return { ...state, comments }
    }
    case "issue-comment": {
      if (!state.prInfo?.conversationComments) return state
      const next = state.prInfo.conversationComments.map(c =>
        c.id === target.githubId ? { ...c, reactions: mutate(c.reactions) } : c
      )
      return { ...state, prInfo: { ...state.prInfo, conversationComments: next } }
    }
    case "review": {
      if (!state.prInfo?.reviews) return state
      const next = state.prInfo.reviews.map(r =>
        r.databaseId === target.reviewId ? { ...r, reactions: mutate(r.reactions) } : r
      )
      return { ...state, prInfo: { ...state.prInfo, reviews: next } }
    }
    case "issue": {
      if (!state.prInfo) return state
      return {
        ...state,
        prInfo: { ...state.prInfo, bodyReactions: mutate(state.prInfo.bodyReactions) },
      }
    }
  }
}

/**
 * Look up the current reaction list for a target (so the submenu can
 * render counts + "you reacted" tags). Returns [] when the target can't
 * be found (stale after a refresh race, for example).
 */
export function getReactionsForTarget(state: AppState, target: ReactionTarget): ReactionSummary[] {
  switch (target.kind) {
    case "review-comment": {
      const comment = state.comments.find(c => c.githubId === target.githubId)
      return comment?.reactions ?? []
    }
    case "issue-comment": {
      const c = state.prInfo?.conversationComments?.find(c => c.id === target.githubId)
      return c?.reactions ?? []
    }
    case "review": {
      const r = state.prInfo?.reviews?.find(r => r.databaseId === target.reviewId)
      return r?.reactions ?? []
    }
    case "issue":
      return state.prInfo?.bodyReactions ?? []
  }
}
