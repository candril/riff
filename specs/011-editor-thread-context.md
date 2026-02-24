# Editor Thread Context

**Status**: Draft

## Description

When opening the external editor to add or edit a comment, show the full thread context as read-only content so the user understands the conversation they're contributing to.

## Out of Scope

- Editing other users' comments (GitHub doesn't allow this)
- Inline editing without external editor
- Rich text / markdown preview

## Capabilities

### P1 - MVP

- **Thread context**: Show existing thread comments above the edit area
- **Read-only marking**: Clearly indicate which content is context vs editable
- **Reply indication**: When replying, show "Replying to @author"
- **Edit indication**: When editing, show original comment text

### P2 - Enhanced

- **Resolved state**: Show if thread is resolved
- **Timestamp display**: Show when each comment was made
- **Author highlighting**: Different colors for different authors

### P3 - Polish

- **Collapse old comments**: If thread is very long, collapse middle comments
- **Link to GitHub**: Include URL to view thread on GitHub

## Technical Notes

### Editor Content Structure

The editor content has three sections:

1. **Thread context** (read-only, comment lines `#`)
2. **Editable area** (user's comment)
3. **Diff context** (read-only, after scissors line)

### New Comment on Line with Existing Thread

```
# Thread on src/app.ts:42
# ─────────────────────────────────────────────────────────────────
# @octocat (2024-01-15 10:30):
#   This should use a logger instead of console.log. The current
#   approach makes it hard to filter logs in production.
#
# @reviewer (2024-01-15 11:45):
#   Agreed. Also consider using structured logging with JSON format
#   for better searchability.
# ─────────────────────────────────────────────────────────────────
# Replying to thread...

Your reply goes here.

# Lines starting with '#' are ignored.
# Leave empty to cancel.
#
# ------------------------ >8 ------------------------
   40 │   const result = calculate()
 → 41 │   console.log("debug:", result)
   42 │   return result
```

### Editing Your Own Comment

```
# Thread on src/app.ts:42
# ─────────────────────────────────────────────────────────────────
# @octocat (2024-01-15 10:30):
#   This should use a logger instead of console.log.
# ─────────────────────────────────────────────────────────────────
# Editing your comment from 2024-01-15 12:00...
# Original:
#   Will fix this

Will fix, switching to winston logger for structured logging.

# Lines starting with '#' are ignored.
# Leave empty to cancel.
#
# ------------------------ >8 ------------------------
   40 │   const result = calculate()
 → 41 │   console.log("debug:", result)
   42 │   return result
```

### New Comment (No Existing Thread)

```
# Commenting on src/app.ts:42


Your comment goes here.

# Lines starting with '#' are ignored.
# Leave empty to cancel.
#
# ------------------------ >8 ------------------------
   40 │   const result = calculate()
 → 41 │   console.log("debug:", result)
   42 │   return result
```

### Updated Editor Options

```typescript
// src/utils/editor.ts

export interface CommentEditorOptions {
  diffContent: string
  filePath: string
  line: number
  
  // Existing comment (for editing)
  existingComment?: string
  
  // Thread context (new)
  threadComments?: ThreadComment[]
  
  // What action is being performed
  mode: "new" | "reply" | "edit"
}

export interface ThreadComment {
  author: string
  body: string
  createdAt: string
  isYours: boolean
}
```

### Building Editor Content

```typescript
export function buildEditorContent(options: CommentEditorOptions): string {
  const lines: string[] = []
  
  // Thread context header
  if (options.threadComments && options.threadComments.length > 0) {
    lines.push(`# Thread on ${options.filePath}:${options.line}`)
    lines.push("# " + "─".repeat(65))
    
    for (const comment of options.threadComments) {
      const date = formatDate(comment.createdAt)
      lines.push(`# @${comment.author} (${date}):`)
      
      // Indent and wrap comment body
      for (const bodyLine of comment.body.split("\n")) {
        lines.push(`#   ${bodyLine}`)
      }
      lines.push("#")
    }
    
    lines.push("# " + "─".repeat(65))
  }
  
  // Mode-specific instructions
  if (options.mode === "reply") {
    lines.push("# Replying to thread...")
  } else if (options.mode === "edit") {
    lines.push(`# Editing your comment from ${formatDate(options.existingCreatedAt)}...`)
    lines.push("# Original:")
    for (const line of (options.existingComment || "").split("\n")) {
      lines.push(`#   ${line}`)
    }
  } else {
    lines.push(`# Commenting on ${options.filePath}:${options.line}`)
  }
  
  lines.push("")
  
  // Editable area - pre-fill with existing comment if editing
  if (options.mode === "edit" && options.existingComment) {
    lines.push(options.existingComment)
  } else {
    lines.push("")
  }
  
  lines.push("")
  lines.push("# Lines starting with '#' are ignored.")
  lines.push("# Leave empty to cancel.")
  lines.push("#")
  lines.push("# ------------------------ >8 ------------------------")
  
  // Diff context
  lines.push(formatDiffContext(options.diffContent, options.line))
  
  return lines.join("\n")
}
```

### Parsing Editor Output

```typescript
export function parseEditorOutput(content: string): string | null {
  const lines = content.split("\n")
  const resultLines: string[] = []
  
  let foundScissors = false
  
  for (const line of lines) {
    // Stop at scissors line
    if (line.includes("------------------------") && line.includes(">8")) {
      foundScissors = true
      break
    }
    
    // Skip comment lines
    if (line.startsWith("#")) {
      continue
    }
    
    resultLines.push(line)
  }
  
  // Trim whitespace
  const result = resultLines.join("\n").trim()
  
  // Empty = cancelled
  if (!result) {
    return null
  }
  
  return result
}
```

### Getting Thread Context

```typescript
// src/utils/threads.ts

/**
 * Get thread comments for a specific line, formatted for editor
 */
export function getThreadForLine(
  comments: Comment[],
  filename: string,
  line: number,
  currentUser?: string
): ThreadComment[] {
  // Find all comments on this line
  const lineComments = comments.filter(
    c => c.filename === filename && c.line === line
  )
  
  if (lineComments.length === 0) {
    return []
  }
  
  // Build thread from root
  const root = lineComments.find(c => !c.inReplyTo)
  if (!root) {
    // Orphaned replies? Just return them in order
    return lineComments
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(c => ({
        author: c.author || "you",
        body: c.body,
        createdAt: c.createdAt,
        isYours: !c.author || c.author === currentUser,
      }))
  }
  
  // Recursively collect replies in order
  const thread = collectThread(root, comments)
  
  return thread.map(c => ({
    author: c.author || "you",
    body: c.body,
    createdAt: c.createdAt,
    isYours: !c.author || c.author === currentUser,
  }))
}
```

### Integration with Comment Handler

```typescript
// In app.ts handleOpenCommentEditor

async function handleOpenCommentEditor() {
  const currentFile = state.files[state.currentFileIndex]
  if (!currentFile) return

  const line = state.cursorLine
  const existingComment = getCommentForLine(state, line)
  
  // Get thread context for this line
  const threadComments = getThreadForLine(
    state.comments,
    currentFile.filename,
    line,
    state.session?.owner // current GitHub user
  )

  renderer.suspend()

  try {
    const mode = existingComment 
      ? "edit" 
      : threadComments.length > 0 
        ? "reply" 
        : "new"
    
    const commentBody = await openCommentEditor({
      diffContent: currentFile.content,
      filePath: currentFile.filename,
      line,
      existingComment: existingComment?.body,
      threadComments,
      mode,
    })

    if (commentBody !== null) {
      if (existingComment) {
        // Update existing
        const updated = { ...existingComment, body: commentBody }
        state = updateCommentInState(state, updated)
        await persistComment(updated)
      } else {
        // Create new (as reply if thread exists)
        const comment = createComment(currentFile.filename, line, commentBody)
        if (threadComments.length > 0) {
          // Link as reply to last comment in thread
          const lastInThread = threadComments[threadComments.length - 1]
          comment.inReplyTo = lastInThread.id
        }
        state = addComment(state, comment)
        await persistComment(comment)
      }
    }
  } finally {
    renderer.resume()
    render()
    setTimeout(updateIndicators, 0)
  }
}
```

### File Structure

```
src/
├── utils/
│   ├── editor.ts             # Update with thread context support
│   └── threads.ts            # Thread utilities (shared with 010)
```

## Dependencies

- Depends on thread data structure from spec 010
- Requires `author` field from spec 009 (GitHub PR fetch)
