import type { Action } from "./types"
import type { AppState } from "../state"

/**
 * All available actions in the app.
 * The handler is not stored here - it's looked up by ID in app.ts
 */
export const actions: Action[] = [
  {
    id: "submit-review",
    label: "Submit Review",
    description: "Submit all local comments as a review",
    shortcut: "gS",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => c.status === "local"),
  },
  {
    id: "submit-comment",
    label: "Submit Comment",
    description: "Post current comment immediately",
    shortcut: "S",
    available: (state) => 
      state.appMode === "pr" && 
      state.comments.some(c => c.status === "local"),
  },
  {
    id: "create-pr",
    label: "Create Pull Request",
    description: "Create a new PR from current changes",
    shortcut: "gP",
    available: (state) => state.appMode === "local",
  },
  {
    id: "refresh",
    label: "Refresh",
    description: "Reload data from GitHub",
    shortcut: "gr",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "open-in-browser",
    label: "Open in Browser",
    description: "Open PR in web browser",
    shortcut: "go",
    available: (state) => state.appMode === "pr",
  },
  {
    id: "toggle-file-panel",
    label: "Toggle File Panel",
    description: "Show or hide the file tree",
    shortcut: "Ctrl+b",
    available: () => true,
  },
  {
    id: "toggle-view",
    label: "Toggle View",
    description: "Switch between diff and comments view",
    shortcut: "Tab",
    available: () => true,
  },
  {
    id: "quit",
    label: "Quit",
    description: "Exit neoriff",
    shortcut: "q",
    available: () => true,
  },
]

/**
 * Get actions available in current state
 */
export function getAvailableActions(state: AppState): Action[] {
  return actions.filter(a => a.available(state))
}
