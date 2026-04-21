/**
 * Action menu input handling.
 *
 * The action menu captures all input when open. It provides fuzzy search
 * over available actions and executes the selected action on Enter.
 *
 * When a submenu is active (spec 042), Enter no longer fires executeAction
 * — it invokes `ctx.onSubmenuSelect`, and `Esc` backs out to the main
 * action list without closing the palette.
 */

import type { KeyEvent } from "@opentui/core"
import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { ReactionTarget } from "../../types"
import {
  closeActionMenu,
  closeActionSubmenu,
  setActionMenuQuery,
  moveActionMenuSelection,
} from "../../state"
import { getAvailableActions } from "../../actions"
import { getVisualActionOrder } from "../../components"
import { fuzzyFilter } from "../../utils/fuzzy"
import { getSubmenuRows, reactionContentFromRowId } from "./submenu"

export interface ActionMenuInputContext {
  readonly state: AppState
  getVimState: () => VimCursorState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  executeAction: (actionId: string) => void
  /** Called when the user presses Enter on a React… submenu row. */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
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

  // Two separate view-models: in submenu mode the palette shows flat rows
  // (spec 042); otherwise it shows grouped actions. They share query +
  // navigation key handling but diverge on Enter / Esc.
  const submenu = ctx.state.actionMenu.submenu
  const submenuRows = submenu ? getSubmenuRows(ctx.state) : []

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

  const maxIndex = submenu
    ? Math.max(0, submenuRows.length - 1)
    : Math.max(0, visualActions.length - 1)

  switch (key.name) {
    case "escape":
      if (submenu) {
        ctx.setState(closeActionSubmenu)
      } else {
        ctx.setState(closeActionMenu)
      }
      ctx.render()
      return true

    case "return":
    case "enter": {
      if (submenu) {
        const row = submenuRows[ctx.state.actionMenu.selectedIndex]
        if (!row) return true
        if (submenu.kind === "react") {
          const content = reactionContentFromRowId(row.id)
          if (!content) return true
          // Close the palette first, then fire the toggle. The toggle
          // handler is responsible for optimistic state + network.
          ctx.setState(closeActionMenu)
          ctx.render()
          ctx.onToggleReaction(submenu.target, row.id)
        }
        return true
      }
      const selectedAction = visualActions[ctx.state.actionMenu.selectedIndex]
      if (selectedAction) {
        // The "react" action opens a submenu rather than closing the
        // palette (spec 042). Submenu openers stay open; everything else
        // closes first, then runs. executeAction itself re-renders.
        const isSubmenuOpener = selectedAction.id === "react"
        if (!isSubmenuOpener) {
          ctx.setState(closeActionMenu)
          ctx.render()
        }
        ctx.executeAction(selectedAction.id)
      }
      return true
    }

    case "up":
      ctx.setState((s) => moveActionMenuSelection(s, -1, maxIndex))
      ctx.render()
      return true

    case "down":
      ctx.setState((s) => moveActionMenuSelection(s, 1, maxIndex))
      ctx.render()
      return true

    case "p":
      // Ctrl+p moves up
      if (key.ctrl) {
        ctx.setState((s) => moveActionMenuSelection(s, -1, maxIndex))
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
        ctx.setState((s) => moveActionMenuSelection(s, 1, maxIndex))
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
