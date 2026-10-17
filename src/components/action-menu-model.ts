import { theme } from "../theme"
import type { ResolvedAction } from "../actions"

/**
 * A row in a submenu (e.g. the React… submenu). Rendered flat, without
 * category headers, and with per-row trailing metadata (count, "you
 * reacted"). Each submenu kind is responsible for building these rows
 * before passing them in.
 */
export interface SubmenuRow {
  /** Stable identifier used by input handling */
  id: string
  /** Leading glyph (emoji for reactions) */
  icon?: string
  /** Primary label, left-aligned */
  label: string
  /** Trailing text, right-aligned (count, hint) */
  trailing?: string
  /** When true, render with the "viewer already acted" accent */
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
  rows: ActionMenuRow[]
}

/** `selectedIndex` counts the selectable rows only: the actions in visual order, or a submenu's rows. */
export function actionMenuModel(mode: ActionMenuMode, selectedIndex: number): ActionMenuModel {
  if (mode.kind === "submenu") {
    return {
      title: mode.title,
      hint: mode.hint ?? "esc to back",
      rows: mode.rows.map((row, i) => {
        const selected = i === selectedIndex
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
    }
  }

  const rows: ActionMenuRow[] = []
  let visualIndex = 0
  for (const { category, items } of groupActionsByCategory(mode.actions)) {
    rows.push({ kind: "category", id: `cat:${category}`, label: category })
    for (const action of items) {
      const selected = visualIndex++ === selectedIndex
      rows.push({
        kind: "action",
        id: action.id,
        label: action.label,
        labelFg: selected ? theme.text : theme.subtext1,
        shortcut: action.shortcut ?? null,
        selected,
      })
    }
  }
  return { title: "Commands", hint: "esc", rows }
}
