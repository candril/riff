import { Box, Text } from "@opentui/core"
import { colors, theme } from "../theme"
import type { Action } from "../actions"

export interface ActionMenuProps {
  query: string
  actions: Action[]
  selectedIndex: number
}

/**
 * Action menu overlay (command palette)
 * Styled similar to OpenCode's command menu
 */
export function ActionMenu({ query, actions, selectedIndex }: ActionMenuProps) {
  return Box(
    {
      id: "action-menu-overlay",
      width: "100%",
      height: "100%",
      position: "absolute",
      top: 0,
      left: 0,
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
      // Header row: Commands + esc
      Box(
        { 
          flexDirection: "row",
          justifyContent: "space-between",
          paddingX: 2,
          paddingY: 1,
        },
        Text({ content: "Commands", fg: theme.subtext0 }),
        Text({ content: "esc", fg: theme.overlay0 })
      ),
      // Search input - placeholder or query text
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
      // Actions list
      Box(
        { 
          flexDirection: "column",
          paddingBottom: 1,
        },
        ...renderGroupedActions(actions, selectedIndex)
      )
    )
  )
}

interface ActionRowProps {
  action: Action
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
  items: Action[]
}

/** Category display order and labels */
const categoryConfig: Record<string, { order: number; label: string }> = {
  github: { order: 1, label: "GitHub" },
  navigation: { order: 2, label: "Navigation" },
  view: { order: 3, label: "View" },
  general: { order: 4, label: "General" },
}

function groupActionsByCategory(actions: Action[]): ActionGroup[] {
  // Group by category
  const byCategory = new Map<string, Action[]>()
  
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
export function getVisualActionOrder(actions: Action[]): Action[] {
  return groupActionsByCategory(actions).flatMap(group => group.items)
}

/**
 * Render grouped actions with correct visual index tracking
 */
function renderGroupedActions(actions: Action[], selectedIndex: number) {
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
