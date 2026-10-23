import type { DiffFile } from "./utils/diff-parser"
import type { FileTreeNode } from "./utils/file-tree"
import { treeRowsOf } from "./components/FileTree"
import type { Comment, ReviewSession, AppMode, FileReviewStatus, ViewedStats, ReactionContent, ReactionSummary, ReactionTarget } from "./types"
import { groupIntoThreads, isThreadCollapsed } from "./utils/threads"
import { markStaleFiles } from "./utils/viewed-status"
import type { BranchPr } from "./providers/current-pr"
import type { PrInfo, PrCommit, PendingReview } from "./providers/github/types"
import type { IgnoreMatcher } from "./utils/ignore"
import type { FilePickerState } from "./features/file-picker/state"
import type { CommentsPickerState } from "./features/comments-picker/state"
import type { OccurrencePickerState } from "./features/occurrence-picker/state"
import type { MarksPickerState } from "./features/marks/picker-state"
import type { CommitPickerState } from "./features/commit-picker/state"
import type { ActionMenuState } from "./features/action-menu/state"
import type { ActivityFeedState } from "./features/feed/state"
import type { PrInfoFilterState } from "./features/pr-info-panel/filter-state"
import type { CommitDiff } from "./features/commit-scope/diffs-state"

/**
 * UI mode for the app
 */
export type UIMode = "normal" | "comment-input" | "comments-list"

/**
 * Which of the three surfaces is on screen (spec 064): the PR's state, the
 * feed of what happened to it, or the diff. State and feed describe a pull
 * request, so only the diff exists in local mode.
 */
export type ViewMode = "state" | "feed" | "diff"

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
  /** `Ctrl-f`: what the panel's comments are narrowed to (spec 065). */
  filter: string
  filterInput: boolean
  open: boolean
  mode: InlineCommentOverlayMode
  /** Filename the panel is scoped to. View mode shows every comment in
   *  this file; compose/edit mode anchors a new comment / edit at
   *  (filename, line, side). */
  filename: string
  /** Line number — only meaningful for compose/edit mode. */
  line: number
  /** First line of the block the composer was opened on, when that was a
   *  selection rather than one line (spec 076). */
  startLine?: number
  /** Join the thread already on this line rather than starting one — what
   *  `r` means beside `c` and `n` (spec 081). */
  replyToThread?: boolean
  /** riff has the line; GitHub cannot anchor to it. What is written here is
   *  a note, and the composer says so before anything is typed (spec 085). */
  note?: boolean
  /** The anchored line as it read when the composer opened, hashed — what
   *  will say the line moved (spec 083). */
  anchorHash?: string
  /** Which side (LEFT/RIGHT) — only meaningful for compose/edit mode. */
  side: "LEFT" | "RIGHT"
  /** Index of the currently highlighted comment in the derived list.
   *  Target of view-mode actions (d, S, R, E, x) and of the palette
   *  React… submenu (spec 042). */
  highlightedIndex: number
  /** Draft body shown in the inline composer when in compose / edit mode. */
  input: string
  /** Comment id being edited (only meaningful in edit mode). */
  editingId: string | null
  /** Wider layout when the panel is the user's primary focus
   *  (toggle with Ctrl-e, mirrors the file tree's expand). */
  expanded: boolean
  /** When typing `@<query>` in the composer, this opens an in-overlay
   *  picker of PR participants. `null` when no trigger is active. */
  mentionPicker: MentionPickerState | null
  /** The `:shortcode` being typed, if one is (spec 082). */
  emojiPicker: EmojiPickerState | null
  /** Root comment ids the user has explicitly expanded. Resolved threads
   *  collapse to a single header row by default; `za`/Enter toggles a
   *  thread into this set, revealing its body + replies. Outdated
   *  threads use the same set to reveal the original diff hunk. Cleared
   *  when the panel closes. */
  expandedThreadIds: ReadonlySet<string>
  /** The comment whose original code is on show over the panel (spec 060),
   *  or null. */
  codePeekId: string | null
}

/**
 * Active `@mention` autocomplete session inside the composer. The
 * picker is driven by the textarea's content/cursor change events;
 * `atOffset` records where the triggering `@` sits in the buffer so
 * accepting a candidate can replace `@<query>` with `@<username> `.
 */
export interface MentionPickerState {
  query: string
  selectedIndex: number
  atOffset: number
}

/** An open `:shortcode` in the composer, and where its colon is (spec 082). */
export interface EmojiPickerState {
  query: string
  selectedIndex: number
  colonOffset: number
}

/**
 * PR info panel state
 */
export type PRInfoPanelSection =
  | 'description'
  | 'previews'
  | 'checks'
  | 'conversation'
  | 'files'
  | 'commits'

/**
 * Application state
 */
export interface AppState {
  // App mode
  appMode: AppMode
  /** riff was pointed at a path and is showing files, not a diff (spec 084).
   *  Nothing here can be anchored for GitHub, and there is no revision
   *  behind it to describe. */
  fileMode: boolean

  // Diff data
  files: DiffFile[]
  fileTree: FileTreeNode[]

  // View mode and file selection
  viewMode: ViewMode
  // The view `i`/`a`/`d` return to when the key of the current view is
  // pressed again. One slot, not a stack (spec 064).
  previousView: ViewMode | null
  selectedFileIndex: number | null  // null = no file selected, show all
  treeHighlightIndex: number        // Highlighted item in tree (for navigation)
  // Tree multi-select (visual-line mode in the sidebar). When non-null,
  // the range between this path and the row under the cursor is selected.
  // Stored as a node.path (not an index) so expand/collapse doesn't drift
  // the anchor; it's only auto-cleared if the anchor row vanishes entirely.
  treeSelectionAnchor: string | null

  // UI state
  /** File-tree path filter (`/` in the tree). Empty when off. */
  treeFilter: string
  /** True while the filter prompt is capturing keys. */
  treeFilterInput: boolean
  showFilePanel: boolean
  filePanelExpanded: boolean  // When true, file panel takes full width
  focusedPanel: "tree" | "diff" | "comments" | "chat"
  mode: UIMode

  // Comment state - comments stored separately from session
  session: ReviewSession | null
  comments: Comment[]

  // Source info
  source: string
  description: string
  branchInfo: string | null
  error: string | null

  // PR info (only in PR mode)
  prInfo: PrInfo | null
  
  // Commits in this diff (PR commits or local commits)
  commits: PrCommit[]
  
  // File review status (viewed/reviewed tracking)
  fileStatuses: Map<string, FileReviewStatus>
  viewedStats: ViewedStats

  // Inline comment overlay state (spec 039 — actionable thread overlay)
  inlineCommentOverlay: InlineCommentOverlayState
  
  // Ignore patterns state
  ignoredFiles: Set<string>          // Filenames matching ignore patterns
  showHiddenFiles: boolean           // Toggle to show/hide ignored files in tree
  /** The thread panel shows only threads that are neither resolved nor
   *  outdated. Top level so it outlives the panel closing (spec 039). */
  threadPanelOpenOnly: boolean
  /** The file tree shows only files not yet viewed. Top level so it
   *  outlives the panel being hidden. */
  treeUnviewedOnly: boolean
  /** The one viewed file the tree still shows while `treeUnviewedOnly` is
   *  on: the one the reader is on, so the highlight never loses its row. */
  treeKeptFile: string | null
  ignoreMatcher: IgnoreMatcher | null  // The matcher instance (null = no patterns)
  
  // Commit filtering - view changes from a specific commit
  /** The PR the branch already has, in local mode (spec 079). */
  branchPr: BranchPr | null
  viewingCommit: string | null       // null = all commits, else the newest commit in scope
  /** Every commit in scope, newest first, when more than one is (spec 078). */
  viewingCommitScope: string[] | null
  allFiles: DiffFile[]               // Full PR diff files (preserved when filtering by commit)
  allFileTree: FileTreeNode[]        // Full PR file tree (preserved when filtering by commit)
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
    fileMode: false,
    files,
    fileTree,
    viewMode: appMode === "pr" ? "state" : "diff",
    previousView: null,
    selectedFileIndex: null,        // Default: no file selected, show all
    treeHighlightIndex: 0,          // Start highlight at first item
    treeSelectionAnchor: null,      // No multi-select active
    // In PR mode we open on the PR overview (spec 041), so the tree
    // sidebar starts hidden and the user reveals it with Ctrl+B. In
    // local mode the diff is the first thing shown, so keep the tree
    // visible when there's more than one file to navigate.
    treeFilter: "",
    treeFilterInput: false,
    showFilePanel: appMode === "pr" ? false : files.length > 1,
    filePanelExpanded: false,
    focusedPanel: "diff",
    mode: "normal",
    session,
    comments,
    source,
    description,
    branchInfo: null,
    error,
    prInfo,
    commits: [],
    fileStatuses: new Map(),
    viewedStats: { total: files.length - ignoredFiles.size, viewed: 0, outdated: 0 },
    inlineCommentOverlay: {
      filter: "",
      filterInput: false,
      open: false,
      mode: "view",
      filename: "",
      line: 0,
      side: "RIGHT",
      highlightedIndex: 0,
      input: "",
      editingId: null,
      expanded: false,
      mentionPicker: null,
      emojiPicker: null,
      expandedThreadIds: new Set(),
      codePeekId: null,
    },
    ignoredFiles,
    showHiddenFiles: false,
    threadPanelOpenOnly: false,
    treeUnviewedOnly: false,
    treeKeptFile: null,
    ignoreMatcher,
    branchPr: null,
    viewingCommit: null,
    viewingCommitScope: null,
    allFiles: files,
    allFileTree: fileTree,
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
    viewMode: state.viewMode === "state" ? "diff" : state.viewMode,
    selectedFileIndex: index,
  }
}

/**
 * Give a listed file the content that was read for it (spec 084).
 *
 * File mode lists names and reads the file you open, so a file's rows only
 * exist once this has run for it.
 */
export function setFileDiff(state: AppState, filename: string, content: string): AppState {
  const index = state.files.findIndex((file) => file.filename === filename)
  if (index === -1) return state

  const files = [...state.files]
  files[index] = { ...files[index]!, content }
  return { ...state, files }
}

/**
 * Clear file selection (show all)
 *
 * File mode has no such view: a repository read as one scroll of every file
 * end to end is not something anyone wants, and the tree is how you move
 * between files there (spec 084).
 */
export function clearFileSelection(state: AppState): AppState {
  if (state.fileMode) return state
  return {
    ...state,
    viewMode: state.viewMode === "state" ? "diff" : state.viewMode,
    selectedFileIndex: null,
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
 * Go to a view, or back out of it (spec 064).
 *
 * Pressing the key of the view you are in returns you to the one you came
 * from — one slot of history, not a stack, so `i i i` means something a
 * reader can predict. State and feed are no-ops in local mode: there is no
 * pull request to describe.
 */
export function switchView(state: AppState, target: ViewMode): AppState {
  if (target !== "diff" && state.appMode !== "pr") return state
  if (state.viewMode !== target) {
    return { ...state, viewMode: target, previousView: state.viewMode, focusedPanel: "diff" }
  }

  const back = state.previousView
  if (!back || back === target) return state
  return { ...state, viewMode: back, previousView: target, focusedPanel: "diff" }
}

/**
 * Switch to the PR overview. No-op outside PR mode.
 *
 * The file selection stays as the diff left it: the diff is a view of its
 * own now, and it keeps its place while you are looking at something else
 * (spec 064).
 */
export function enterPrView(state: AppState): AppState {
  return switchView(state, "state")
}

/** Switch to the diff view, preserving file selection (spec 041). */
export function enterDiffView(state: AppState): AppState {
  return {
    ...state,
    viewMode: "diff",
    focusedPanel: "diff",
  }
}

/**
 * Which surface `Ctrl-f` narrows (spec 065). Whatever has focus: the
 * comments panel while it holds the keyboard, otherwise the view you are
 * looking at, and the file tree for the diff — filtering "the files" is what
 * narrowing a diff means.
 */
export type FilterTarget = StateFilterTarget | "feed" | "state"

export function filterTarget(state: AppState): FilterTarget {
  if (state.inlineCommentOverlay.open && state.focusedPanel === "comments") return "comments"
  if (state.viewMode === "feed") return "feed"
  if (state.viewMode === "state") return "state"
  return "tree"
}

/**
 * The surfaces whose filter AppState holds, which the functions below take.
 * The feed's and the PR overview's are in their factories;
 * src/app/view-filter.ts routes there.
 */
export type StateFilterTarget = "tree" | "comments"

/** Open `target`'s filter prompt, keeping what it already has. */
export function startViewFilter(state: AppState, target: StateFilterTarget): AppState {
  switch (target) {
    case "comments":
      return { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, filterInput: true } }
    case "tree":
      // A hidden tree cannot show what the filter left.
      return { ...startTreeFilter(state), showFilePanel: true, focusedPanel: "tree" }
  }
}

export function setViewFilter(state: AppState, target: StateFilterTarget, value: string): AppState {
  switch (target) {
    case "comments":
      return {
        ...state,
        inlineCommentOverlay: { ...state.inlineCommentOverlay, filter: value, highlightedIndex: 0 },
      }
    case "tree":
      return setTreeFilter(state, value)
  }
}

/** Enter: keep what the filter left and hand navigation back. */
export function commitViewFilter(state: AppState, target: StateFilterTarget): AppState {
  switch (target) {
    case "comments":
      return { ...state, inlineCommentOverlay: { ...state.inlineCommentOverlay, filterInput: false } }
    case "tree":
      return commitTreeFilter(state)
  }
}

/** Escape: drop the filter entirely. */
export function clearViewFilter(state: AppState, target: StateFilterTarget): AppState {
  switch (target) {
    case "comments":
      return {
        ...state,
        inlineCommentOverlay: { ...state.inlineCommentOverlay, filter: "", filterInput: false },
      }
    case "tree":
      return clearTreeFilter(state)
  }
}

/**
 * The pickers whose state lives in a factory of its own; one object, so each
 * picker that moves out of AppState adds a field rather than a parameter.
 */
export interface PromptPickers {
  filePicker: Pick<FilePickerState, "open">
  commentsPicker: Pick<CommentsPickerState, "open">
  occurrencePicker: Pick<OccurrencePickerState, "open">
  marksPicker: Pick<MarksPickerState, "open">
  commitPicker: Pick<CommitPickerState, "open">
  actionMenu: Pick<ActionMenuState, "open">
  activityFeed: Pick<ActivityFeedState, "filterInput">
  prInfoFilter: Pick<PrInfoFilterState, "filterInput">
}

/**
 * Whether one of the one-line prompts is up. They share a single input
 * widget, which draws its own cursor — so nothing else should be placing
 * the terminal cursor while one is open (spec 065).
 */
export function promptOpen(state: AppState, pickers: PromptPickers): boolean {
  return (
    pickers.actionMenu.open() ||
    pickers.filePicker.open() ||
    pickers.commentsPicker.open() ||
    pickers.marksPicker.open() ||
    pickers.occurrencePicker.open() ||
    pickers.commitPicker.open() ||
    state.treeFilterInput ||
    pickers.activityFeed.filterInput() ||
    pickers.prInfoFilter.filterInput() ||
    state.inlineCommentOverlay.filterInput
  )
}

/**
 * Get the currently selected file (or null if showing all)
 */
export function getSelectedFile(state: AppState): DiffFile | null {
  if (state.selectedFileIndex === null) return null
  return state.files[state.selectedFileIndex] ?? null
}

/**
 * Open the file-tree filter prompt, keeping whatever is already filtered so
 * `/` can refine rather than restart.
 */
export function startTreeFilter(state: AppState): AppState {
  return { ...state, treeFilterInput: true }
}

/** Type into the filter. The highlight is clamped by the tree renderer. */
export function setTreeFilter(state: AppState, treeFilter: string): AppState {
  return { ...state, treeFilter, treeHighlightIndex: 0 }
}

/** Accept the filter and go back to navigating what it left. */
export function commitTreeFilter(state: AppState): AppState {
  return { ...state, treeFilterInput: false }
}

/** Drop the filter entirely. */
export function clearTreeFilter(state: AppState): AppState {
  return { ...state, treeFilter: "", treeFilterInput: false, treeHighlightIndex: 0 }
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

/** `Ctrl-l`: one panel right along tree → diff → comments → chat, skipping what is not open. */
export function focusRight(state: AppState, chatOpen: boolean): AppState {
  switch (state.focusedPanel) {
    case "tree":
      // Leaving the tree drops its visual-line selection, so it does not linger as dormant state.
      return { ...state, focusedPanel: "diff", treeSelectionAnchor: null }
    case "diff":
      if (state.inlineCommentOverlay.open) return { ...state, focusedPanel: "comments" }
      return chatOpen ? { ...state, focusedPanel: "chat" } : state
    case "comments":
      return chatOpen ? { ...state, focusedPanel: "chat" } : state
    case "chat":
      return state
  }
}

/** `Ctrl-h`: one panel left along chat → comments → diff → tree, skipping what is not open. */
export function focusLeft(state: AppState): AppState {
  switch (state.focusedPanel) {
    case "chat":
      return { ...state, focusedPanel: state.inlineCommentOverlay.open ? "comments" : "diff" }
    case "comments":
      return { ...state, focusedPanel: "diff" }
    case "diff":
      return state.showFilePanel ? { ...state, focusedPanel: "tree" } : state
    case "tree":
      return state
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
 * Add a comment to state
 */
export function addComment(state: AppState, comment: Comment): AppState {
  return {
    ...state,
    mode: "normal",
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
 * Update thread resolved state on a root comment
 * The root comment is identified by its ID (thread ID matches root comment ID)
 */
export function setThreadResolved(state: AppState, rootCommentId: string, resolved: boolean): AppState {
  // Update the comment's resolved flag
  const newComments = state.comments.map(c =>
    c.id === rootCommentId ? { ...c, isThreadResolved: resolved } : c
  )

  // With open-only on, resolving the highlighted thread takes it out of
  // the panel; the highlight stays at its index rather than pointing past
  // the end, and whatever hung off the comment it left goes with it.
  return followInlineCommentOverlayHighlight(state, {
    ...state,
    comments: newComments,
  })
}

// ============================================================================
// Viewed files
// ============================================================================

/** The diff's files marked viewed, which a load folds shut. */
export function viewedFilenames(state: AppState): string[] {
  return state.files
    .filter((file) => state.fileStatuses.get(file.filename)?.viewed)
    .map((file) => file.filename)
}

// ============================================================================
// Pending Review
// ============================================================================

/**
 * The draft's comments replace the previous draft's wholesale, because GitHub
 * hands back the whole draft each time.
 */
export function withPendingComments(
  state: AppState,
  review: PendingReview | null
): AppState {
  const nonPendingComments = state.comments.filter(c => c.status !== "pending")
  
  // A pending reply's parent could be a synced comment (gh-${id}) or another pending comment (pending-${id})
  const syncedGithubIds = new Set(nonPendingComments.filter(c => c.githubId).map(c => c.githubId))
  const pendingComments: Comment[] = review?.comments.map(pc => {
    let inReplyTo: string | undefined
    if (pc.inReplyToId) {
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
      author: review.user,
      inReplyTo,
    }
  }) ?? []
  
  return {
    ...state,
    comments: [...nonPendingComments, ...pendingComments],
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
  const loaded = new Map(state.fileStatuses)
  
  for (const status of statuses) {
    loaded.set(status.filename, status)
  }
  const newStatuses = markStaleFiles(loaded, state.allFiles)
  
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

// ============================================================================
// PR Info Panel State
// ============================================================================

/** Enter PR overview (spec 041). Its filter is in a factory of its own, which the caller clears. */
export function openPRInfoPanel(state: AppState): AppState {
  return enterPrView(state)
}

/**
 * Leave PR overview (spec 041). Returns to the diff view.
 */
export function closePRInfoPanel(state: AppState): AppState {
  return enterDiffView(state)
}

// ============================================================================
// Ignore Patterns State
// ============================================================================

/**
 * Open the inline comment overlay (spec 039) for a specific line/side.
 * Comments are derived live via `getInlineCommentOverlayComments` — we
 * only stash the anchor here.
 */
export function openInlineCommentOverlay(
  state: AppState,
  filename: string,
  line: number,
  side: "LEFT" | "RIGHT",
  mode: InlineCommentOverlayMode = "view",
  /** The block this was opened on, when it was more than one line. */
  startLine?: number,
  /** Join the thread already here rather than starting one (spec 081). */
  reply?: boolean,
  /** What the anchor said about this line: whether GitHub could take it,
   *  and how the line read when the composer opened (spec 085); and the
   *  draft kept on it, which compose mode picks up (spec 061). */
  anchor?: { note?: boolean; anchorHash?: string; draft?: string },
): AppState {
  const nextState: AppState = {
    ...state,
    inlineCommentOverlay: {
      filter: "",
      filterInput: false,
      open: true,
      mode,
      filename,
      line,
      startLine: startLine && startLine < line ? startLine : undefined,
      replyToThread: reply === true,
      note: anchor?.note === true,
      anchorHash: anchor?.anchorHash,
      side,
      highlightedIndex: 0,
      // Opening straight into the composer picks up a draft left on this
      // line (spec 061); view mode has nothing to prefill.
      input: mode === "compose" ? anchor?.draft ?? "" : "",
      editingId: null,
      codePeekId: null,
      expanded: state.inlineCommentOverlay.expanded,
      mentionPicker: null,
      emojiPicker: null,
      // Fresh per-open expansion state — the user starts with everything
      // collapsed so the panel stays scannable.
      expandedThreadIds: new Set(),
    },
    // When opening from the diff, focus the panel so it's the active
    // surface — the user's intent is to interact with comments.
    focusedPanel: state.focusedPanel === "tree" ? state.focusedPanel : "comments",
  }
  // Highlight the thread anchored at (filename, line, side) when one
  // exists — so opening from a commented diff line lands on that thread
  // instead of the file's first one. Falls back to 0 (compose at a
  // freshly-anchored line, or no thread on this anchor yet).
  const displayOrder = getInlineCommentOverlayDisplayOrder(nextState)
  const anchorIdx = displayOrder.findIndex(
    (c) => c.filename === filename && c.line === line && c.side === side && !c.inReplyTo
  )
  const highlightedIndex = anchorIdx >= 0 ? anchorIdx : 0
  nextState.inlineCommentOverlay = {
    ...nextState.inlineCommentOverlay,
    highlightedIndex,
  }
  return nextState
}

/** Close the inline comment overlay. */
export function closeInlineCommentOverlay(state: AppState): AppState {
  return {
    ...state,
    inlineCommentOverlay: {
      ...state.inlineCommentOverlay,
      open: false,
      mode: "view",
      input: "",
      editingId: null,
      mentionPicker: null,
      emojiPicker: null,
      expandedThreadIds: new Set(),
      codePeekId: null,
    },
    // Hand focus back to the diff (or stay on tree). The panel can't
    // own focus while it's hidden.
    focusedPanel: state.focusedPanel === "comments" ? "diff" : state.focusedPanel,
  }
}

/**
 * Derive the panel's "current scope file": the user's selected file in
 * single-file view, or null in all-files view. Returning null lets the
 * caller decide between "show every comment" and "show nothing".
 */
export function getCommentsPanelScopeFilename(state: AppState): string | null {
  if (state.selectedFileIndex !== null) {
    return state.files[state.selectedFileIndex]?.filename ?? null
  }
  return null
}

/**
 * Derive the comments to show in the side panel — every comment in the
 * panel's current scope, ordered by source line so threads sit next to
 * the lines they comment on. Replies stay grouped with their roots
 * (the GitHub schema gives replies the same `line` as their root, so
 * the line-then-creation sort below keeps thread order intact).
 *
 * Scope follows the user's current file: single-file view → that file;
 * all-files view → every comment. Compose / edit modes share this list
 * — the composer is anchored at (filename, line, side) but the
 * surrounding panel still shows the file's whole conversation.
 *
 * `H` narrows this list, and only this list, to open threads: every panel
 * motion, the window and flash read it, so none of them can disagree about
 * what is shown.
 */
export function getInlineCommentOverlayComments(state: AppState): Comment[] {
  const { shown } = inlineCommentOverlayPool(state)
  return [...shown].sort((a, b) => {
    if (a.filename !== b.filename) return a.filename.localeCompare(b.filename)
    if (a.line !== b.line) return a.line - b.line
    return a.createdAt.localeCompare(b.createdAt)
  })
}

/**
 * How many threads the open-only toggle keeps out of the panel: counted
 * after scope and `/`, so the header never claims to hide what `/` already
 * dropped.
 */
export function getInlineCommentOverlayHiddenThreadCount(state: AppState): number {
  return inlineCommentOverlayPool(state).hiddenThreads
}

function inlineCommentOverlayPool(state: AppState): { shown: Comment[]; hiddenThreads: number } {
  if (!state.inlineCommentOverlay.open) return { shown: [], hiddenThreads: 0 }
  const scope = getCommentsPanelScopeFilename(state)
  const scoped = scope === null
    ? state.comments
    : state.comments.filter((c) => c.filename === scope)
  // `Ctrl-f` narrows on what the reader can see: who wrote it, what it says,
  // and which file it is on (spec 065). A reply that matches keeps its
  // thread — a comment without the exchange around it is unreadable.
  const needle = state.inlineCommentOverlay.filter.toLowerCase()
  const hit = (comment: Comment): boolean =>
    comment.author?.toLowerCase().includes(needle) === true ||
    comment.body.toLowerCase().includes(needle) ||
    comment.filename.toLowerCase().includes(needle)
  const matchedThreads = needle
    ? new Set(groupIntoThreads(scoped).filter((t) => t.comments.some(hit)).map((t) => t.id))
    : null
  const filtered = matchedThreads
    ? scoped.filter((c) => matchedThreads.has(c.inReplyTo ?? c.id))
    : scoped
  if (!state.threadPanelOpenOnly) return { shown: filtered, hiddenThreads: 0 }
  const closed = groupIntoThreads(filtered).filter((t) => t.resolved || t.outdated)
  if (closed.length === 0) return { shown: filtered, hiddenThreads: 0 }
  const closedIds = new Set(closed.flatMap((t) => t.comments.map((c) => c.id)))
  return { shown: filtered.filter((c) => !closedIds.has(c.id)), hiddenThreads: closed.length }
}

/**
 * The navigable display order for the inline comment overlay's `j/k` and
 * for openOverlay's anchor → highlight matching. A collapsed thread is one
 * navigable item (its root); an expanded thread exposes every comment. This
 * must mirror the panel's `visibleComments` rule exactly — otherwise j/k
 * steps onto comments that aren't drawn (or skips ones that are), which
 * reads as "j/k only lands on roots".
 */
export function getInlineCommentOverlayDisplayOrder(state: AppState): Comment[] {
  const all = getInlineCommentOverlayComments(state)
  if (all.length === 0) return all
  const threads = groupIntoThreads(all)
  const toggled = state.inlineCommentOverlay.expandedThreadIds
  return threads.flatMap((t) =>
    isThreadCollapsed(t, toggled) ? [t.comments[0]!] : t.comments
  )
}

/**
 * Toggle a thread's "expanded" state in the inline comment overlay.
 * `za`/Enter folds/unfolds the thread. Resolved threads default to
 * collapsed (a one-line header); everything else defaults to expanded —
 * the set flips that default. Outdated threads use the same flag to reveal
 * the original `diffHunk`.
 */
/**
 * Show (or put away) the code the highlighted comment was written against
 * (spec 060).
 */
export function setCommentCodePeek(state: AppState, id: string | null): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return { ...state, inlineCommentOverlay: { ...ov, codePeekId: id } }
}

/**
 * Open the thread a comment is in, if it is not open already.
 *
 * Arriving at a comment from somewhere else — the feed, the picker — and
 * finding its thread folded shut is arriving nowhere: a resolved thread
 * shows its root and nothing else, so the comment you asked for is the one
 * thing not on screen. `expandedThreadIds` flips the default rather than
 * setting it, so this asks whether the thread is collapsed and flips it
 * back rather than just adding the id.
 */
export function expandThreadFor(state: AppState, commentId: string): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state

  const thread = groupIntoThreads(getInlineCommentOverlayComments(state)).find((t) =>
    t.comments.some((c) => c.id === commentId)
  )
  if (!thread || !isThreadCollapsed(thread, ov.expandedThreadIds)) return state

  // The set flips the default, so opening a collapsed thread means adding
  // its id when it is resolved and dropping it when the reader folded it.
  const next = new Set(ov.expandedThreadIds)
  if (next.has(thread.id)) next.delete(thread.id)
  else next.add(thread.id)
  return { ...state, inlineCommentOverlay: { ...ov, expandedThreadIds: next } }
}

export function toggleInlineCommentOverlayExpand(state: AppState, threadId: string): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  const next = new Set(ov.expandedThreadIds)
  if (next.has(threadId)) next.delete(threadId)
  else next.add(threadId)
  const nextState: AppState = {
    ...state,
    inlineCommentOverlay: { ...ov, expandedThreadIds: next },
  }
  // Keep the highlight on the toggled thread. Collapsing drops its replies
  // from the display order, so an index that pointed at a reply would
  // otherwise land on an unrelated later comment — snap to the root.
  const displayOrder = getInlineCommentOverlayDisplayOrder(nextState)
  const rootIdx = displayOrder.findIndex((c) => c.id === threadId)
  if (rootIdx === -1) return nextState
  return {
    ...nextState,
    inlineCommentOverlay: { ...nextState.inlineCommentOverlay, highlightedIndex: rootIdx },
  }
}

/**
 * Select a specific comment in the overlay — used after saving a draft so
 * the highlight lands on what was just written instead of staying where
 * the user happened to be. A reply inside a collapsed thread isn't in the
 * display order, so its thread root is selected instead: that's the row
 * actually on screen.
 */
export function highlightInlineComment(state: AppState, commentId: string): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state

  const derived = getInlineCommentOverlayDisplayOrder(state)
  let next = derived.findIndex((c) => c.id === commentId)
  if (next === -1) {
    const thread = groupIntoThreads(getInlineCommentOverlayComments(state)).find((t) =>
      t.comments.some((c) => c.id === commentId)
    )
    const rootId = thread?.comments[0]?.id
    if (rootId) next = derived.findIndex((c) => c.id === rootId)
  }
  if (next === -1) return state

  return {
    ...state,
    inlineCommentOverlay: { ...ov, highlightedIndex: next },
  }
}

/**
 * Move the highlighted comment in the overlay by delta, clamped against
 * the current derived comment list.
 */
export function moveInlineCommentOverlayHighlight(state: AppState, delta: number): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  const derived = getInlineCommentOverlayDisplayOrder(state)
  if (derived.length === 0) return state
  const next = Math.max(0, Math.min(derived.length - 1, ov.highlightedIndex + delta))
  if (next === ov.highlightedIndex) return state
  return {
    ...state,
    inlineCommentOverlay: { ...ov, highlightedIndex: next },
  }
}

/**
 * Switch the overlay into compose mode (replying or new comment). A draft
 * abandoned on this line comes back rather than being lost, so callers pass
 * it as the prefill when they have nothing else (spec 061).
 */
export function startInlineCompose(
  state: AppState,
  prefill: string = "",
  options: { reply?: boolean } = {},
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mode: "compose",
      input: prefill,
      editingId: null,
      mentionPicker: null,
      emojiPicker: null,
      replyToThread: options.reply === true,
    },
  }
}

/**
 * Switch the overlay into edit mode for a specific comment. A rewrite
 * abandoned on this comment wins over its body, so callers pass that as the
 * prefill when there is one (spec 061).
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
      mentionPicker: null,
      emojiPicker: null,
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
      mentionPicker: null,
      emojiPicker: null,
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
 * Open or refresh the @mention picker session. Resets selection to the
 * top whenever the query changes so the highest-scoring candidate is
 * always primed for `Enter`/`Tab`.
 */
export function setMentionPicker(
  state: AppState,
  picker: { query: string; atOffset: number } | null
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  if (picker === null) {
    if (ov.mentionPicker === null) return state
    return {
      ...state,
      inlineCommentOverlay: { ...ov, mentionPicker: null },
    }
  }
  // Preserve selection when only the cursor twitched but the trigger
  // is the same — otherwise typing characters would visibly snap the
  // user's chosen entry back to the top.
  const prev = ov.mentionPicker
  if (prev && prev.query === picker.query && prev.atOffset === picker.atOffset) {
    return state
  }
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mentionPicker: { ...picker, selectedIndex: 0 },
    },
  }
}

/**
 * Move the mention picker selection. Caller passes the candidate count
 * so we can clamp without re-deriving the list here.
 */
/**
 * Open, move or close the emoji picker (spec 082). Mirrors the mention
 * picker: the selection survives a keystroke that leaves the query alone,
 * or the highlighted entry would snap back to the top as you type.
 */
export function setEmojiPicker(
  state: AppState,
  picker: { query: string; colonOffset: number } | null
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open) return state
  if (picker === null) {
    if (ov.emojiPicker === null) return state
    return { ...state, inlineCommentOverlay: { ...ov, emojiPicker: null } }
  }
  const prev = ov.emojiPicker
  if (prev && prev.query === picker.query && prev.colonOffset === picker.colonOffset) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      emojiPicker: { query: picker.query, colonOffset: picker.colonOffset, selectedIndex: 0 },
    },
  }
}

export function moveEmojiPickerSelection(
  state: AppState,
  delta: number,
  candidateCount: number
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open || !ov.emojiPicker || candidateCount === 0) return state
  const cur = ov.emojiPicker.selectedIndex
  let next = cur + delta
  if (next < 0) next = candidateCount - 1
  else if (next >= candidateCount) next = 0
  if (next === cur) return state
  return {
    ...state,
    inlineCommentOverlay: { ...ov, emojiPicker: { ...ov.emojiPicker, selectedIndex: next } },
  }
}

export function moveMentionPickerSelection(
  state: AppState,
  delta: number,
  candidateCount: number
): AppState {
  const ov = state.inlineCommentOverlay
  if (!ov.open || !ov.mentionPicker || candidateCount === 0) return state
  const cur = ov.mentionPicker.selectedIndex
  let next = cur + delta
  if (next < 0) next = candidateCount - 1
  else if (next >= candidateCount) next = 0
  if (next === cur) return state
  return {
    ...state,
    inlineCommentOverlay: {
      ...ov,
      mentionPicker: { ...ov.mentionPicker, selectedIndex: next },
    },
  }
}

/**
 * Show only open threads in the panel, or everything again. The highlight
 * follows the comment it was on when that comment is still shown, so the
 * toggle never moves the reader off what they were reading.
 */
export function toggleThreadPanelOpenOnly(state: AppState): AppState {
  const ov = state.inlineCommentOverlay
  const before = getInlineCommentOverlayDisplayOrder(state)[ov.highlightedIndex]
  const next: AppState = { ...state, threadPanelOpenOnly: !state.threadPanelOpenOnly }
  if (!ov.open) return next
  const order = getInlineCommentOverlayDisplayOrder(next)
  const kept = before ? order.findIndex((c) => c.id === before.id) : -1
  const highlightedIndex = kept >= 0
    ? kept
    : Math.max(0, Math.min(order.length - 1, ov.highlightedIndex))
  return settleInlineCommentOverlayHighlight(next, highlightedIndex)
}

/**
 * After the panel's comments changed under it: the highlight keeps its
 * index, clamped, and when that now lands on a different comment, or the
 * peeked comment is gone, the peek follows.
 */
function followInlineCommentOverlayHighlight(before: AppState, after: AppState): AppState {
  const ov = after.inlineCommentOverlay
  if (!ov.open) return after
  const was = getInlineCommentOverlayDisplayOrder(before)[before.inlineCommentOverlay.highlightedIndex]
  const order = getInlineCommentOverlayDisplayOrder(after)
  const highlightedIndex = Math.min(ov.highlightedIndex, Math.max(0, order.length - 1))
  const peekShown = ov.codePeekId === null || getInlineCommentOverlayComments(after).some((c) => c.id === ov.codePeekId)
  if (order[highlightedIndex]?.id === was?.id && peekShown) {
    return highlightedIndex === ov.highlightedIndex
      ? after
      : { ...after, inlineCommentOverlay: { ...ov, highlightedIndex } }
  }
  return settleInlineCommentOverlayHighlight(after, highlightedIndex)
}

/** Puts the highlight at `highlightedIndex` and drops a peek on a comment it no longer shows. */
function settleInlineCommentOverlayHighlight(state: AppState, highlightedIndex: number): AppState {
  const ov = state.inlineCommentOverlay
  const shown = getInlineCommentOverlayComments(state)
  const codePeekId = ov.codePeekId !== null && shown.some((c) => c.id === ov.codePeekId)
    ? ov.codePeekId
    : null
  return {
    ...state,
    inlineCommentOverlay: { ...ov, highlightedIndex, codePeekId },
  }
}

/**
 * Keep `filename` in the tree while viewed files are hidden. The highlight
 * stays on the path it was on, so a row coming or going above it never
 * moves it onto a neighbour; when that path itself is gone it clamps.
 */
export function keepTreeFile(state: AppState, filename: string | null): AppState {
  if (state.treeKeptFile === filename) return state
  return withTreeHighlightKept(state, { ...state, treeKeptFile: filename })
}

/** Hide viewed files from the tree, or show them again, keeping `readerFile` and the highlight's row. */
export function toggleTreeUnviewedOnly(state: AppState, readerFile: string | null): AppState {
  const treeUnviewedOnly = !state.treeUnviewedOnly
  return withTreeHighlightKept(state, {
    ...state,
    treeUnviewedOnly,
    treeKeptFile: treeUnviewedOnly ? readerFile : null,
  })
}

function withTreeHighlightKept(before: AppState, after: AppState): AppState {
  const path = treeRowsOf(before)[before.treeHighlightIndex]?.node.path
  const rows = treeRowsOf(after)
  const found = path === undefined ? -1 : rows.findIndex((item) => item.node.path === path)
  const treeHighlightIndex = found >= 0 ? found : Math.max(0, Math.min(before.treeHighlightIndex, rows.length - 1))
  return treeHighlightIndex === after.treeHighlightIndex ? after : { ...after, treeHighlightIndex }
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

/**
 * Set the viewing commit and swap files/fileTree accordingly.
 * When switching to a specific commit, files/fileTree come from its cached diff.
 * When switching to null (all commits), restore allFiles/allFileTree.
 */
export function setViewingCommit(
  state: AppState,
  commitSha: string | null,
  scope: readonly string[] | null | undefined,
  cached: CommitDiff | null,
): AppState {
  if (commitSha === null) {
    // Restore full PR diff
    return {
      ...state,
      viewingCommit: null,
      viewingCommitScope: null,
      files: state.allFiles,
      fileTree: state.allFileTree,
      selectedFileIndex: null,
    }
  }

  // Switch to a specific commit's diff
  if (!cached) return state  // Should not happen — caller caches first

  return {
    ...state,
    viewingCommit: commitSha,
    viewingCommitScope: scope && scope.length > 1 ? [...scope] : null,
    files: cached.files,
    fileTree: cached.fileTree,
    selectedFileIndex: null,
  }
}

// ============================================================================
// Reactions (spec 042)
// ============================================================================

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
      // enough — the thread panel's reaction row re-renders from the same source.
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
