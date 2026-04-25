import type { Action, ResolvedAction } from "./types"
import { resolveActionLabel } from "./types"
import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"
import { detectReviewScope } from "../features/ai-review"

/**
 * All available actions in the app.
 * The handler is not stored here - it's looked up by ID in app.ts.
 * This is the single source of truth for all keybindings (shown in Ctrl+p).
 */
export const actions: Action[] = [
  // Navigation
  {
    id: "find-files",
    label: "Find Files",
    description: "Jump to a file in the diff",
    shortcut: "Ctrl+f",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "find-comments",
    label: "Find Comments",
    description: "Search all comments in the diff (PR-wide)",
    shortcut: "gC",
    category: "navigation",
    available: (state) => state.comments.length > 0,
  },
  {
    id: "next-file",
    label: "Next File",
    description: "Jump to next file",
    shortcut: "]f",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-file",
    label: "Previous File",
    description: "Jump to previous file",
    shortcut: "[f",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-hunk",
    label: "Next Hunk",
    description: "Jump to next change hunk",
    shortcut: "]c",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-hunk",
    label: "Previous Hunk",
    description: "Jump to previous change hunk",
    shortcut: "[c",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-unviewed",
    label: "Next Unviewed File",
    description: "Jump to next unviewed file",
    shortcut: "]u",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "prev-unviewed",
    label: "Previous Unviewed File",
    description: "Jump to previous unviewed file",
    shortcut: "[u",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "next-outdated",
    label: "Next Outdated File",
    description: "Jump to next outdated file",
    shortcut: "]o",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "prev-outdated",
    label: "Previous Outdated File",
    description: "Jump to previous outdated file",
    shortcut: "[o",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "next-commit",
    label: "Next Commit",
    description: "View next commit's diff",
    shortcut: "]g",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "prev-commit",
    label: "Previous Commit",
    description: "View previous commit's diff",
    shortcut: "[g",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "select-commit",
    label: "Select Commit",
    description: "Filter diff to a single commit's changes",
    category: "navigation",
    available: (state) => state.commits.length > 0,
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
    id: "open-in-editor",
    label: "Open in Editor",
    description: "Open current file in $EDITOR",
    shortcut: "gf",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "checkout-and-edit",
    label: "Checkout & Edit",
    description: "Checkout PR branch and open file in $EDITOR",
    shortcut: "gc",
    category: "navigation",
    available: (state) => state.appMode === "pr" && state.files.length > 0,
  },
  {
    id: "search-diff",
    label: "Search in Diff",
    description: "Search text in the diff view",
    shortcut: "/",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "search-diff-backward",
    label: "Search Backward",
    description: "Search text backward in the diff view",
    shortcut: "?",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "search-word",
    label: "Search Word Under Cursor",
    description: "Search for the word under the cursor",
    shortcut: "*",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "jump-back",
    label: "Jump Back",
    description: "Go to previous location in jump list",
    shortcut: "Ctrl+o",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },
  {
    id: "jump-forward",
    label: "Jump Forward",
    description: "Go to next location in jump list",
    shortcut: "Ctrl+i",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },

  // Diff actions
  {
    id: "add-comment",
    label: "Add Comment",
    description: "Add a comment on the current line",
    shortcut: "c",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "visual-select",
    label: "Visual Line Select",
    description: "Select lines for multi-line comment",
    shortcut: "V",
    category: "navigation",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "mark-viewed",
    label: "Mark File Viewed",
    description: "Toggle file as viewed and advance to next",
    shortcut: "v",
    category: "navigation",
    available: (state) => state.files.length > 0,
  },

  // Folds
  {
    id: "toggle-fold",
    label: "Toggle Fold",
    description: "Toggle fold at cursor (file header or hunk)",
    shortcut: "za",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "open-fold",
    label: "Open Fold",
    description: "Open fold at cursor",
    shortcut: "zo",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "close-fold",
    label: "Close Fold",
    description: "Close fold at cursor",
    shortcut: "zc",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "expand-all-folds",
    label: "Expand All Folds",
    description: "Open all folds",
    shortcut: "zR",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },
  {
    id: "collapse-all-folds",
    label: "Collapse All Folds",
    description: "Close all folds",
    shortcut: "zM",
    category: "view",
    available: (state) => state.viewMode === "diff" && state.files.length > 0,
  },

  // GitHub
  {
    id: "submit-review",
    label: "Submit Review",
    description: "Submit review (approve, request changes, or comment)",
    shortcut: "gS",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "sync-changes",
    label: "Sync Changes",
    description: "Sync local comments, edits, and replies to GitHub",
    shortcut: "gs",
    category: "github",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => 
        (c.status === "synced" && c.localEdit) ||
        (c.status === "local" && c.inReplyTo && state.comments.find(p => p.id === c.inReplyTo)?.githubId) ||
        (c.status === "local" && !c.inReplyTo)
      ),
  },
  {
    id: "submit-comment",
    label: "Submit Comment",
    description: "Post current comment immediately",
    shortcut: "S",
    category: "github",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => c.status === "local"),
  },
  {
    id: "delete-comment",
    label: "Delete Comment",
    description: "Delete the selected comment",
    shortcut: "d",
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
    id: "create-pr",
    label: "Create Pull Request",
    description: "Create a new PR from current changes",
    shortcut: "gP",
    category: "github",
    available: (state) => state.appMode === "local",
  },
  {
    id: "edit-pr",
    label: "Edit PR Title & Description",
    description: "Edit PR title and description in $EDITOR with diff context",
    shortcut: "gP",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "open-in-browser",
    label: "Open in Browser",
    description: "Open PR in web browser",
    shortcut: "go",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "pr-info",
    label: "PR Info",
    description: "Show PR details, author, branch info",
    shortcut: "gi",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "copy-pr-url",
    label: "Copy PR URL",
    description: "Copy the PR URL to clipboard",
    shortcut: "gy",
    category: "github",
    available: (state) => state.appMode === "pr" && state.prInfo !== null,
  },
  {
    id: "react",
    label: "React…",
    description: "Add or remove a reaction on the focused comment",
    category: "github",
    available: (state) => state.appMode === "pr" && state.reactionTarget !== null,
  },

  // View
  {
    id: "toggle-view",
    label: "Toggle View",
    description: "Cycle between PR / diff / comments view",
    shortcut: "i",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-file-panel",
    label: "Toggle File Panel",
    description: "Show or hide the file tree",
    shortcut: "Ctrl+b",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-file-panel-expanded",
    label: "Expand File Panel",
    description: "Toggle file panel between normal and full width",
    shortcut: "Ctrl+e",
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
    id: "show-file-path",
    label: "Show File Path",
    description: "Display the current file path",
    shortcut: "Ctrl+g",
    category: "view",
    available: (state) => state.files.length > 0,
  },
  {
    id: "focus-tree",
    label: "Focus File Tree",
    description: "Move focus to the file tree panel",
    shortcut: "Ctrl+h",
    category: "view",
    available: (state) => state.showFilePanel,
  },
  {
    id: "focus-content",
    label: "Focus Content",
    description: "Move focus to the diff or comments panel",
    shortcut: "Ctrl+l",
    category: "view",
    available: (state) => state.showFilePanel,
  },

  // General
  {
    id: "refresh",
    label: "Refresh",
    description: "Reload diff, commits, and comments",
    shortcut: "gr",
    category: "general",
    available: () => true,
  },
  {
    id: "quit",
    label: "Quit",
    description: "Exit riff",
    shortcut: "q",
    category: "general",
    available: () => true,
  },
  
  // Claude
  {
    id: "claude-discuss",
    // Label adapts to current scope: multi > selection > folder > file. The
    // handler dispatches on the same detection.
    label: (state, vimState) => {
      const scope = detectReviewScope(state, vimState)
      switch (scope.kind) {
        case "multi":
          return scope.count === 1
            ? "Claude: Chat about 1 selected file"
            : `Claude: Chat about ${scope.count} selected files`
        case "selection": return "Claude: Chat about selection"
        case "folder":    return "Claude: Chat about folder"
        case "file":      return "Claude: Chat about file"
        case "none":      return "Claude: Chat (nothing to send)"
      }
    },
    description: "Open a Claude Code chat about the active scope (multi-select, selection, folder, or file)",
    category: "claude",
    available: (state, vimState) =>
      state.files.length > 0 && detectReviewScope(state, vimState).kind !== "none",
  },
  {
    id: "claude-discuss-full",
    label: "Claude: Chat about whole diff",
    description: "Open a Claude Code chat about the whole diff (ignored files excluded)",
    category: "claude",
    available: (state) => state.files.length > 0,
  },
  {
    id: "claude-review-drafted-comment",
    label: "Claude: Review drafted comment",
    description: "Open the review dialog for the inline PR comment Claude drafted (gd)",
    shortcut: "gd",
    category: "claude",
    // Gated on the poller having already detected a valid draft. The
    // predicate is just a state read — no disk I/O per menu render.
    available: (state) => state.appMode === "pr" && state.draftNotification !== null,
  },
  {
    id: "claude-discard-drafted-comment",
    label: "Claude: Discard drafted comment",
    description: "Delete Claude's drafted comment and clear the notification (gD)",
    shortcut: "gD",
    category: "claude",
    available: (state) => state.appMode === "pr" && state.draftNotification !== null,
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
  vimState?: VimCursorState,
): ResolvedAction[] {
  return actions
    .filter(a => a.available(state, vimState))
    .map(a => ({ ...a, label: resolveActionLabel(a, state, vimState) }))
}
