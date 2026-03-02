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
  
  // GitHub
  {
    id: "submit-review",
    label: "Submit Review",
    description: "Submit all local comments as a review",
    shortcut: "gS",
    category: "github",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => c.status === "local" && !c.inReplyTo),
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
    id: "create-pr",
    label: "Create Pull Request",
    description: "Create a new PR from current changes",
    shortcut: "gP",
    category: "github",
    available: (state) => state.appMode === "local",
  },
  {
    id: "refresh",
    label: "Refresh",
    description: "Reload data from GitHub",
    shortcut: "gr",
    category: "github",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "open-in-browser",
    label: "Open in Browser",
    description: "Open PR in web browser",
    shortcut: "go",
    category: "github",
    available: (state) => state.appMode === "pr",
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
  
  // General
  {
    id: "quit",
    label: "Quit",
    description: "Exit riff",
    shortcut: "q",
    category: "general",
    available: () => true,
  },
]

/**
 * Get actions available in current state
 */
export function getAvailableActions(state: AppState): Action[] {
  return actions.filter(a => a.available(state))
}
