/**
 * Action Menu Feature
 *
 * Provides the command palette / action menu functionality.
 * - Fuzzy search over available actions
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - Action execution
 */

export { handleInput, type ActionMenuInputContext } from "./input"
export { executeAction, type ActionHandlers, type ExecuteContext } from "./execute"
export { getSubmenuRows, reactionContentFromRowId } from "./submenu"

// Re-export state operations that callers might need
export { openActionMenu, closeActionMenu } from "../../state"
