import type { AppState } from "../state"
import type { VimCursorState } from "../vim-diff/types"

/**
 * Action category for grouping in menu
 */
export type ActionCategory = "navigation" | "github" | "view" | "general" | "external" | "claude"

/**
 * An action that can be executed from the action menu.
 */
export interface Action {
  /** Unique identifier */
  id: string
  /** Display label. May be a function for actions whose title depends on
   *  current state (e.g. "Review selection" vs "Review folder" vs "Review file"). */
  label: string | ((state: AppState, vimState?: VimCursorState) => string)
  /** Short description */
  description: string
  /** Keyboard shortcut hint (display only) */
  shortcut?: string
  /** Category for grouping */
  category?: ActionCategory
  /** Check if action is available in current state.
   *  `vimState` is optional — most actions only need AppState. AI review
   *  actions peek at it to distinguish selection vs file vs folder scopes. */
  available: (state: AppState, vimState?: VimCursorState) => boolean
}

/**
 * An action with its label already resolved to a string. This is what
 * `getAvailableActions` returns — rendering code doesn't need to care about
 * the function-label form.
 */
export type ResolvedAction = Omit<Action, "label"> & { label: string }

/**
 * Resolve an action's label to a string. Actions may declare their label
 * as a function of state for context-aware titles; this helper is the single
 * place we convert it to the string used by the palette renderer and fuzzy
 * filter.
 */
export function resolveActionLabel(
  action: Action,
  state: AppState,
  vimState?: VimCursorState,
): string {
  return typeof action.label === "function" ? action.label(state, vimState) : action.label
}

/**
 * Action menu state
 */
export interface ActionMenuState {
  /** Whether the menu is open */
  open: boolean
  /** Current search query */
  query: string
  /** Currently selected index */
  selectedIndex: number
}

/**
 * Create initial action menu state
 */
export function createActionMenuState(): ActionMenuState {
  return {
    open: false,
    query: "",
    selectedIndex: 0,
  }
}
