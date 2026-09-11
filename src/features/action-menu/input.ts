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
  moveActionMenuSelection,
} from "../../state"
import { getAvailableActions } from "../../actions"
import { getVisualActionOrder } from "../../components"
import { fuzzyFilter } from "../../utils/fuzzy"
import { getSubmenuRows, reactionContentFromRowId } from "./submenu"
import { submenuOpenedFromPalette, type ActionSubmenu } from "../../actions/types"
import type { LinkTarget } from "../../utils/link-targets"

export interface ActionMenuInputContext {
  readonly state: AppState
  getVimState: () => VimCursorState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  executeAction: (actionId: string) => void
  /** Called when the user presses Enter on a React… submenu row. */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  /** Called when the user picks a link out of the links submenu. */
  onLink: (action: "open" | "copy", link: { label: string; url: string }) => void
}

/** The link a submenu row stands for, or null when the row is not one. */
function linkForRow(submenu: ActionSubmenu, rowId: string): LinkTarget | null {
  if (submenu.kind !== "links") return null
  return submenu.links[Number(rowId.split(":")[1])] ?? null
}

/**
 * Handle input when action menu is open.
 *
 * Only the keys that mean something to the palette are taken; the query
 * itself belongs to the shared prompt field, which sees every key this
 * handler does not `preventDefault` (spec 065).
 *
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

  const consume = (): void => key.preventDefault()

  switch (key.name) {
    case "escape":
      consume()
      if (submenu && submenuOpenedFromPalette(submenu)) {
        ctx.setState(closeActionSubmenu)
      } else {
        ctx.setState(closeActionMenu)
      }
      ctx.render()
      return true

    case "return":
    case "enter": {
      consume()
      if (submenu) {
        const row = submenuRows[ctx.state.actionMenu.selectedIndex]
        if (!row) return true
        if (submenu.kind === "links") {
          const link = linkForRow(submenu, row.id)
          if (!link) return true
          ctx.setState(closeActionMenu)
          ctx.render()
          ctx.onLink(submenu.action, link)
          return true
        }
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

    case "y": {
      // A bare `y` is a letter of the query; Ctrl-y copies the link rather
      // than doing whatever the key that opened the picker meant.
      if (!key.ctrl || !submenu) return true
      const row = submenuRows[ctx.state.actionMenu.selectedIndex]
      const link = row ? linkForRow(submenu, row.id) : null
      if (!link) return true
      consume()
      ctx.setState(closeActionMenu)
      ctx.render()
      ctx.onLink("copy", link)
      return true
    }

    case "up":
      consume()
      ctx.setState((s) => moveActionMenuSelection(s, -1, maxIndex))
      ctx.render()
      return true

    case "down":
      consume()
      ctx.setState((s) => moveActionMenuSelection(s, 1, maxIndex))
      ctx.render()
      return true

    case "p":
      // Ctrl-p moves up; a bare `p` is a letter of the query.
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveActionMenuSelection(s, -1, maxIndex))
        ctx.render()
      }
      return true

    case "n":
      if (key.ctrl) {
        consume()
        ctx.setState((s) => moveActionMenuSelection(s, 1, maxIndex))
        ctx.render()
      }
      return true

    default:
      // Everything else is typing, and belongs to the prompt field.
      return true
  }
}
