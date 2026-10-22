import { theme } from "../theme"
import { actionKeys, type ResolvedAction } from "../actions"
import { PICKER_CHROME_ROWS, visibleRows } from "./picker-window"

/**
 * A row in a submenu (e.g. the React… submenu). Rendered flat, without
 * category headers, and with per-row trailing metadata (count, "you
 * reacted"). Each submenu kind is responsible for building these rows
 * before passing them in.
 */
export interface SubmenuRow {
  id: string
  icon?: string
  label: string
  trailing?: string
  /** The viewer already acted on this row, e.g. reacted with this emoji,
   *  so choosing it again undoes rather than adds. */
  accented?: boolean
}

export type ActionMenuMode =
  | { kind: "actions"; actions: ResolvedAction[] }
  | { kind: "submenu"; title: string; hint?: string; rows: SubmenuRow[] }

/** Category display order and labels, in that order. */
const categoryConfig: Record<string, { order: number; label: string }> = {
  claude: { order: 0, label: "Claude" },
  github: { order: 1, label: "GitHub" },
  navigation: { order: 2, label: "Navigation" },
  view: { order: 3, label: "View" },
  external: { order: 4, label: "External Tools" },
  general: { order: 5, label: "General" },
}

interface ActionGroup {
  category: string
  items: ResolvedAction[]
}

function groupActionsByCategory(actions: readonly ResolvedAction[]): ActionGroup[] {
  const byCategory = new Map<string, ResolvedAction[]>()
  for (const action of actions) {
    const cat = action.category || "general"
    byCategory.set(cat, [...(byCategory.get(cat) ?? []), action])
  }
  return [...byCategory]
    .map(([cat, items]) => ({ config: categoryConfig[cat] ?? { order: 99, label: cat }, items }))
    .sort((a, b) => a.config.order - b.config.order)
    .map(({ config, items }) => ({ category: config.label, items }))
}

/** The actions in the order the palette lists them, which is the order the selection moves through. */
export function getVisualActionOrder(actions: readonly ResolvedAction[]): ResolvedAction[] {
  return groupActionsByCategory(actions).flatMap((group) => group.items)
}

export type ActionMenuRow =
  | { kind: "category"; id: string; label: string }
  | { kind: "action"; id: string; label: string; labelFg: string; shortcut: string | null; selected: boolean }
  | {
      kind: "submenu"
      id: string
      /** The icon, when there is one, already two spaces before the label. */
      label: string
      labelFg: string
      trailing: string | null
      trailingFg: string
      accented: boolean
      selected: boolean
    }

export interface ActionMenuModel {
  title: string
  hint: string
  /** Only the rows in view. */
  rows: ActionMenuRow[]
  /** Selectable entries beyond the rows in view. */
  above: number
  below: number
}

/** A category header's rows: its own and the padding above it. */
const HEADER_ROWS = 2

/**
 * The entries in view, grown from the selection one entry at a time, above
 * first, which keeps it centred as pickerWindow does. The rule: at most
 * visibleRows(height) entries, headers not counted, and the entries plus
 * HEADER_ROWS for each header in view within the rows PickerFrame leaves
 * for its list, headers counted. The selection and its header are always
 * in view, unless the two would not fit together: then no header is drawn,
 * since a panel taller than the terminal hides the selection it is for.
 */
function paletteWindow(groupOf: readonly (number | null)[], selectedIndex: number, height: number) {
  const total = groupOf.length
  if (total === 0) return { start: 0, end: 0, headers: false }
  const cap = visibleRows(height)
  const room = Math.max(1, height - PICKER_CHROME_ROWS)
  const headers = 1 + HEADER_ROWS <= room
  const lines = (start: number, end: number) => {
    let count = end - start
    if (!headers) return count
    for (let i = start; i < end; i++) {
      if (groupOf[i] !== null && (i === start || groupOf[i] !== groupOf[i - 1])) count += HEADER_ROWS
    }
    return count
  }
  const fits = (start: number, end: number) => end - start <= cap && lines(start, end) <= room
  let start = Math.max(0, Math.min(selectedIndex, total - 1))
  let end = start + 1
  for (let grew = true; grew; ) {
    grew = false
    if (start > 0 && fits(start - 1, end)) {
      start--
      grew = true
    }
    if (end < total && fits(start, end + 1)) {
      end++
      grew = true
    }
  }
  return { start, end, headers }
}

/**
 * `selectedIndex` counts the selectable rows only: the actions in visual
 * order, or a submenu's rows. `height`: the terminal's, which caps how many
 * rows are in view. `commandKeys`: each keymap command's `keys`, which an
 * action that names its command shows as its hint; without them such an
 * action shows its own shortcut, or none.
 */
export function actionMenuModel(
  mode: ActionMenuMode,
  selectedIndex: number,
  height: number,
  commandKeys: ReadonlyMap<string, string> = new Map(),
): ActionMenuModel {
  if (mode.kind === "submenu") {
    const { start, end } = paletteWindow(mode.rows.map(() => null), selectedIndex, height)
    return {
      title: mode.title,
      hint: mode.hint ?? "esc to back",
      rows: mode.rows.slice(start, end).map((row, i) => {
        const selected = start + i === selectedIndex
        const accented = row.accented === true
        return {
          kind: "submenu",
          id: row.id,
          label: row.icon ? `${row.icon}  ${row.label}` : row.label,
          labelFg: selected || accented ? theme.text : theme.subtext1,
          trailing: row.trailing || null,
          trailingFg: accented ? theme.green : theme.overlay0,
          accented,
          selected,
        }
      }),
      above: start,
      below: mode.rows.length - end,
    }
  }

  const groups = groupActionsByCategory(mode.actions)
  const groupOf = groups.flatMap((group, g) => group.items.map(() => g))
  const { start, end, headers } = paletteWindow(groupOf, selectedIndex, height)
  const rows: ActionMenuRow[] = []
  let visualIndex = 0
  for (const { category, items } of groups) {
    for (const action of items) {
      const index = visualIndex++
      if (index < start || index >= end) continue
      if (headers && (index === start || groupOf[index] !== groupOf[index - 1])) {
        rows.push({ kind: "category", id: `cat:${category}`, label: category })
      }
      const selected = index === selectedIndex
      rows.push({
        kind: "action",
        id: action.id,
        label: action.label,
        labelFg: selected ? theme.text : theme.subtext1,
        shortcut: actionKeys(action, commandKeys),
        selected,
      })
    }
  }
  return { title: "Commands", hint: "esc", rows, above: start, below: groupOf.length - end }
}
