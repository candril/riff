# Local Comments

**Status**: In Progress

## Description

Add comments on specific lines in a diff. Comments are stored locally and can later be submitted as a GitHub review. This is the core reviewing functionality.

## Out of Scope

- GitHub sync (separate spec)
- Threaded replies
- Markdown preview

## Capabilities

### P1 - MVP

- **Add comment**: Press `c` on a line to open `$EDITOR` with diff context
- **Save comment**: Save and quit editor to save, empty content to cancel
- **View comments**: Show indicator on lines with comments
- **List comments**: `C` to show all comments in current file
- **Markdown storage**: Comments saved as `.riff/comments/*.md` with frontmatter

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
  
  // For linking to specific revision
  commit?: string        // Git commit hash or jj change ID
  
  // GitHub sync (populated after submission or fetch)
  githubId?: number
  githubUrl?: string
  author?: string        // GitHub username (for others' comments)
  inReplyTo?: string     // Parent comment ID for threads
}

// ReviewSession is metadata only - comments stored as separate markdown files
export interface ReviewSession {
  id: string
  source: string         // "local", "branch:main", "gh:owner/repo#123"
  createdAt: string
  updatedAt: string
  
  // GitHub-specific (only for PR sessions)
  prNumber?: number
  owner?: string
  repo?: string
  reviewMode?: "single" | "review"
  pendingReviewId?: string
}
```

### Storage - Markdown Files with Frontmatter

Comments are stored as individual markdown files with YAML frontmatter. This makes them:
- Human-readable and editable outside the app
- Easy to grep/search
- Git-friendly (can be committed with the code)
- Linkable to specific commits

```
.riff/
├── session.toml              # Session metadata (source, reviewMode, etc.)
└── comments/
    ├── a1b2c3d4.md           # Comment files named by ID
    ├── e5f6g7h8.md
    └── ...
```

**Comment file format:**

```markdown
---
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
filename: src/app.ts
line: 42
side: RIGHT
commit: abc1234
createdAt: 2024-01-15T10:30:00Z
status: local
---

This should use a logger instead of console.log.

Consider using the existing `logger` utility from `src/utils/logger.ts`.
```

**Synced comment from GitHub PR** (fetched via 009):

```markdown
---
id: gh-12345678
filename: src/app.ts
line: 42
side: RIGHT
commit: def5678
createdAt: 2024-01-15T08:00:00Z
status: synced
githubId: 12345678
githubUrl: https://github.com/owner/repo/pull/123#discussion_r12345678
author: octocat
---

Good catch! We should definitely use the logger here.
```

**Session metadata (session.toml):**

```toml
source = "gh:owner/repo#123"
createdAt = "2024-01-15T10:00:00Z"
updatedAt = "2024-01-15T10:30:00Z"

# GitHub-specific (only for PR sessions)
[github]
prNumber = 123
owner = "owner"
repo = "repo"
reviewMode = "single"
```

```typescript
// src/storage.ts
import { join } from "path"
import { readdir, mkdir } from "fs/promises"

const STORAGE_DIR = ".riff"
const COMMENTS_DIR = "comments"
const SESSION_FILE = "session.toml"

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): { meta: Record<string, any>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return { meta: {}, body: content }
  }
  
  // Simple YAML parsing for our known fields
  const meta: Record<string, any> = {}
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(": ")
    if (key && rest.length) {
      meta[key.trim()] = rest.join(": ").trim()
    }
  }
  
  return { meta, body: match[2].trim() }
}

/**
 * Generate frontmatter markdown for a comment
 */
function toMarkdown(comment: Comment): string {
  const lines = [
    "---",
    `id: ${comment.id}`,
    `filename: ${comment.filename}`,
    `line: ${comment.line}`,
    `side: ${comment.side}`,
    `commit: ${comment.commit || ""}`,
    `createdAt: ${comment.createdAt}`,
    `status: ${comment.status}`,
  ]
  
  if (comment.githubId) lines.push(`githubId: ${comment.githubId}`)
  if (comment.githubUrl) lines.push(`githubUrl: ${comment.githubUrl}`)
  if (comment.author) lines.push(`author: ${comment.author}`)
  if (comment.inReplyTo) lines.push(`inReplyTo: ${comment.inReplyTo}`)
  
  lines.push("---", "", comment.body)
  
  return lines.join("\n")
}

/**
 * Load all comments from markdown files
 */
export async function loadComments(): Promise<Comment[]> {
  const commentsPath = join(STORAGE_DIR, COMMENTS_DIR)
  
  try {
    const files = await readdir(commentsPath)
    const comments: Comment[] = []
    
    for (const file of files) {
      if (!file.endsWith(".md")) continue
      
      const content = await Bun.file(join(commentsPath, file)).text()
      const { meta, body } = parseFrontmatter(content)
      
      comments.push({
        id: meta.id,
        filename: meta.filename,
        line: parseInt(meta.line, 10),
        side: meta.side as "LEFT" | "RIGHT",
        commit: meta.commit || undefined,
        body,
        createdAt: meta.createdAt,
        status: meta.status as "local" | "pending" | "synced",
        githubId: meta.githubId ? parseInt(meta.githubId, 10) : undefined,
        githubUrl: meta.githubUrl,
        author: meta.author,
        inReplyTo: meta.inReplyTo,
      })
    }
    
    return comments
  } catch {
    return []
  }
}

/**
 * Save a comment to a markdown file
 */
export async function saveComment(comment: Comment): Promise<void> {
  const commentsPath = join(STORAGE_DIR, COMMENTS_DIR)
  await mkdir(commentsPath, { recursive: true })
  
  const filename = `${comment.id.slice(0, 8)}.md`
  await Bun.write(join(commentsPath, filename), toMarkdown(comment))
}

/**
 * Delete a comment file
 */
export async function deleteComment(commentId: string): Promise<void> {
  const filename = `${commentId.slice(0, 8)}.md`
  const path = join(STORAGE_DIR, COMMENTS_DIR, filename)
  
  const { unlink } = await import("fs/promises")
  await unlink(path).catch(() => {})
}
```

### Comment Input - External Editor

Comments are written in `$EDITOR` (nvim by default). When `c` is pressed:

1. TUI suspends
2. Editor opens with diff context (scissors line format)
3. User writes comment above scissors line
4. Editor closes, TUI resumes
5. Comment saved as markdown file

```typescript
// src/utils/editor.ts
export async function openCommentEditor(options: {
  diffContent: string
  filePath: string
  line: number
  commit?: string
  existingComment?: string
}): Promise<string | null>

// When 'c' is pressed on a line
async function handleAddComment() {
  const body = await openCommentEditor({
    diffContent: currentFileDiff,
    filePath: currentFile,
    line: cursorLine,
    commit: getCurrentCommit(),
  })
  
  if (body) {
    const comment = createComment(currentFile, cursorLine, body)
    await saveComment(comment)
    state = addComment(state, comment)
  }
}
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
| `c` | Add comment on current line (opens `$EDITOR`) |
| `C` | Show comments list |
| `e` | Edit comment on current line (opens `$EDITOR`) |
| `d` | Delete comment on current line |

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
├── storage.ts            # Markdown file persistence
├── state.ts              # Add comment state
└── components/
    ├── CommentMarker.ts  # Line indicator
    └── CommentsList.ts   # Comments overlay

# Local storage layout
.riff/
├── session.toml          # Session metadata
└── comments/
    ├── a1b2c3d4.md       # Individual comment files
    ├── e5f6g7h8.md
    └── ...
```
