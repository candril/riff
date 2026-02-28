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
        ...groupActionsByCategory(actions).flatMap(({ category, items }) => [
          // Category header
          Box(
            { paddingX: 2, paddingTop: 1 },
            Text({ content: category, fg: theme.lavender })
          ),
          // Action items in this category
          ...items.map((action) => {
            const globalIndex = actions.indexOf(action)
            return ActionRow({ action, selected: globalIndex === selectedIndex })
          })
        ])
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

function groupActionsByCategory(actions: Action[]): ActionGroup[] {
  const suggested: Action[] = []
  const github: Action[] = []
  const navigation: Action[] = []
  const other: Action[] = []
  
  for (const action of actions) {
    if (action.id === "submit-review" || action.id === "submit-comment" || action.id === "create-pr") {
      suggested.push(action)
    } else if (action.id === "refresh") {
      github.push(action)
    } else if (action.id === "toggle-file-panel" || action.id === "toggle-view") {
      navigation.push(action)
    } else {
      other.push(action)
    }
  }
  
  const groups: ActionGroup[] = []
  if (suggested.length > 0) groups.push({ category: "Suggested", items: suggested })
  if (github.length > 0) groups.push({ category: "GitHub", items: github })
  if (navigation.length > 0) groups.push({ category: "Navigation", items: navigation })
  if (other.length > 0) groups.push({ category: "Other", items: other })
  
  return groups
}
