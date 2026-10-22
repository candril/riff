/**
 * Action Menu Feature
 *
 * Provides the command palette / action menu functionality.
 * - Fuzzy search over available actions
 * - Keyboard navigation (j/k, up/down, Ctrl+n/p)
 * - Action execution
 */

export { executeAction, reactSubmenu, type ActionHandlers, type ExecuteContext } from "./execute"
export { getSubmenuRows, reactionContentFromRowId } from "./submenu"
export { paletteMode } from "./palette-mode"
export { createActionMenuState, type ActionMenuState, type ActionMenuSnapshot } from "./state"
