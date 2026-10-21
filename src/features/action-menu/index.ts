/**
 * Action Menu Feature
 *
 * Provides the command palette / action menu functionality.
 * - Fuzzy search over available actions
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - Action execution
 */

export { executeAction, openReactSubmenu, type ActionHandlers, type ExecuteContext } from "./execute"
export { getSubmenuRows, reactionContentFromRowId } from "./submenu"
export { paletteMode } from "./palette-mode"

// Re-export state operations that callers might need
export { openActionMenu, closeActionMenu } from "../../state"
