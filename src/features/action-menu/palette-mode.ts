import type { AppState } from "../../state"
import type { VimCursorState } from "../../vim-diff/types"
import { getAvailableActions } from "../../actions"
import { submenuOpenedFromPalette, type ActionFocus } from "../../actions/types"
import { fuzzyFilter } from "../../utils/fuzzy"
import type { ActionMenuMode } from "../../components/action-menu-model"
import { getSubmenuRows } from "./submenu"
import type { ActionMenuSnapshot } from "./state"

/**
 * What the palette lists: the available actions matching the query, or the
 * open submenu's rows in their place. Drawing and key handling both read it,
 * so the row Enter acts on is the row on screen.
 */
export function paletteMode(
  state: AppState,
  vimState: VimCursorState,
  { submenu, query }: Pick<ActionMenuSnapshot, "submenu" | "query">,
  focus: ActionFocus,
): ActionMenuMode {
  if (submenu) {
    return {
      kind: "submenu",
      title: submenu.title,
      // A list of links can do two things with the one you pick, and
      // only one of them is Enter — which one depends on the key that
      // opened the list (spec 077).
      hint:
        submenu.kind === "links"
          ? submenu.action === "copy"
            ? "enter copy · esc"
            : "enter open · ctrl-y copy · esc"
          : submenuOpenedFromPalette(submenu)
            ? undefined
            : "esc",
      rows: getSubmenuRows(state, { submenu, query }),
    }
  }
  const available = getAvailableActions(state, vimState, focus)
  return {
    kind: "actions",
    actions: query ? fuzzyFilter(query, available, (a) => [a.label, a.id, a.description]) : available,
  }
}
