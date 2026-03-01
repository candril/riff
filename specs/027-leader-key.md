# Leader Key System

**Status**: Draft

## Description

A vim-style leader key system for organizing keybindings. Instead of scattered Ctrl+X shortcuts, use a leader key (e.g., Space or backslash) followed by mnemonic keys.

## Out of Scope

- Custom leader key configuration (use fixed leader for MVP)
- Multiple leader keys

## Capabilities

### P1 - MVP

- **Leader key**: Space or `\` triggers leader mode
- **Timeout**: Leader mode expires after 500ms if no follow-up key
- **Visual indicator**: Show "Leader..." in status bar when active
- **File commands**: `<leader>f` for file picker, `<leader>ff` for find files
- **Git/GitHub commands**: `<leader>g` prefix (go, gS, etc.)

### P2 - Expansion

- **Which-key popup**: Show available bindings after leader press
- **Nested leaders**: `<leader>g` shows git submenu
- **Help**: `<leader>?` shows all bindings

### P3 - Customization

- **Config file**: Define custom leader bindings in config.toml
- **Per-mode bindings**: Different leader maps for diff vs comments view

## Technical Notes

### Example Bindings

```
<leader>f     - Find files (file picker)
<leader>p     - Command palette (action menu)
<leader>b     - Toggle file panel
<leader>gS    - Submit review
<leader>gs    - Submit single comment
<leader>go    - Open in browser
<leader>gr    - Refresh
<leader>q     - Quit
```

### Implementation Approach

```typescript
interface LeaderState {
  active: boolean
  keys: string[]  // Accumulated keys after leader
  timeout: ReturnType<typeof setTimeout> | null
}

// In keypress handler:
if (key.name === "space" && !leaderState.active) {
  leaderState.active = true
  leaderState.timeout = setTimeout(() => {
    leaderState.active = false
    leaderState.keys = []
  }, 500)
  return
}

if (leaderState.active) {
  leaderState.keys.push(key.name)
  const sequence = leaderState.keys.join("")
  
  const binding = leaderBindings[sequence]
  if (binding) {
    clearTimeout(leaderState.timeout)
    leaderState.active = false
    leaderState.keys = []
    executeAction(binding)
  }
}
```
