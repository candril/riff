# Local Comments

**Status**: Ready

## Description

Add comments on specific lines in a diff. Comments are stored locally and can later be submitted as a GitHub review. This is the core reviewing functionality.

## Out of Scope

- GitHub sync (separate spec)
- Threaded replies
- Markdown preview

## Capabilities

### P1 - MVP

- **Add comment**: Press `c` on a line to open comment input
- **Save comment**: Enter to save, Esc to cancel
- **View comments**: Show indicator on lines with comments
- **List comments**: `C` to show all comments in current file
- **Local storage**: Comments saved to `.neoriff/comments.json`

### P2 - Edit & Delete

- **Edit comment**: `e` on a commented line to edit
- **Delete comment**: `d` on a commented line to delete
- **Comment preview**: Show comment text inline (collapsed)

### P3 - Polish

- **Multi-line selection**: Select range of lines for comment
- **Comment categories**: Suggestion, question, issue, praise
- **Pending count**: Show "3 pending comments" in status bar

## Technical Notes

### Comment Data Structure

```typescript
// src/types.ts
export interface Comment {
  id: string
  filename: string
  line: number           // Line number in the new file
  side: "LEFT" | "RIGHT" // For split view - which side
  body: string
  createdAt: string
  status: "local" | "pending" | "synced"
}

export interface ReviewSession {
  id: string
  source: string         // "local", "branch:main", "gh:owner/repo#123"
  createdAt: string
  comments: Comment[]
}
```

### Storage

```typescript
// src/storage.ts
import { join } from "path"

const STORAGE_DIR = ".neoriff"
const COMMENTS_FILE = "comments.json"

export async function loadSession(source: string): Promise<ReviewSession | null> {
  const path = join(STORAGE_DIR, `${sanitize(source)}.json`)
  const file = Bun.file(path)
  if (!await file.exists()) return null
  return await file.json()
}

export async function saveSession(session: ReviewSession): Promise<void> {
  await Bun.write(
    join(STORAGE_DIR, `${sanitize(session.source)}.json`),
    JSON.stringify(session, null, 2)
  )
}

export function createComment(filename: string, line: number, body: string): Comment {
  return {
    id: crypto.randomUUID(),
    filename,
    line,
    side: "RIGHT",
    body,
    createdAt: new Date().toISOString(),
    status: "local",
  }
}
```

### Comment Input UI

```typescript
// When 'c' is pressed on a line
Box(
  { 
    position: "absolute",
    top: cursorLine + 1,
    left: 4,
    width: "80%",
    borderStyle: "rounded",
    backgroundColor: "#1a1b26",
    padding: 1,
  },
  Text({ content: "Add comment:", fg: "#7aa2f7" }),
  Input({
    id: "comment-input",
    placeholder: "Type your comment...",
    width: "100%",
    onSubmit: (value) => {
      addComment(currentFile, currentLine, value)
      closeCommentInput()
    },
    onCancel: () => closeCommentInput(),
  })
)
```

### Line Indicators

Show a marker on lines with comments:

```
  12   function main() {
  13 ●   console.log("hello")    // ● indicates comment
  14   }
```

```typescript
function renderLine(lineNum: number, content: string, hasComment: boolean) {
  const marker = hasComment ? "●" : " "
  return Text({
    content: `${lineNum.toString().padStart(4)} ${marker} ${content}`,
    fg: hasComment ? "#bb9af7" : "#a9b1d6",
  })
}
```

### Comments List View

Press `C` to see all comments in current file:

```
┌─ Comments (3) ────────────────────────────────────────────────┐
│                                                               │
│ Line 13: This should use a logger instead of console.log     │
│                                                               │
│ Line 27: Consider extracting this to a helper function       │
│                                                               │
│ Line 45: Nice refactor!                                      │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ j/k: navigate  Enter: jump to line  e: edit  d: delete  Esc  │
└───────────────────────────────────────────────────────────────┘
```

### Keyboard Bindings

| Key | Action |
|-----|--------|
| `c` | Add comment on current line |
| `C` | Show comments list |
| `e` | Edit comment on current line |
| `d` | Delete comment on current line |
| `Enter` | Save comment (in input mode) |
| `Esc` | Cancel comment (in input mode) |

### State Updates

```typescript
// src/state.ts
export interface AppState {
  // ... existing fields
  comments: Comment[]
  isCommentInputOpen: boolean
  commentInputLine: number | null
}

export function addComment(state: AppState, comment: Comment): AppState {
  return {
    ...state,
    comments: [...state.comments, comment],
    isCommentInputOpen: false,
    commentInputLine: null,
  }
}
```

### File Structure

```
src/
├── types.ts              # Comment, ReviewSession types
├── storage.ts            # Local file persistence
├── state.ts              # Add comment state
└── components/
    ├── CommentInput.ts   # Comment text input
    ├── CommentMarker.ts  # Line indicator
    └── CommentsList.ts   # Comments overlay
```
