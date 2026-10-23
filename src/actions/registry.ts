import type { Action, ActionFocus, ResolvedAction } from "./types"
import { resolveActionLabel } from "./types"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { detectPermalinkScope } from "../features/permalink"
import { publishableLocalComments } from "../utils/publishable"
import { isVisualMode } from "../vim-diff/cursor-state"

/**
 * All available actions in the app.
 * The handler is not stored here - it's looked up by ID in app.ts.
 * The key Ctrl+p shows beside an action is its command's `keys`, read off
 * the keymap, or its own `shortcut` where no command spells one. An action
 * the executor has no case for runs its command on that key.
 */
export const actions: Action[] = [
  // Navigation
  {
    id: "find-files",
    label: "Find Files",
    description: "Jump to a file in the diff",
    command: "global.filePicker",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "find-comments",
    label: "Find Comments",
    description: "Search all comments in the diff (PR-wide)",
    command: "gchord.openCommentsPicker",
    category: "navigation",
    available: (state) => state.comments.length > 0,
  },
  {
    id: "find-marks",
    label: "Marks",
    description: "Every mark, with its file, line and text",
    command: "global.marksPicker",
    category: "navigation",
    available: () => true,
  },
  {
    id: "find-occurrences",
    label: "Find in Diff",
    description: "Every row of the change set that matches, grouped by file",
    command: "global.occurrencesOrFlash",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-file",
    label: "Next File",
    description: "Jump to next file",
    command: "bracket.nextFile",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-file",
    label: "Previous File",
    description: "Jump to previous file",
    command: "bracket.prevFile",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-hunk",
    label: "Next Hunk",
    description: "Jump to next change hunk",
    command: "bracket.nextHunk",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-hunk",
    label: "Previous Hunk",
    description: "Jump to previous change hunk",
    command: "bracket.prevHunk",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-unviewed",
    label: "Next Unviewed File",
    description: "Jump to next unviewed file",
    command: "bracket.nextUnviewed",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-unviewed",
    label: "Previous Unviewed File",
    description: "Jump to previous unviewed file",
    command: "bracket.prevUnviewed",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-outdated",
    label: "Next Outdated File",
    description: "Jump to next outdated file",
    command: "bracket.nextOutdated",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "prev-outdated",
    label: "Previous Outdated File",
    description: "Jump to previous outdated file",
    command: "bracket.prevOutdated",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "next-commit",
    label: "Next Commit",
    description: "View next commit's diff",
    command: "bracket.nextCommit",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "prev-commit",
    label: "Previous Commit",
    description: "View previous commit's diff",
    command: "bracket.prevCommit",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "select-commit",
    label: "Select Commit",
    command: "global.commitsOrBottom",
    description: "Filter diff to a single commit's changes",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "open-file-alone",
    label: "Open File Alone",
    description: "Review only the file at the cursor, without the rest of the diff",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.selectedFileIndex === null && state.files.length > 0,
  },
  {
    id: "show-all-files",
    label: "Show All Files",
    description: "Exit single-file view and show all files",
    shortcut: "Esc",
    category: "navigation",
    available: (state) => state.selectedFileIndex !== null,
  },
  {
    id: "diff-in-editor",
    label: "Diff File in $EDITOR",
    description: "Both versions of this file, side by side",
    command: "gchord.diffInEditor",
    category: "external",
    available: (state) => state.files.length > 0,
  },
  {
    id: "diff-in-tmux-pane",
    label: "Diff File in a tmux Pane",
    description: "The same, beside riff rather than over it",
    command: "gchord.diffInTmuxWindow",
    category: "external",
    available: (state) => state.files.length > 0,
  },
  {
    id: "open-in-editor",
    label: "Open in Editor",
    description: "Open current file in $EDITOR",
    command: "gchord.openInEditor",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "open-in-tmux-window",
    label: "Open in Editor (tmux window)",
    description: "Open current file in $EDITOR in a new tmux window, keeping riff running",
    command: "gchord.openInTmuxWindow",
    category: "navigation",
    available: (state) => state.files.length > 0 && Boolean(process.env.TMUX),
  },
  {
    id: "follow-link",
    label: "Follow Link",
    description:
      "Go to the file the link under the cursor points at — inside riff when the diff has it, otherwise in $EDITOR",
    command: "gchord.followLink",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "open-url",
    label: "Open URL",
    description: "Open the URL under the cursor in a browser",
    command: "gchord.followUrl",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "checkout-and-edit",
    label: "Checkout & Edit",
    description: "Checkout PR branch and open file in $EDITOR",
    command: "gchord.checkoutAndEdit",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "search-diff",
    label: "Search in Diff",
    description: "Search text in the diff view",
    command: "diff.key",
    shortcut: "/",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "search-diff-backward",
    label: "Search Backward",
    description: "Search text backward in the diff view",
    command: "diff.key",
    shortcut: "?",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "search-word",
    label: "Search Word Under Cursor",
    description: "Search for the word under the cursor",
    command: "diff.key",
    shortcut: "*",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "jump-back",
    label: "Jump Back",
    description: "Go to previous location in jump list",
    command: "global.back",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "jump-forward",
    label: "Jump Forward",
    description: "Go to next location in jump list",
    command: "global.forward",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },

  // Diff actions
  {
    id: "add-comment",
    label: "Add Comment",
    description: "Add a comment on the current line",
    command: "diff.key",
    shortcut: "c",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "visual-select",
    label: "Visual Line Select",
    description: "Select whole lines — for a multi-line comment, a permalink or a yank",
    command: "diff.key",
    shortcut: "V",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "visual-select-char",
    label: "Visual Select",
    description:
      "Select by character. `i`/`a` then w, \", (, {, [, h (hunk), f (file) or +/- take a text object",
    command: "diff.key",
    shortcut: "v",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "yank",
    label: (state, vimState) =>
      vimState && isVisualMode(vimState) ? "Yank Selection" : "Yank Line",
    description: "Copy the selection (or cursor line) to the clipboard, without the +/- gutter",
    shortcut: "y",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "yank-raw",
    label: (state, vimState) =>
      vimState && isVisualMode(vimState)
        ? "Yank Selection (with diff markers)"
        : "Yank Line (with diff markers)",
    description: "Copy the selection (or cursor line) keeping the +/- gutter",
    shortcut: "Y",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "mark-viewed",
    label: "Mark File Viewed",
    description: "Toggle file as viewed and advance to next",
    command: "diff.key",
    shortcut: "x",
    category: "navigation",
    // The diff's `x`: the overview binds its own, which resolves a thread.
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },

  // Context expansion
  {
    id: "expand-context",
    label: "Expand Context",
    description: "Reveal the unchanged lines hidden behind the divider at the cursor (they can then be commented on)",
    shortcut: "Enter",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },

  {
    id: "toggle-wrap",
    label: "Toggle Line Wrap",
    description: "Soft-wrap long lines instead of scrolling sideways",
    command: "zchord.toggleWrap",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "toggle-split",
    label: "Toggle Side by Side",
    description: "Show the old file beside the new, where the diff pane is 120 columns or wider",
    shortcut: "\\",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "peek-line",
    label: "Peek Line",
    description: "Show the line in full over the diff — or the table it belongs to, as a grid",
    command: "gchord.toggleLinePeek",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },

  // Folds
  {
    id: "toggle-fold",
    label: "Toggle Fold",
    description: "Toggle fold at cursor (file header or hunk)",
    command: "zchord.toggleFold",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "open-fold",
    label: "Open Fold",
    description: "Open fold at cursor",
    command: "zchord.openFold",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "close-fold",
    label: "Close Fold",
    description: "Close fold at cursor",
    command: "zchord.closeFold",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "expand-all-folds",
    label: "Expand All Folds",
    description: "Open all folds",
    command: "zchord.expandAllFolds",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "collapse-all-folds",
    label: "Collapse All Folds",
    description: "Close all folds",
    command: "zchord.collapseAllFolds",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },

  // GitHub
  {
    id: "submit-review",
    label: "Submit Review",
    description: "Submit review (approve, request changes, or comment)",
    command: "gchord.openReviewPreview",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "sync-changes",
    label: "Sync Changes",
    description: "Sync local comments, edits, and replies to GitHub",
    command: "gchord.openSyncPreview",
    category: "github",
    available: (state) =>
      state.appMode === "pr" &&
      (state.comments.some((c) => c.status === "synced" && c.localEdit) ||
        publishableLocalComments(state.comments).length > 0),
  },
  {
    id: "submit-comment",
    label: "Submit Comment",
    description: "Post current comment immediately",
    command: "threadPanel.submit",
    category: "github",
    available: (state) =>
      state.appMode === "pr" && publishableLocalComments(state.comments).length > 0,
  },
  {
    id: "delete-comment",
    label: "Delete Comment",
    description: "Delete the selected comment",
    command: "threadPanel.delete",
    category: "github",
    available: (state) => state.comments.length > 0,
  },
  {
    id: "add-pr-comment",
    label: "Add PR Comment",
    description: "Post a conversation comment on the PR (not tied to code)",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "open-branch-pr",
    label: (state) =>
      state.branchPr ? `Review PR #${state.branchPr.number}` : "Review this branch's PR",
    description: "Reopen riff on the pull request this branch already has",
    category: "github",
    available: (state) => state.appMode === "local" && state.branchPr !== null,
  },
  {
    id: "create-pr",
    label: "Create Pull Request",
    description: "Create a new PR from current changes",
    command: "gchord.editOrCreatePr",
    category: "github",
    // A branch that already has one has nothing to create.
    available: (state) => state.appMode === "local" && state.branchPr === null,
  },
  {
    id: "edit-pr",
    label: "Edit PR Title & Description",
    description: "Edit PR title and description in $EDITOR with diff context",
    command: "gchord.editOrCreatePr",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "open-in-browser",
    label: "Open in Browser",
    description: "Open PR in web browser",
    shortcut: "go",
    category: "github",
    available: (state) => state.appMode === "pr" || state.branchPr !== null,
  },
  {
    id: "open-in-board",
    label: "Open in riff board",
    description: "Open the PR in riff board",
    command: "gchord.openInBoard",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "pr-info",
    label: "PR Info",
    description: "Show PR details, author, branch info",
    command: "gchord.openPrInfo",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "copy-pr-url",
    label: "Copy PR URL",
    description: "Copy the PR URL to clipboard",
    command: "gchord.copyPrUrl",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "copy-permalink",
    // Label names the scope the link will cover.
    label: (state, vimState) => {
      switch (detectPermalinkScope(state, vimState)) {
        case "selection": return "Copy Permalink (selection)"
        case "line":      return "Copy Permalink (current line)"
        case "file":      return "Copy Permalink (file)"
      }
    },
    description: "Copy a GitHub link to the selection, current line, or file, pinned to the branch",
    command: "gchord.copyPermalink",
    category: "github",
    available: (state) => state.files.length > 0,
  },
  {
    id: "copy-comment-link",
    label: "Copy Comment Link",
    description: "Copy a GitHub link to the focused comment or thread",
    command: "threadPanel.copyLink",
    category: "github",
    available: (state, _vimState, focus) =>
      state.appMode === "pr" &&
      state.prInfo !== null &&
      (focus?.reactionTarget != null || state.comments.some((c) => c.githubId)),
  },
  {
    id: "copy-pr-diff-link",
    // The diff view has no range anchor, so a selection and a cursor line
    // both land on a single row — the label says line either way.
    label: (state, vimState) =>
      detectPermalinkScope(state, vimState) === "file"
        ? "Copy PR Diff Link (file)"
        : "Copy PR Diff Link (line)",
    description: "Copy a link to this change in the PR's Files-changed view",
    category: "github",
    available: (state) =>
      state.appMode === "pr" && state.prInfo !== null && state.files.length > 0,
  },
  {
    id: "copy-file-permalink",
    label: "Copy Permalink (whole file)",
    description: "Copy a GitHub link to the current file, without a line anchor",
    category: "github",
    available: (state) => state.files.length > 0,
  },
  {
    id: "react",
    label: "React…",
    description: "Add or remove a reaction on the focused comment",
    command: "threadPanel.react",
    category: "github",
    available: (state, _vimState, focus) => state.appMode === "pr" && focus?.reactionTarget != null,
  },

  {
    id: "filter-view",
    label: "Filter",
    description: "Narrow the list that has focus",
    shortcut: "/",
    category: "navigation",
    available: () => true,
  },

  // View
  {
    id: "toggle-view",
    label: "Toggle View",
    description: "Switch between the PR state and the diff",
    shortcut: "i",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-file-panel",
    label: "Toggle File Panel",
    description: "Show or hide the file tree",
    command: "global.toggleTree",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-file-panel-expanded",
    label: "Expand File Panel",
    description: "Toggle file panel between normal and full width",
    command: "global.expandTreeOrEdit",
    category: "view",
    available: (state) => state.showFilePanel,
  },
  {
    id: "toggle-hidden-files",
    label: "Toggle Hidden Files",
    description: "Show or hide ignored files in file tree",
    category: "view",
    available: (state) => state.ignoredFiles.size > 0,
  },
  {
    id: "toggle-open-threads-only",
    label: "Show Only Open Threads",
    description: "Hide resolved and outdated threads in the comments panel",
    command: "threadPanel.openOnly",
    category: "view",
    available: (state) => state.comments.length > 0,
  },
  {
    id: "toggle-unviewed-files-only",
    label: "Show Only Unviewed Files",
    description: "Hide viewed files in the file panel",
    shortcut: "H (file panel)",
    category: "view",
    available: (state) => state.files.length > 0,
  },
  {
    id: "show-file-path",
    label: "Show File Path",
    description: "Display the current file path",
    category: "view",
    available: (state) => state.files.length > 0,
  },
  {
    id: "focus-tree",
    label: "Focus File Tree",
    description: "Move focus to the file tree panel",
    command: "global.backspace",
    category: "view",
    available: (state) => state.showFilePanel,
  },
  {
    id: "focus-content",
    label: "Focus Content",
    description: "Move focus to the diff or comments panel",
    command: "global.right",
    category: "view",
    available: (state) => state.showFilePanel,
  },

  // General
  {
    id: "refresh",
    label: "Refresh",
    description: "Reload diff, commits, and comments",
    command: "gchord.refresh",
    category: "general",
    available: () => true,
  },
  {
    id: "quit",
    label: "Quit",
    description: "Exit riff",
    command: "global.quit",
    category: "general",
    available: () => true,
  },
  
  // Local review housekeeping (spec 049)
  {
    id: "clear-local-comments",
    label: "Clear Local Comments",
    description: "Delete every local (never published) comment for this review, resolved or not",
    category: "general",
    available: (state) => state.comments.some((c) => c.status === "local"),
  },

  // External tools
  {
    id: "diff-difftastic",
    label: "Diff: difftastic",
    description: "View file diff with difftastic",
    category: "external",
    available: (state) => state.files.length > 0,
  },
  {
    id: "diff-delta",
    label: "Diff: delta",
    description: "View file diff with delta",
    category: "external",
    available: (state) => state.files.length > 0,
  },
  {
    id: "diff-nvim",
    label: "Diff: nvim",
    description: "View file diff in neovim diff mode",
    category: "external",
    available: (state) => state.files.length > 0,
  },
]

/**
 * Get actions available in current state, with labels resolved to strings.
 * Callers (palette render, fuzzy filter) can treat the result as plain data.
 */
export function getAvailableActions(
  state: AppState,
  vimState: VimCursorState | undefined,
  focus: ActionFocus,
): ResolvedAction[] {
  return actions
    .filter(a => a.available(state, vimState, focus))
    .map(a => ({ ...a, label: resolveActionLabel(a, state, vimState) }))
}
