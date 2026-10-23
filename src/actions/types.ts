import type { AppState } from "../state"
import type { LinkTarget } from "../utils/link-targets"
import type { VimCursorState } from "../vim-diff/types"
import type { ReactionTarget } from "../types"

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
  /**
   * The keymap command that runs this action; the palette shows that
   * command's `keys`, and runs the command on them where no case of the
   * executor's own handles the action.
   */
  command?: string
  /**
   * The palette's hint for a key no keymap command spells: the diff's and
   * the tree's keys, which their handlers parse behind one catch-all
   * binding, `/`, which each list binds for itself, and keys whose command
   * does more, or other, than this action where the action is offered.
   * Beside a `command` only when that command has no `keys` of its own, as
   * the diff's catch-all has none: then it is also the key the command is
   * run on.
   */
  shortcut?: string
  /** Category for grouping */
  category?: ActionCategory
  /** Check if action is available in current state.
   *  `vimState` is optional — most actions only need AppState. */
  available: (state: AppState, vimState?: VimCursorState, focus?: ActionFocus) => boolean
}

/**
 * What has focus that AppState does not hold, asked when the palette opens.
 * One object, so a further read adds a field rather than a parameter.
 */
export interface ActionFocus {
  reactionTarget: ReactionTarget | null
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
 * The key the palette shows beside an action, and runs its command on:
 * the command's `keys`, or the action's own `shortcut` where the command
 * spells none.
 */
export function actionKeys(action: Pick<Action, "command" | "shortcut">, commandKeys: ReadonlyMap<string, string>): string | null {
  return (action.command ? commandKeys.get(action.command) : undefined) ?? action.shortcut ?? null
}

/**
 * Submenu modes that can temporarily replace the action list while the
 * palette is open (spec 042). Today only reactions use this; new submenu
 * kinds can be added as discriminated cases.
 */
export type ActionSubmenu =
  /** `fromPalette` is false when `+` opened the picker straight from a
   *  comment, with no action list behind it. */
  | { kind: "react"; target: ReactionTarget; title: string; fromPalette: boolean }
  /** The links on one preview row, when there is more than one of them and
   *  riff has to ask which (spec 068). */
  /** Links to choose between: the ones riff found in what has focus, when
   *  there is no cursor to put on one — a rendered comment, the PR's
   *  description — and the several places one preview row can mean (specs
   *  068, 077). `action` is what the key that opened the picker meant. */
  | { kind: "links"; links: LinkTarget[]; action: "open" | "copy"; title: string }

/**
 * Whether Escape from a submenu goes back to the action list or all the way
 * out: a submenu opened from the palette returns to it, one opened directly
 * — a preview row's picker — has no list behind it to return to.
 */
export function submenuOpenedFromPalette(submenu: ActionSubmenu): boolean {
  return submenu.kind === "react" && submenu.fromPalette
}
