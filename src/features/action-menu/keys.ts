/**
 * Command palette keys (specs 020, 042, 065).
 *
 * Only the keys that mean something to the palette are bound; the query
 * belongs to the palette's prompt field, which types every key left
 * unprevented. In a submenu (spec 042) Enter acts on the row rather than
 * running an action, and Esc backs out to the action list when the
 * palette opened the submenu itself.
 */

import type { RiffKeymap } from "../../app/keymap"
import { anyModifiers } from "../../app/key-variants"
import type { AppState } from "../../state"
import { closeActionMenu, closeActionSubmenu, moveActionMenuSelection } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import type { ReactionTarget } from "../../types"
import { getVisualActionOrder } from "../../components/action-menu-model"
import { submenuOpenedFromPalette, type ActionSubmenu } from "../../actions/types"
import type { LinkTarget } from "../../utils/link-targets"
import { reactionContentFromRowId } from "./submenu"
import { paletteMode } from "./palette-mode"

export interface ActionMenuKeyDeps {
  getState: () => AppState
  setState: (updater: (s: AppState) => AppState) => void
  render: () => void
  getVimState: () => VimCursorState
  executeAction: (actionId: string) => void
  /** Enter on a React… submenu row. */
  onToggleReaction: (target: ReactionTarget, rowId: string) => void
  /** A link picked out of the links submenu. */
  onLink: (action: "open" | "copy", link: { label: string; url: string }) => void
}

function linkForRow(submenu: ActionSubmenu, rowId: string): LinkTarget | null {
  if (submenu.kind !== "links") return null
  return submenu.links[Number(rowId.split(":")[1])] ?? null
}

export function registerActionMenuKeys(riffKeymap: RiffKeymap, deps: ActionMenuKeyDeps): () => void {
  // Read at run time, the way the palette draws them, so the row a key
  // acts on is the row on screen.
  const view = () => {
    const state = deps.getState()
    const mode = paletteMode(state, deps.getVimState())
    const submenuRows = mode.kind === "submenu" ? mode.rows : []
    const visualActions = mode.kind === "actions" ? getVisualActionOrder(mode.actions) : []
    const rowCount = state.actionMenu.submenu ? submenuRows.length : visualActions.length
    return {
      submenu: state.actionMenu.submenu,
      selectedIndex: state.actionMenu.selectedIndex,
      submenuRows,
      visualActions,
      maxIndex: Math.max(0, rowCount - 1),
    }
  }

  const close = () => {
    deps.setState(closeActionMenu)
    deps.render()
  }

  const move = (delta: number) => {
    const { maxIndex } = view()
    deps.setState((s) => moveActionMenuSelection(s, delta, maxIndex))
    deps.render()
  }

  const run = () => {
    const { submenu, selectedIndex, submenuRows, visualActions } = view()
    if (submenu) {
      const row = submenuRows[selectedIndex]
      if (!row) return
      if (submenu.kind === "links") {
        const link = linkForRow(submenu, row.id)
        if (!link) return
        close()
        deps.onLink(submenu.action, link)
        return
      }
      if (!reactionContentFromRowId(row.id)) return
      // Closed before the toggle, which owns the optimistic state and the
      // network call.
      close()
      deps.onToggleReaction(submenu.target, row.id)
      return
    }
    const selected = visualActions[selectedIndex]
    if (!selected) return
    // "react" opens a submenu in the palette rather than leaving it (spec
    // 042). executeAction draws on its own.
    if (selected.id !== "react") close()
    deps.executeAction(selected.id)
  }

  const copyLink = () => {
    const { submenu, selectedIndex, submenuRows } = view()
    const row = submenuRows[selectedIndex]
    const link = submenu && row ? linkForRow(submenu, row.id) : null
    // Rejected, the key is left unprevented as the chain left it; the
    // capture still keeps it from the panels behind the palette.
    if (!link) return false
    close()
    deps.onLink("copy", link)
  }

  // No `rest` and no preventDefault: an unbound key is a letter of the
  // query, and the palette's prompt field types it (spec 065).
  const captured = riffKeymap.capture(() => deps.getState().actionMenu.open)
  const unregisterLayer = riffKeymap.keymap.registerLayer({
    enabled: () => captured.holds(),
    commands: [
      {
        name: "actionMenu.close",
        title: "Close the palette, or back out of its submenu",
        category: "Palette",
        palette: false,
        run: () => {
          const { submenu } = view()
          deps.setState(submenu && submenuOpenedFromPalette(submenu) ? closeActionSubmenu : closeActionMenu)
          deps.render()
        },
      },
      {
        name: "actionMenu.run",
        title: "Run the selected action or row",
        category: "Palette",
        palette: false,
        run,
      },
      {
        name: "actionMenu.up",
        title: "Select the previous row",
        category: "Palette",
        palette: false,
        run: () => move(-1),
      },
      {
        name: "actionMenu.down",
        title: "Select the next row",
        category: "Palette",
        palette: false,
        run: () => move(1),
      },
      {
        name: "actionMenu.copyLink",
        title: "Copy the selected link",
        category: "Palette",
        palette: false,
        run: copyLink,
      },
    ],
    bindings: [
      ...anyModifiers("escape", "actionMenu.close"),
      ...anyModifiers("return", "actionMenu.run"),
      // The parser calls the key "return", but the keymap matches an event
      // named "enter" as a different key, and the chain took both.
      ...anyModifiers("enter", "actionMenu.run"),
      ...anyModifiers("up", "actionMenu.up"),
      ...anyModifiers("down", "actionMenu.down"),
      ...anyModifiers("ctrl+p", "actionMenu.up"),
      ...anyModifiers("ctrl+n", "actionMenu.down"),
      ...anyModifiers("ctrl+y", "actionMenu.copyLink"),
    ],
  })
  return () => {
    captured()
    unregisterLayer()
  }
}
