# App Shell

**Status**: Done

## Description

Basic application shell with OpenTUI. Sets up the renderer, handles keyboard input, and provides the foundational layout structure that other components will build upon.

## Out of Scope

- Specific feature implementations
- Configuration system
- Data fetching/providers

## Capabilities

### P1 - MVP

- **Renderer setup**: Initialize OpenTUI CLI renderer with proper cleanup
- **Exit handling**: Clean exit on Ctrl+C and `q` key
- **Root layout**: Full-screen Box container with border
- **Title bar**: Show app name in header
- **Status bar**: Bottom bar for keyboard hints

### P2 - Layout

- **Resizable panels**: Support for side-by-side or stacked panels
- **Focus management**: Track which panel has focus
- **Panel borders**: Visual indication of focused panel

### P3 - Polish

- **Startup screen**: Welcome message or logo on launch
- **Loading states**: Show spinner/indicator during async operations
- **Error display**: Graceful error handling with user-friendly messages

## Technical Notes

### Renderer Setup

```typescript
import { createCliRenderer, Box, Text } from "@opentui/core"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})

// Clean up on exit
process.on("SIGINT", () => {
  renderer.destroy()
  process.exit(0)
})
```

### Root Layout Structure

```typescript
renderer.root.add(
  Box(
    { 
      width: "100%", 
      height: "100%", 
      flexDirection: "column",
      borderStyle: "rounded",
    },
    // Header
    Box(
      { height: 1, width: "100%", backgroundColor: "#1a1b26" },
      Text({ content: " neoriff", fg: "#7aa2f7" })
    ),
    // Main content area
    Box(
      { flexGrow: 1, width: "100%" },
      Text({ content: "Content goes here" })
    ),
    // Status bar
    Box(
      { height: 1, width: "100%", backgroundColor: "#1a1b26" },
      Text({ content: " q: quit  ?: help", fg: "#565f89" })
    ),
  )
)
```

### Keyboard Handling

```typescript
renderer.keyInput.on("keypress", (key) => {
  if (key.name === "q") {
    renderer.destroy()
    process.exit(0)
  }
})
```

### Component Structure

```
┌─ neoriff ───────────────────────────────────────────────────┐
│  Header                                                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│                                                              │
│                      Main Content                            │
│                                                              │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  q: quit  ?: help                                            │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── index.ts              # Entry point
├── app.ts                # Main app setup, renderer init
├── components/
│   ├── Shell.ts          # Root layout component
│   ├── Header.ts         # Top title bar
│   └── StatusBar.ts      # Bottom status/hints bar
└── utils/
    └── keyboard.ts       # Keyboard event helpers
```
