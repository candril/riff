# 036 - Link Reveal Mode

**Status**: In Progress

## Description

A keybinding to toggle "link reveal mode" in markdown content, showing the underlying URLs instead of linked text. This allows users to see the actual link destinations and click them in their terminal emulator (tmux, iTerm2, etc.) using standard terminal link handling.

This is preferred over a qutebrowser-style hint system because:
1. Users can visually inspect links before deciding to open them
2. Works with existing terminal link-clicking workflows (Cmd+click, tmux link mode)
3. Simpler implementation, no overlay system needed
4. Supports any number of links without label conflicts

## Out of Scope

- Link hint overlay system (qutebrowser `f` style) - may be added later
- Automatic link detection in plain text (only markdown links)
- Link preview tooltips/popups
- Link shortening/truncation

## Capabilities

### P1 - MVP

**Toggle Behavior:**
- **Trigger key**: `gl` (go to link) toggles link reveal mode
- **Scope**: Applies to currently visible markdown content
- **Visual change**: Markdown links `[text](url)` render as `text (url)` instead of just `text`
- **URLs rendered clickable**: URLs shown in terminal-clickable style (underlined, different color)

**Applicable Views:**
- PR Info Panel (description section)
- PR conversation comments
- Review comments with markdown bodies

**Link Types Handled:**
- Markdown links: `[text](url)` → `text (url)`
- Autolinked URLs: Already visible, no change needed
- Reference-style links: `[text][ref]` with `[ref]: url` → `text (url)`

### P2 - Enhanced

**Persistent State:**
- Remember link reveal preference per session
- Config option for default state: `link_reveal.default = true/false`

**Enhanced Display:**
- Dim the link text, highlight the URL for faster scanning
- Truncate very long URLs with `...` (configurable max length)
- Show domain only option: `[text](https://github.com/org/repo/...)` → `text (github.com/...)`

**Copy Shortcuts:**
- In link reveal mode, `y` on a line with one link copies the URL
- If multiple links on line, show inline hints (a, b, c) for which to copy

### P3 - Polish

**Navigation:**
- `]l` / `[l` to jump between links in the current view
- Links added to a navigable list when in reveal mode

**Link Actions Menu:**
- Enter on a line with links shows action menu: Open, Copy URL, Copy as Markdown

## UI

### Normal Mode (Links Hidden)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ▼ Description                                                           │
│                                                                         │
│   The pageHeaderHeight.app token was 68px but should be 74px            │
│   (68 + 6px sector band). OSA-42622 fixes this issue.                   │
│                                                                         │
│   Fix                                                                   │
│   mobileStickyFilters had a hardcoded MOBILE_APP_HEADER_HEIGHT = 74     │
│   to work around the wrong token. Now that the token is correct,        │
│   the workaround is removed and it uses usePageHeaderHeight()           │
│   directly.                                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Link Reveal Mode (`gl` pressed)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ▼ Description                                                    [URLs] │
│                                                                         │
│   The pageHeaderHeight.app token was 68px but should be 74px            │
│   (68 + 6px sector band). OSA-42622                                     │
│   (https://jiradg.atlassian.net/browse/OSA-42622) fixes this issue.     │
│                                                                         │
│   Fix                                                                   │
│   mobileStickyFilters had a hardcoded MOBILE_APP_HEADER_HEIGHT = 74     │
│   to work around the wrong token. Now that the token is correct,        │
│   the workaround is removed and it uses usePageHeaderHeight()           │
│   directly.                                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### With Multiple Links (Table Example)

Normal:
```
│ App         │ Preview                                          │ Built    │
│ Shop        │ _galaxus.ch · _digitec.ch                        │ 14:28    │
│ Design      │ Preview                                          │ 14:22    │
```

Link Reveal Mode:
```
│ App         │ Preview                                          │ Built    │
│ Shop        │ _galaxus.ch                                      │ 14:28    │
│             │ (https://galaxus-ch-preview-pr7406...)           │          │
│             │ _digitec.ch                                      │          │
│             │ (https://digitec-ch-preview-pr7406...)           │          │
│ Design      │ Preview                                          │ 14:22    │
│             │ (https://pr7406-dg-designsystem-host...)         │          │
```

### Status Bar Indicator

When link reveal mode is active, show indicator in status bar:

```
┌────────────────────────────────────────────────────────────────────────┐
│ gl links  j/k navigate  Tab section  y copy  o open  Esc close        │
└────────────────────────────────────────────────────────────────────────┘
```

Changes to:

```
┌────────────────────────────────────────────────────────────────────────┐
│ gl hide   j/k navigate  Tab section  y copy  o open  Esc close  [URLs]│
└────────────────────────────────────────────────────────────────────────┘
```

## Technical Notes

### State

```typescript
// Add to app state or panel state
interface LinkRevealState {
  active: boolean
}

// In PRInfoPanel or relevant component state
linkRevealActive: boolean
```

### Markdown Rendering Modes

The existing markdown rendering logic needs a mode parameter:

```typescript
interface MarkdownRenderOptions {
  // When true, render [text](url) as "text (url)" with url styled
  revealLinks?: boolean
  
  // Max URL length before truncating (P2)
  maxUrlLength?: number
  
  // Show domain only for long URLs (P2)
  domainOnly?: boolean
}

function renderMarkdown(
  content: string, 
  options: MarkdownRenderOptions = {}
): RenderedContent {
  // ...existing parsing...
  
  if (options.revealLinks) {
    // Transform link nodes to show URL inline
  }
}
```

### Link Extraction

```typescript
interface ExtractedLink {
  text: string      // Display text
  url: string       // Full URL
  startIndex: number // Position in source
  endIndex: number
}

function extractMarkdownLinks(content: string): ExtractedLink[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
  const links: ExtractedLink[] = []
  
  let match: RegExpExecArray | null
  while ((match = linkRegex.exec(content)) !== null) {
    links.push({
      text: match[1]!,
      url: match[2]!,
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    })
  }
  
  return links
}
```

### Key Handling

```typescript
// In PRInfoPanel key handler
if (key.sequence === "g") {
  // Wait for next key
  pendingG = true
  return true
}

if (pendingG && key.sequence === "l") {
  pendingG = false
  toggleLinkReveal()
  return true
}
```

Or using the existing leader key / key sequence system if available.

### URL Styling for Terminal Clickability

URLs should be rendered with:
- Underline (makes them look clickable)
- Distinct color (e.g., blue/cyan)
- Terminal hyperlink escape sequence (OSC 8) for direct clicking support

```typescript
// OSC 8 hyperlink format
function terminalHyperlink(url: string, text: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`
}
```

Note: Not all terminals support OSC 8. The visual styling (underline + color) works everywhere and allows click-to-select.

### Component Updates

```typescript
// PRInfoPanel - add linkReveal state
const [linkRevealActive, setLinkRevealActive] = useState(false)

// Pass to markdown sections
DescriptionSection({
  body: prInfo.body,
  active: activeSection === "description",
  linkReveal: linkRevealActive,
})

ConversationSection({
  comments: prInfo.conversationComments,
  linkReveal: linkRevealActive,
})
```

### File Structure

```
src/
├── utils/
│   └── markdown/
│       ├── parser.ts         # Existing markdown parsing
│       ├── links.ts          # NEW: Link extraction utilities
│       └── render.ts         # Add revealLinks option
├── components/
│   └── PRInfoPanel.ts        # Add gl handler and state
```

## Configuration

```toml
# config.toml

[links]
# Start with links revealed (default: false)
reveal_by_default = false

# Maximum URL length before truncating (0 = no limit)
max_url_length = 60

# Show just domain for long URLs
domain_only = false

# Use OSC 8 terminal hyperlinks (if terminal supports)
osc8_hyperlinks = true
```

## Edge Cases

1. **Nested markdown**: Links inside bold/italic - preserve formatting
2. **Very long URLs**: Truncate with `...` but full URL in OSC 8 sequence
3. **Malformed links**: Show as-is, don't crash
4. **No links in content**: Toggle still works, just no visual change
5. **Links in code blocks**: Don't transform (they're not rendered as links)
6. **Reference-style links**: Resolve references before revealing
7. **Table layout**: URLs may break table alignment - consider wrapping

## Accessibility

- Toggle state announced: "Link URLs revealed" / "Link URLs hidden"
- URLs are actual terminal hyperlinks where supported
- Visual indicator in status bar for current mode
- Works with standard terminal accessibility features
