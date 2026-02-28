# 017 - Action Menu (Command Palette)

**Status**: Ready

## Description

A fuzzy-searchable command palette (like VS Code's `Ctrl+P` or OpenCode's action menu) for quick access to all actions. Press a key to open, type to filter, select to execute.

## Out of Scope

- File navigation (separate omni search)
- Settings editing
- Custom user commands

## Capabilities

### P1 - MVP

- **Open menu**: `Ctrl+p` or `:` opens action menu
- **Fuzzy search**: Type to filter actions
- **Execute**: `Enter` to run selected action
- **Cancel**: `Esc` to close
- **Navigation**: `j/k` or arrow keys to move selection

### P2 - Enhanced

- **Recent actions**: Show recently used actions first
- **Contextual actions**: Show different actions based on context (PR mode vs local)
- **Keybind hints**: Show keyboard shortcut next to each action

### P3 - Polish

- **Categories**: Group actions by category
- **Action history**: Remember and suggest based on usage
- **Descriptions**: Show action description on hover/selection

## Actions (P1)

| Action | Description | Context |
|--------|-------------|---------|
| Submit Review | Submit all local comments as a review | PR mode, has local comments |
| Submit Comment | Submit current comment immediately | PR mode, on local comment |
| Create PR | Create a new pull request | Local mode, has changes |
| Refresh | Reload PR data from GitHub | PR mode |
| Toggle File Panel | Show/hide file tree | Always |
| Quit | Exit neoriff | Always |

## UI

### Closed State
Normal neoriff UI.

### Open State
Modal overlay with input and action list:

```
┌─────────────────────────────────────────────────────────────────┐
│ > submit_                                                       │
├─────────────────────────────────────────────────────────────────┤
│ > Submit Review          Submit all local comments (3)     gS   │
│   Submit Comment         Post current comment              S    │
│   Create PR              Create pull request               gP   │
├─────────────────────────────────────────────────────────────────┤
│ ↑↓ navigate    Enter select    Esc cancel                       │
└─────────────────────────────────────────────────────────────────┘
```

### Filtered State
As user types, list filters:

```
┌─────────────────────────────────────────────────────────────────┐
│ > review_                                                       │
├─────────────────────────────────────────────────────────────────┤
│ > Submit Review          Submit all local comments (3)     gS   │
├─────────────────────────────────────────────────────────────────┤
│ ↑↓ navigate    Enter select    Esc cancel                       │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Notes

### Action Definition

```typescript
interface Action {
  id: string
  label: string
  description: string
  shortcut?: string           // Display only, not functional
  handler: () => void | Promise<void>
  available: () => boolean    // Should this action be shown?
  context?: "pr" | "local" | "always"
}

const actions: Action[] = [
  {
    id: "submit-review",
    label: "Submit Review",
    description: "Submit all local comments as a review",
    shortcut: "gS",
    handler: () => openReviewSubmitFlow(),
    available: () => state.appMode === "pr" && hasLocalComments(),
  },
  {
    id: "submit-comment",
    label: "Submit Comment", 
    description: "Post current comment immediately",
    shortcut: "S",
    handler: () => submitCurrentComment(),
    available: () => state.appMode === "pr" && isOnLocalComment(),
  },
  {
    id: "create-pr",
    label: "Create PR",
    description: "Create a new pull request",
    shortcut: "gP",
    handler: () => openCreatePrFlow(),
    available: () => state.appMode === "local",
  },
  {
    id: "refresh",
    label: "Refresh",
    description: "Reload PR data from GitHub",
    shortcut: "gr",
    handler: () => refreshPrData(),
    available: () => state.appMode === "pr",
  },
  {
    id: "toggle-panel",
    label: "Toggle File Panel",
    description: "Show/hide the file tree",
    shortcut: "Ctrl+b",
    handler: () => toggleFilePanel(),
    available: () => true,
  },
  {
    id: "quit",
    label: "Quit",
    description: "Exit neoriff",
    shortcut: "q",
    handler: () => quit(),
    available: () => true,
  },
]
```

### Fuzzy Matching

```typescript
import { fuzzyMatch } from "./utils/fuzzy"

function filterActions(query: string, actions: Action[]): Action[] {
  if (!query) return actions.filter(a => a.available())
  
  return actions
    .filter(a => a.available())
    .map(a => ({
      action: a,
      score: Math.max(
        fuzzyMatch(query, a.label),
        fuzzyMatch(query, a.id),
        fuzzyMatch(query, a.description)
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ action }) => action)
}
```

### State

```typescript
interface ActionMenuState {
  open: boolean
  query: string
  selectedIndex: number
  filteredActions: Action[]
}

// In app state
interface AppState {
  // ... existing
  actionMenu: ActionMenuState
}
```

### Keyboard Handling

When action menu is open, it captures all input:

```typescript
if (state.actionMenu.open) {
  switch (key.name) {
    case "escape":
      closeActionMenu()
      break
    case "return":
    case "enter":
      executeSelectedAction()
      break
    case "up":
    case "k":
      moveSelection(-1)
      break
    case "down":
    case "j":
      moveSelection(1)
      break
    case "backspace":
      updateQuery(state.actionMenu.query.slice(0, -1))
      break
    default:
      if (key.sequence && key.sequence.length === 1) {
        updateQuery(state.actionMenu.query + key.sequence)
      }
      break
  }
  return // Don't process other keys
}
```

### Component

```typescript
// src/components/ActionMenu.ts

export function ActionMenu({ 
  query, 
  actions, 
  selectedIndex 
}: ActionMenuProps) {
  return Box(
    {
      position: "absolute",
      top: "20%",
      left: "20%",
      width: "60%",
      borderStyle: "single",
      borderColor: colors.primary,
      backgroundColor: theme.base,
      flexDirection: "column",
    },
    // Input row
    Box(
      { paddingX: 1, paddingY: 1 },
      Text({ content: "> ", fg: colors.primary }),
      Text({ content: query, fg: colors.text }),
      Text({ content: "_", fg: colors.textDim })  // Cursor
    ),
    // Divider
    Box({ height: 1, borderStyle: "single", borderSides: ["top"] }),
    // Action list
    Box(
      { flexDirection: "column", maxHeight: 10 },
      ...actions.map((action, i) => 
        ActionRow({ action, selected: i === selectedIndex })
      )
    ),
    // Hints
    Box(
      { paddingX: 1, paddingY: 1, borderStyle: "single", borderSides: ["top"] },
      Text({ content: "↑↓ navigate    Enter select    Esc cancel", fg: colors.textDim })
    )
  )
}

function ActionRow({ action, selected }: { action: Action; selected: boolean }) {
  const bg = selected ? theme.surface1 : undefined
  const marker = selected ? "> " : "  "
  
  return Box(
    { flexDirection: "row", backgroundColor: bg, paddingX: 1 },
    Text({ content: marker, fg: colors.primary }),
    Text({ content: action.label, fg: colors.text, width: 20 }),
    Text({ content: action.description, fg: colors.textDim, flexGrow: 1 }),
    action.shortcut 
      ? Text({ content: action.shortcut, fg: colors.textMuted })
      : null
  )
}
```

### File Structure

```
src/
├── utils/
│   └── fuzzy.ts              # Existing fuzzy matching
├── components/
│   └── ActionMenu.ts         # New: Action menu overlay
├── actions/
│   ├── index.ts              # Action definitions
│   ├── submit-review.ts      # Submit review flow
│   ├── submit-comment.ts     # Submit single comment
│   └── create-pr.ts          # Create PR flow
└── app.ts                    # Handle Ctrl+p, action menu state
```
