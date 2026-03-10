/**
 * PR Info Panel Feature
 *
 * Provides the PR information panel functionality.
 * - Displays PR title, description, commits, reviews
 * - Keyboard navigation for commits
 * - Copy commit SHA or PR URL
 * - Open PR in browser
 */

export { handleInput, type PRInfoPanelInputContext } from "./input"

// Re-export state operations that callers might need
export { openPRInfoPanel, closePRInfoPanel } from "../../state"
