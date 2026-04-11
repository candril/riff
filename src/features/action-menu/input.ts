/**
 * Action menu input handling.
 *
 * The action menu captures all input when open. It provides fuzzy search
 * over available actions and executes the selected action on Enter.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import {
  closeActionMenu,
  setActionMenuQuery,
  moveActionMenuSelection,
} from "../../state"
import { getAvailableActions } from "../../actions"
import { getVisualActionOrder } from "../../components"
import { fuzzyFilter } from "../../utils/fuzzy"

export interface ActionMenuInputContext {
  readonly state: AppState
  getVimState: () => VimCursorState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  executeAction: (actionId: string) => void
}

/**
 * Handle input when action menu is open.
 * Returns true if the key was handled (menu is open), false otherwise.
 */
export function handleInput(
  key: KeyEvent,
  ctx: ActionMenuInputContext
): boolean {
  if (!ctx.state.actionMenu.open) {
    return false
  }

  const availableActions = getAvailableActions(ctx.state, ctx.getVimState())
  const filteredActions = ctx.state.actionMenu.query
    ? fuzzyFilter(ctx.state.actionMenu.query, availableActions, (a) => [
        a.label,
        a.id,
        a.description,
      ])
    : availableActions

  // Get actions in visual order (grouped by category)
  const visualActions = getVisualActionOrder(filteredActions)

  switch (key.name) {
    case "escape":
      ctx.setState(closeActionMenu)
      ctx.render()
      return true

    case "return":
    case "enter": {
      const selectedAction = visualActions[ctx.state.actionMenu.selectedIndex]
      if (selectedAction) {
        ctx.setState(closeActionMenu)
        ctx.render()
        ctx.executeAction(selectedAction.id)
      }
      return true
    }

    case "up":
      ctx.setState((s) => moveActionMenuSelection(s, -1, visualActions.length - 1))
      ctx.render()
      return true

    case "down":
      ctx.setState((s) => moveActionMenuSelection(s, 1, visualActions.length - 1))
      ctx.render()
      return true

    case "p":
      // Ctrl+p moves up
      if (key.ctrl) {
        ctx.setState((s) => moveActionMenuSelection(s, -1, visualActions.length - 1))
        ctx.render()
        return true
      }
      // Otherwise type 'p'
      ctx.setState((s) => setActionMenuQuery(s, s.actionMenu.query + "p"))
      ctx.render()
      return true

    case "n":
      // Ctrl+n moves down
      if (key.ctrl) {
        ctx.setState((s) => moveActionMenuSelection(s, 1, visualActions.length - 1))
        ctx.render()
        return true
      }
      // Otherwise type 'n'
      ctx.setState((s) => setActionMenuQuery(s, s.actionMenu.query + "n"))
      ctx.render()
      return true

    case "backspace":
      if (ctx.state.actionMenu.query.length > 0) {
        ctx.setState((s) => setActionMenuQuery(s, s.actionMenu.query.slice(0, -1)))
        ctx.render()
      }
      return true

    default:
      // Type characters into search
      if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        ctx.setState((s) => setActionMenuQuery(s, s.actionMenu.query + key.sequence))
        ctx.render()
      }
      // Capture all keys when menu is open
      return true
  }
}
