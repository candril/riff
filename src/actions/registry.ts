import type { Action } from "./types"
import type { AppState } from "../state"

/**
 * All available actions in the app.
 * The handler is not stored here - it's looked up by ID in app.ts
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
    id: "open-in-editor",
    label: "Open in Editor",
    description: "Open current file in $EDITOR (nvim)",
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
    id: "show-all-files",
    label: "Show All Files",
    description: "Exit single-file view and show all files",
    category: "navigation",
    available: (state) => state.selectedFileIndex !== null,
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
    description: "Sync edits and replies to GitHub",
    shortcut: "gs",
    category: "github",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => 
        // Has local edit to synced comment
        (c.status === "synced" && c.localEdit) ||
        // Or is a local reply to a synced comment
        (c.status === "local" && c.inReplyTo && state.comments.find(p => p.id === c.inReplyTo)?.githubId)
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
    id: "refresh",
    label: "Refresh",
    description: "Reload diff, commits, and comments",
    shortcut: "gr",
    category: "general",
    available: () => true,
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
    id: "select-commit",
    label: "Select Commit",
    description: "Filter diff to a single commit's changes",
    category: "navigation",
    available: (state) => state.commits.length > 0,
  },
  {
    id: "show-file-path",
    label: "Show File Path",
    description: "Display the current file path",
    shortcut: "Ctrl+g",
    category: "view",
    available: (state) => state.files.length > 0,
  },

  // View
  {
    id: "toggle-file-panel",
    label: "Toggle File Panel",
    description: "Show or hide the file tree",
    shortcut: "Ctrl+b",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-view",
    label: "Toggle View",
    description: "Switch between diff and comments view",
    shortcut: "Tab",
    category: "view",
    available: () => true,
  },
  {
    id: "toggle-hidden-files",
    label: "Toggle Hidden Files",
    description: "Show or hide ignored files in file tree",
    category: "view",
    available: (state) => state.ignoredFiles.size > 0,
  },
  
  // General
  {
    id: "help",
    label: "Help",
    description: "Show keyboard shortcuts",
    shortcut: "g?",
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
 * Get actions available in current state
 */
export function getAvailableActions(state: AppState): Action[] {
  return actions.filter(a => a.available(state))
}
