# Configuration

**Status**: Ready

## Description

Load user configuration from a TOML file. All keybindings are configurable and support key sequences (e.g., `g g`, `]f`). Config file location follows XDG spec.

## Out of Scope

- GUI config editor
- Config hot-reloading (requires restart)
- Per-project config files

## Capabilities

### P1 - MVP

- **Load config**: Read `~/.config/riff/config.toml` on startup
- **Default config**: Ship sensible defaults, work without config file
- **All keybindings**: Every action configurable via `[keys]` section
- **Key sequences**: Support multi-key bindings like `g g`, `]f`, `]F`
- **Modifier keys**: Support `ctrl+`, `alt+`, `shift+` modifiers

### P2 - Theming

- **Colors**: Customize diff colors (added, removed, context)
- **UI colors**: Header, status bar, borders, selection
- **Dim viewed files**: Color for already-reviewed files

### P3 - Polish

- **Config validation**: Warn on invalid keys/values at startup
- **Generate default**: `riff --init-config` creates commented config
- **Config dump**: `riff --dump-config` shows current effective config

## Technical Notes

### Config File Location

```
~/.config/riff/config.toml
```

Fallback order:
1. `$RIFF_CONFIG` environment variable
2. `$XDG_CONFIG_HOME/riff/config.toml`
3. `~/.config/riff/config.toml`

### Full Default Config

```toml
# riff configuration

[view]
default_mode = "unified"      # "unified" | "split"
line_numbers = true
word_wrap = false
show_file_panel = true
auto_mark_viewed = false      # Mark file viewed when navigating away

[colors]
# Diff colors
added_bg = "#1a4d1a"
added_fg = "#9ece6a"
removed_bg = "#4d1a1a"
removed_fg = "#f7768e"
context_bg = "transparent"
context_fg = "#a9b1d6"

# UI colors
header_bg = "#1a1b26"
header_fg = "#7aa2f7"
status_bar_bg = "#1a1b26"
status_bar_fg = "#565f89"
border = "#3b4261"
selection_bg = "#292e42"
selection_fg = "#c0caf5"
viewed_fg = "#565f89"         # Dimmed color for viewed files
comment_marker = "#bb9af7"

[keys]
# Navigation - scrolling
scroll_down = "j"
scroll_up = "k"
scroll_left = "h"
scroll_right = "l"
half_page_down = "ctrl+d"
half_page_up = "ctrl+u"
page_down = "ctrl+f"
page_up = "ctrl+b"
top = "g g"
bottom = "G"

# Navigation - hunks
next_hunk = "] c"
prev_hunk = "[ c"

# Navigation - files
next_file = "] f"
prev_file = "[ f"
next_unreviewed = "] F"
prev_unreviewed = "[ F"

# File panel
toggle_file_panel = "ctrl+n"
focus_file_panel = "ctrl+p"
select_file = "enter"

# Review actions
toggle_viewed = "v"
mark_all_viewed = "V"
add_comment = "c"
edit_comment = "e"
delete_comment = "d"
show_comments = "C"

# View toggles
toggle_split_view = "s"
toggle_line_numbers = "n"
toggle_word_wrap = "w"

# General
quit = "q"
quit_force = "ctrl+c"
help = "?"
refresh = "R"
```

### Key Notation

Keys are specified as strings with optional modifiers:

| Notation | Meaning |
|----------|---------|
| `j` | Single key |
| `J` or `shift+j` | Shift + key |
| `ctrl+d` | Ctrl + key |
| `alt+n` | Alt/Option + key |
| `ctrl+shift+p` | Multiple modifiers |
| `g g` | Key sequence (press g twice) |
| `] f` | Key sequence (press ] then f) |
| `] F` | Key sequence (] then shift+f) |

### Config Schema

```typescript
// src/config/schema.ts
export interface Config {
  view: ViewConfig
  colors: ColorConfig
  keys: KeyConfig
}

export interface ViewConfig {
  default_mode: "unified" | "split"
  line_numbers: boolean
  word_wrap: boolean
  show_file_panel: boolean
  auto_mark_viewed: boolean
}

export interface ColorConfig {
  added_bg: string
  added_fg: string
  removed_bg: string
  removed_fg: string
  context_bg: string
  context_fg: string
  header_bg: string
  header_fg: string
  status_bar_bg: string
  status_bar_fg: string
  border: string
  selection_bg: string
  selection_fg: string
  viewed_fg: string
  comment_marker: string
}

export interface KeyConfig {
  // Navigation
  scroll_down: string
  scroll_up: string
  scroll_left: string
  scroll_right: string
  half_page_down: string
  half_page_up: string
  page_down: string
  page_up: string
  top: string
  bottom: string
  
  // Hunks
  next_hunk: string
  prev_hunk: string
  
  // Files
  next_file: string
  prev_file: string
  next_unreviewed: string
  prev_unreviewed: string
  
  // File panel
  toggle_file_panel: string
  focus_file_panel: string
  select_file: string
  
  // Review
  toggle_viewed: string
  mark_all_viewed: string
  add_comment: string
  edit_comment: string
  delete_comment: string
  show_comments: string
  
  // View
  toggle_split_view: string
  toggle_line_numbers: string
  toggle_word_wrap: string
  
  // General
  quit: string
  quit_force: string
  help: string
  refresh: string
}
```

### Config Loader

```typescript
// src/config/loader.ts
import { parse } from "@iarna/toml"
import { homedir } from "os"
import { join } from "path"
import { defaults } from "./defaults"

export async function loadConfig(): Promise<Config> {
  const configPath = getConfigPath()
  
  const file = Bun.file(configPath)
  if (!await file.exists()) {
    return defaults
  }
  
  try {
    const content = await file.text()
    const userConfig = parse(content) as Partial<Config>
    return deepMerge(defaults, userConfig)
  } catch (err) {
    console.error(`Warning: Failed to parse config at ${configPath}`)
    console.error(err)
    return defaults
  }
}

function getConfigPath(): string {
  if (process.env.RIFF_CONFIG) {
    return process.env.RIFF_CONFIG
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")
  return join(xdgConfig, "riff", "config.toml")
}

function deepMerge<T extends object>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key]
    if (sourceVal && typeof sourceVal === "object" && !Array.isArray(sourceVal)) {
      result[key] = deepMerge(result[key] as object, sourceVal as object) as T[keyof T]
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T]
    }
  }
  return result
}
```

### Key Sequence Handler

```typescript
// src/utils/keymap.ts
export interface KeyEvent {
  name: string
  ctrl: boolean
  alt: boolean
  shift: boolean
}

export class KeyMapper {
  private pending: string[] = []
  private timeout: Timer | null = null
  private bindings: Map<string, string>  // action -> binding
  private reverseBindings: Map<string, string>  // binding -> action
  
  constructor(
    keyConfig: KeyConfig,
    private onAction: (action: string) => void,
    private sequenceTimeout = 500
  ) {
    this.bindings = new Map(Object.entries(keyConfig))
    this.reverseBindings = new Map(
      Object.entries(keyConfig).map(([action, binding]) => [
        this.normalizeBinding(binding),
        action
      ])
    )
  }
  
  handleKey(key: KeyEvent): boolean {
    const keyStr = this.keyToString(key)
    this.pending.push(keyStr)
    
    // Clear pending after timeout
    if (this.timeout) clearTimeout(this.timeout)
    this.timeout = setTimeout(() => {
      this.pending = []
    }, this.sequenceTimeout)
    
    const sequence = this.pending.join(" ")
    
    // Check for exact match
    const action = this.reverseBindings.get(sequence)
    if (action) {
      this.pending = []
      if (this.timeout) clearTimeout(this.timeout)
      this.onAction(action)
      return true
    }
    
    // Check if sequence could still match a longer binding
    const couldMatch = Array.from(this.reverseBindings.keys()).some(
      binding => binding.startsWith(sequence + " ") || binding === sequence
    )
    
    if (!couldMatch) {
      this.pending = []
    }
    
    return false
  }
  
  private keyToString(key: KeyEvent): string {
    const parts: string[] = []
    if (key.ctrl) parts.push("ctrl")
    if (key.alt) parts.push("alt")
    if (key.shift && key.name.length > 1) parts.push("shift")
    
    // Handle uppercase letters as shift+letter
    const name = key.shift && key.name.length === 1 
      ? key.name.toUpperCase() 
      : key.name.toLowerCase()
    parts.push(name)
    
    return parts.join("+")
  }
  
  private normalizeBinding(binding: string): string {
    // Normalize "g g" and "g  g" to "g g"
    return binding.trim().split(/\s+/).join(" ")
  }
  
  // Get binding for display in help/status bar
  getBindingDisplay(action: string): string {
    return this.bindings.get(action) ?? ""
  }
}
```

### Usage in App

```typescript
// src/app.ts
import { loadConfig } from "./config/loader"
import { KeyMapper } from "./utils/keymap"

const config = await loadConfig()

const keyMapper = new KeyMapper(config.keys, (action) => {
  switch (action) {
    case "scroll_down": scrollDown(); break
    case "scroll_up": scrollUp(); break
    case "next_file": nextFile(); break
    case "prev_file": prevFile(); break
    case "next_unreviewed": nextUnreviewedFile(); break
    case "toggle_viewed": toggleViewed(); break
    case "add_comment": openCommentInput(); break
    case "quit": quit(); break
    // ... etc
  }
})

renderer.keyInput.on("keypress", (key) => {
  keyMapper.handleKey(key)
})
```

### Dynamic Status Bar

Show actual keybindings from config:

```typescript
function renderStatusBar(keyMapper: KeyMapper) {
  const hints = [
    `${keyMapper.getBindingDisplay("scroll_down")}/${keyMapper.getBindingDisplay("scroll_up")}: scroll`,
    `${keyMapper.getBindingDisplay("next_file")}: next file`,
    `${keyMapper.getBindingDisplay("toggle_viewed")}: mark viewed`,
    `${keyMapper.getBindingDisplay("add_comment")}: comment`,
    `${keyMapper.getBindingDisplay("quit")}: quit`,
  ].join("  ")
  
  return Text({ content: ` ${hints}`, fg: config.colors.status_bar_fg })
}
```

### Dependencies

```bash
bun add @iarna/toml
```

### File Structure

```
src/
├── config/
│   ├── index.ts          # Re-exports
│   ├── schema.ts         # Type definitions
│   ├── defaults.ts       # Default configuration
│   └── loader.ts         # Load and merge config
└── utils/
    └── keymap.ts         # Key sequence handling
```

### Example Custom Config

```toml
# ~/.config/riff/config.toml

# I prefer split view by default
[view]
default_mode = "split"
auto_mark_viewed = true

# Custom colors for my terminal theme
[colors]
header_bg = "#282a36"
header_fg = "#bd93f9"

# Emacs-style navigation
[keys]
scroll_down = "ctrl+n"
scroll_up = "ctrl+p"
half_page_down = "ctrl+v"
half_page_up = "alt+v"
quit = "ctrl+x ctrl+c"
```
