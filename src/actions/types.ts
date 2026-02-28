import type { AppState } from "../state"

/**
 * An action that can be executed from the action menu.
 */
export interface Action {
  /** Unique identifier */
  id: string
  /** Display label */
  label: string
  /** Short description */
  description: string
  /** Keyboard shortcut hint (display only) */
  shortcut?: string
  /** Check if action is available in current state */
  available: (state: AppState) => boolean
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
