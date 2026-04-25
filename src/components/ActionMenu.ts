import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
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

export interface ActionMenuProps {
  query: string
  selectedIndex: number
  mode: ActionMenuMode
}

/**
 * Action menu overlay (command palette)
 * Styled similar to OpenCode's command menu. Supports a "submenu" mode
 * (spec 042) that replaces the action list with a flat, titled row set
 * while the palette stays open.
 */
export function ActionMenu({ query, selectedIndex, mode }: ActionMenuProps) {
  const headerLabel = mode.kind === "submenu" ? mode.title : "Commands"
  const headerHint = mode.kind === "submenu"
    ? (mode.hint ?? "esc to back")
    : "esc"

  return Box(
    {
      id: "action-menu-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      // Sits above other modal overlays (the InlineCommentOverlay uses
      // 50) so the palette is reachable while a thread is visible
      // (spec 042).
      zIndex: 100,
    },
    // Dim background overlay
    Box({
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
      backgroundColor: "#00000080",
    }),
    // Command palette centered
    Box(
      {
        position: "absolute",
        top: 2,
        left: "25%",
        width: "50%",
        flexDirection: "column",
        backgroundColor: theme.mantle,
      },
      // Header row: title + esc hint
      Box(
        {
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: headerLabel, fg: theme.subtext0 }),
        Text({ content: headerHint, fg: theme.overlay0 })
      ),
      // Search input (cursor positioned via postProcess in app.ts)
      Box(
        {
          id: "action-menu-search",
          flexDirection: "row",
          paddingX: 2,
          paddingBottom: 1,
        },
        query
          ? Text({ content: query, fg: theme.text })
          : Text({ content: "Search", fg: theme.overlay0 })
      ),
      // List body
      mode.kind === "actions"
        ? Box(
            {
              flexDirection: "column",
              paddingBottom: 1,
            },
            ...renderGroupedActions(mode.actions, selectedIndex)
          )
        : Box(
            {
              flexDirection: "column",
              paddingBottom: 1,
            },
            ...mode.rows.map((row, i) =>
              SubmenuRowView({ row, selected: i === selectedIndex })
            )
          )
    )
  )
}

function SubmenuRowView({ row, selected }: { row: SubmenuRow; selected: boolean }) {
  const bg = selected ? "#585b70" : undefined
  const fg = selected ? theme.text : (row.accented ? theme.text : theme.subtext1)
  const trailFg = row.accented ? theme.green : theme.overlay0

  const leftLabel = row.icon ? `${row.icon}  ${row.label}` : row.label

  return Box(
    {
      flexDirection: "row",
      justifyContent: "space-between",
      backgroundColor: bg,
      paddingX: 2,
      width: "100%",
    },
    Text({ content: leftLabel, fg }),
    row.trailing
      ? Text({ content: row.trailing, fg: trailFg })
      : null
  )
}

interface ActionRowProps {
  action: ResolvedAction
  selected: boolean
}

function ActionRow({ action, selected }: ActionRowProps) {
  // OpenCode uses a light lavender/blue for selection
  const bg = selected ? "#585b70" : undefined  // surface2 for selection
  const fg = selected ? theme.text : theme.subtext1
  const shortcutFg = theme.overlay0
  
  return Box(
    { 
      flexDirection: "row", 
      justifyContent: "space-between",
      backgroundColor: bg, 
      paddingX: 2,
      width: "100%",
    },
    Text({ content: action.label, fg }),
    action.shortcut 
      ? Text({ content: action.shortcut, fg: shortcutFg })
      : null
  )
}

/**
 * Group actions by category for display
 */
interface ActionGroup {
  category: string
  items: ResolvedAction[]
}

/** Category display order and labels */
const categoryConfig: Record<string, { order: number; label: string }> = {
  claude: { order: 0, label: "Claude" },
  github: { order: 1, label: "GitHub" },
  navigation: { order: 2, label: "Navigation" },
  view: { order: 3, label: "View" },
  external: { order: 4, label: "External Tools" },
  general: { order: 5, label: "General" },
}

function groupActionsByCategory(actions: ResolvedAction[]): ActionGroup[] {
  // Group by category
  const byCategory = new Map<string, ResolvedAction[]>()
  
  for (const action of actions) {
    const cat = action.category || "general"
    const existing = byCategory.get(cat) || []
    existing.push(action)
    byCategory.set(cat, existing)
  }
  
  // Convert to groups and sort by category order
  const groups: ActionGroup[] = []
  for (const [cat, items] of byCategory) {
    const config = categoryConfig[cat] || { order: 99, label: cat }
    groups.push({ category: config.label, items })
  }
  
  // Sort groups by order
  groups.sort((a, b) => {
    const orderA = Object.values(categoryConfig).find(c => c.label === a.category)?.order ?? 99
    const orderB = Object.values(categoryConfig).find(c => c.label === b.category)?.order ?? 99
    return orderA - orderB
  })
  
  return groups
}

/**
 * Get a flat list of actions in visual order (respecting grouping)
 */
export function getVisualActionOrder(actions: ResolvedAction[]): ResolvedAction[] {
  return groupActionsByCategory(actions).flatMap(group => group.items)
}

/**
 * Render grouped actions with correct visual index tracking
 */
function renderGroupedActions(actions: ResolvedAction[], selectedIndex: number) {
  const groups = groupActionsByCategory(actions)
  const result: any[] = []
  let visualIndex = 0
  
  for (const { category, items } of groups) {
    // Category header
    result.push(
      Box(
        { paddingX: 2, paddingTop: 1 },
        Text({ content: category, fg: theme.lavender })
      )
    )
    
    // Action items in this category
    for (const action of items) {
      result.push(ActionRow({ action, selected: visualIndex === selectedIndex }))
      visualIndex++
    }
  }
  
  return result
}
