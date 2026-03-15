# 035 - PR Info Panel v2

**Status**: In Progress

## Description

Overhaul of the PR Info Panel (028) with section-based navigation. The panel shows PR metadata with collapsible sections that can be navigated with Tab and toggled with vim-style fold commands.

This replaces the current flat layout with an interactive, section-based design that surfaces more information (including PR conversation comments) while keeping the UI manageable.

## Capabilities

### P1 - MVP

- **Section-based layout**: Title, metadata, then collapsible sections
- **Sections**: Description, Reviews, Conversation, Files, Commits
- **All sections open by default**
- **Tab navigation**: Tab/Shift+Tab cycles between sections (doesn't toggle)
- **Fold controls**: za toggle, zm/zM collapse, zr/zR expand
- **j/k navigation**: Navigate items within active expanded section
- **Collapsed previews**: Each section shows useful summary when collapsed
- **Actions**:
  - Enter on file: jump to that file in diff view
  - Enter on commit: activate that commit (filter to view)
  - Enter on conversation: open in browser
  - y to copy, o to open in browser

### P2 - Enhanced

- **Bot comment filtering**: Hide/collapse comments from `*[bot]` users
- **Check status**: Show CI/CD status in metadata
- **Labels**: Show PR labels

### P3 - Polish

- **Reply to conversation**: Quick reply from panel
- **Expand threads**: Show conversation thread replies inline

## UI

### Layout

```
+---------------------------------------------------------------------+
| PR Info                                               Esc close     |
+---------------------------------------------------------------------+
| feat: Add dark mode toggle                                          |
| ------------------------------------------------------------------- |
| Status      Open              Author      @octocat                  |
| Branch      feature -> main   Changes     +234 -56 (8 files)        |
| ------------------------------------------------------------------- |
|                                                                     |
| > Description (12 lines)                                            |
|   This PR adds a dark mode toggle to the settings panel.            |
|   Users can now switch between light and dark themes.               |
|   The implementation follows the system preference by               |
|   default, with manual override support...                          |
|                                                                     |
| > Reviews (3)  tick2 x1                                             |
|                                                                     |
| > Conversation (5)                                                  |
|                                                                     |
| > Files (8)  +234 -56                                               |
|                                                                     |
| v Commits (3)                                      <- active        |
| > abc123f  Add toggle component                        2h ago       |
|   def456a  Add theme context                           1h ago       |
|   789ghij  Connect to settings                         30m ago      |
|                                                                     |
+---------------------------------------------------------------------+
| Tab section  j/k navigate  Enter select  y copy  o open             |
+---------------------------------------------------------------------+
```

### Section States

| Section | Collapsed Preview | Expanded Content |
|---------|-------------------|------------------|
| Description | Just header line | Full markdown rendered |
| Reviews | `(3) ✓2 ✗1` - counts by state | Full list with states |
| Conversation | `(5)` - comment count | Full comment list |
| Files | `(8) +234 -56` - count and totals | File list with per-file +/- |
| Commits | `(3)` - commit count | Commit list with SHA, message, date |

### Indicators

- `▶` - collapsed section
- `▼` - expanded section
- Active section has highlighted header background
- Selected item within section has highlighted row

### Section Order

1. Description
2. Reviews
3. Conversation
4. Files
5. Commits

## Interaction

### Navigation

| Key | Action |
|-----|--------|
| `Tab` | Next section |
| `Shift+Tab` | Previous section |
| `j` / `Down` | Next item in active section (if expanded) |
| `k` / `Up` | Previous item in active section (if expanded) |
| `za` | Toggle active section expand/collapse |
| `zm` | Collapse active section |
| `zM` | Collapse all sections |
| `zr` | Expand active section |
| `zR` | Expand all sections |
| `Enter` | Action on selected item |
| `Esc` | Close panel |

### Item Actions

| Section | Enter | y | o |
|---------|-------|---|---|
| Description | (no action) | Copy body | - |
| Reviews | (no action) | Copy @username | Open profile |
| Conversation | Open in browser | Copy comment body | Open comment URL |
| Files | Jump to file in diff | Copy path | Open file on GitHub |
| Commits | Activate commit (filter view) | Copy SHA | Open commit on GitHub |

## Technical Notes

### New Types

```typescript
// PR conversation comment (issue comment on PR)
export interface PrConversationComment {
  id: number
  body: string
  author: string
  createdAt: string
  updatedAt: string
  url: string
  isBot: boolean  // author ends with [bot]
}
```

### Fetching Conversation Comments

```typescript
// Add to src/providers/github.ts

export async function getPrConversationComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrConversationComment[]> {
  // PR conversation comments use the issues API
  const comments = await $`gh api repos/${owner}/${repo}/issues/${prNumber}/comments`.json()
  
  return comments.map((c: any) => ({
    id: c.id,
    body: c.body,
    author: c.user.login,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    url: c.html_url,
    isBot: c.user.login.endsWith('[bot]') || c.user.type === 'Bot',
  }))
}
```

### Extend PrInfo

```typescript
export interface PrInfo {
  // ... existing fields
  
  // Add conversation comments
  conversationComments?: PrConversationComment[]
  
  // Add file stats (already have changedFiles, additions, deletions)
  // Files list comes from parsed diff, not PrInfo
}
```

### Panel State

```typescript
interface PRInfoPanelState {
  activeSection: 'description' | 'reviews' | 'conversation' | 'files' | 'commits'
  cursorIndex: number  // Index within active section
  descriptionExpanded: boolean  // For description, toggle full view
}
```

### Section Component Pattern

```typescript
interface SectionProps {
  title: string
  count: number
  preview: string  // Collapsed preview text
  active: boolean
  children: ReactNode  // Expanded content
}

function Section({ title, count, preview, active, children }: SectionProps) {
  const indicator = active ? 'v' : '>'
  
  if (!active) {
    // Collapsed view
    return (
      <Box>
        <Text>{indicator} {title} ({count})  {preview}</Text>
      </Box>
    )
  }
  
  // Expanded view
  return (
    <Box flexDirection="column">
      <Text>{indicator} {title} ({count})</Text>
      {children}
    </Box>
  )
}
```

### Description Section (Special Case)

Description always shows 4 lines when collapsed (not just a summary line):

```typescript
function DescriptionSection({ body, active, lineCount }: Props) {
  const lines = body.split('\n')
  const previewLines = lines.slice(0, 4)
  const hasMore = lines.length > 4
  
  if (!active) {
    return (
      <Box flexDirection="column">
        <Text>> Description ({lineCount} lines)</Text>
        {previewLines.map((line, i) => (
          <Text key={i} fg={colors.textDim}>  {line}</Text>
        ))}
        {hasMore && <Text fg={colors.textDim}>  ...</Text>}
      </Box>
    )
  }
  
  // Active: show full markdown
  return (
    <Box flexDirection="column">
      <Text>v Description</Text>
      <Markdown content={body} />
    </Box>
  )
}
```

### Load Conversation Comments

Update `loadPrSession` to fetch conversation comments in parallel:

```typescript
const [prInfo, diff, prComments, headSha, viewedStatuses, conversationComments] = await Promise.all([
  getPrInfo(prNumber, resolvedOwner, resolvedRepo),
  getPrDiff(prNumber, resolvedOwner, resolvedRepo),
  getPrComments(resolvedOwner!, resolvedRepo!, prNumber),
  getPrHeadSha(prNumber, resolvedOwner, resolvedRepo),
  fetchViewedStatuses(resolvedOwner!, resolvedRepo!, prNumber),
  getPrConversationComments(resolvedOwner!, resolvedRepo!, prNumber),
])

// Add to prInfo
prInfo.conversationComments = conversationComments
```

### File Structure

```
src/
+-- providers/
|   +-- github.ts              # Add getPrConversationComments
+-- components/
|   +-- PRInfoPanel.ts         # Rewrite with sections
+-- features/
|   +-- pr-info-panel/
|       +-- state.ts           # Section navigation state
|       +-- handlers.ts        # Tab, j/k, Enter handlers
```

## Edge Cases

1. **Empty sections**: Show "(0)" and skip in Tab order? Or show "No X yet"
2. **Very long description**: ScrollBox within section when active
3. **Many files/commits**: Virtualize or limit displayed items
4. **No conversation comments**: Hide section or show "No comments yet"
5. **Bot comments (P2)**: Track hidden count, show toggle hint

## Migration

The existing PRInfoPanel.ts will be rewritten. Current functionality preserved:
- Commit selection and cursor movement (now within Commits section)
- Copy SHA, open in browser
- Scroll support

New features:
- Section-based navigation
- Description section (was static, now expandable)
- Conversation comments (new)
- Files section (new - jump to file from panel)
- Reviews as section (was static list)
