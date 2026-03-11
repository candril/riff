# Comments View

**Status**: In Progress

## Description

Toggle between Diff View and Comments View. Both views respect the file panel selection:
- **File selected**: Show content for that file only
- **No file selected**: Show content across all files in the PR/changeset

## Out of Scope

- Inline comment expansion in diff view (separate feature)
- Real-time updates / webhooks
- Emoji reactions

## Capabilities

### P1 - MVP

- **View toggle**: `Tab` to switch between Diff View and Comments View
- **Scope by file**: Views show all content or single file based on tree selection
- **Thread display**: Comments grouped into threads with replies indented
- **Thread info**: Show author, status (local/synced), line number per comment
- **Navigate**: `j/k` to move through comments/threads
- **Jump to diff**: `Enter` on a comment to switch to Diff View at that line

### P2 - Enhanced

- **Resolved state**: Show ✓ for resolved threads
- **Reply from view**: `r` to reply to selected thread (opens editor)
- **Edit comment**: `e` on own comment to edit in `$EDITOR` (see Editor Workflow)
- **Delete comment**: `d` on own comment shows confirmation, then deletes
- **Resolve thread**: `x` to toggle resolved state on thread (see Resolve Workflow)
- **Collapse threads**: `h/l` or `-/+` to collapse/expand threads
- **File headers**: When showing all files, show file separators

### P3 - Polish

- **Filter by status**: Show only local/pending/synced comments
- **Filter by author**: Show only comments from specific users
- **Search comments**: `/` to search comment text

## Technical Notes

### View Scoping Pattern

Both Diff View and Comments View follow the same scoping logic:

**Default: No file selected → Show everything**

The file panel starts with no selection (or a virtual "All files" entry at top). User must explicitly select a file to scope the view.

```typescript
// Determine what to show based on file selection
function getViewScope(state: AppState): { mode: "all" | "file"; filename?: string } {
  // selectedFileIndex is null by default (no file selected = show all)
  if (state.selectedFileIndex === null) {
    return { mode: "all" }
  }
  
  const file = state.files[state.selectedFileIndex]
  if (file) {
    return { mode: "file", filename: file.filename }
  }
  
  return { mode: "all" }
}
```

**File panel behavior:**
- Default selection: none (shows "All files" or no highlight)
- Press `Enter` on a file to select it → views scope to that file
- Press `Escape` or select "All files" entry to clear selection → show all
- Tree navigation (`j/k`) moves highlight but doesn't change selection until `Enter`
```

### Comments View - All Files

When no file is selected, show comments grouped by file:

```
┌─────────────────────────────────────────────────────────────────┐
│ Comments │ All files (12 threads)                               │
├─────────────────────────────────────────────────────────────────┤
│ src/app.ts ─────────────────────────────────────────────────────│
│                                                                 │
│   L42 │ @octocat [synced]                                       │
│       │ This should use a logger instead of console.log         │
│       │                                                         │
│       └─ @you [synced]                                          │
│          Good point, fixed in abc123                            │
│                                                                 │
│   L58 │ @reviewer [synced]                                      │
│       │ Missing null check here                                 │
│       │                                                         │
│       └─ @you [local]                                           │
│          Will fix                                               │
│                                                                 │
│ src/utils/parser.ts ────────────────────────────────────────────│
│                                                                 │
│   L12 │ @reviewer [synced] ✓                                    │
│       │ Typo in variable name                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Tab: diff  j/k: nav  Enter: jump  r: reply  e: edit  d: del  x: resolve │
└─────────────────────────────────────────────────────────────────────────┘
```

### Comments View - Single File

When a file is selected, show only that file's comments (no file headers):

```
┌─────────────────────────────────────────────────────────────────┐
│ Comments │ src/app.ts (2 threads)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   L42 │ @octocat [synced]                                       │
│       │ This should use a logger instead of console.log         │
│       │                                                         │
│       └─ @you [synced]                                          │
│          Good point, fixed in abc123                            │
│                                                                 │
│   L58 │ @reviewer [synced]                                      │
│       │ Missing null check here                                 │
│       │                                                         │
│       └─ @you [local]                                           │
│          Will fix                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Tab: diff  j/k: nav  Enter: jump  r: reply  e: edit  d: del  x: resolve │
└─────────────────────────────────────────────────────────────────────────┘
```

### Diff View - All Files (Future)

Currently diff view shows one file at a time. For consistency, when no file is selected, it could show all hunks concatenated with file headers:

```
┌─────────────────────────────────────────────────────────────────┐
│ Diff │ All files (3 files, 8 hunks)                             │
├─────────────────────────────────────────────────────────────────┤
│ ─── src/app.ts ─────────────────────────────────────────────────│
│   40 │   const result = calculate()                             │
│ + 41 │   console.log("debug:", result)                          │
│   42 │   return result                                          │
│                                                                 │
│ @@ -58,6 +59,8 @@                                               │
│   58 │   if (value) {                                           │
│ + 59 │     validate(value)                                      │
│   60 │     process(value)                                       │
│                                                                 │
│ ─── src/utils/parser.ts ────────────────────────────────────────│
│   12 │   const data = parse(input)                              │
│ - 13 │   const vaule = transform(data)                          │
│ + 13 │   const value = transform(data)                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Tab: comments  j/k: scroll  ]f/[f: file  c: comment             │
└─────────────────────────────────────────────────────────────────┘
```

### State Updates

```typescript
// src/state.ts
export type ViewMode = "diff" | "comments"

export interface AppState {
  // ... existing fields
  viewMode: ViewMode
  
  // Comments view navigation
  selectedCommentIndex: number  // Which comment/thread is selected
}

// Get comments for current view scope
export function getVisibleComments(state: AppState): Comment[] {
  const scope = getViewScope(state)
  
  if (scope.mode === "file") {
    return state.comments.filter(c => c.filename === scope.filename)
  }
  
  return state.comments
}

// Get threads for current view scope  
export function getVisibleThreads(state: AppState): Thread[] {
  const comments = getVisibleComments(state)
  return groupIntoThreads(comments)
}
```

### Thread Structure

```typescript
// src/utils/threads.ts

export interface Thread {
  id: string                    // Root comment's ID
  filename: string
  line: number
  comments: Comment[]           // Root + replies, chronological
  resolved: boolean
}

/**
 * Group comments into threads
 */
export function groupIntoThreads(comments: Comment[]): Thread[] {
  // Find root comments (no inReplyTo, or inReplyTo not in our set)
  const commentIds = new Set(comments.map(c => c.id))
  const roots = comments.filter(c => !c.inReplyTo || !commentIds.has(c.inReplyTo))
  
  // Build reply chains
  const replyMap = new Map<string, Comment[]>()
  for (const c of comments) {
    if (c.inReplyTo && commentIds.has(c.inReplyTo)) {
      const replies = replyMap.get(c.inReplyTo) || []
      replies.push(c)
      replyMap.set(c.inReplyTo, replies)
    }
  }
  
  // Build threads
  return roots.map(root => {
    const threadComments = collectReplies(root, replyMap)
    return {
      id: root.id,
      filename: root.filename,
      line: root.line,
      comments: threadComments,
      resolved: false, // TODO: track from GitHub
    }
  }).sort((a, b) => {
    // Sort by filename, then line
    const fileCompare = a.filename.localeCompare(b.filename)
    if (fileCompare !== 0) return fileCompare
    return a.line - b.line
  })
}

function collectReplies(root: Comment, replyMap: Map<string, Comment[]>): Comment[] {
  const result = [root]
  const queue = [root.id]
  
  while (queue.length > 0) {
    const id = queue.shift()!
    const replies = replyMap.get(id) || []
    for (const reply of replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      result.push(reply)
      queue.push(reply.id)
    }
  }
  
  return result
}
```

### Comments View Component

```typescript
// src/components/CommentsView.ts

export interface CommentsViewProps {
  threads: Thread[]
  selectedIndex: number
  scope: { mode: "all" | "file"; filename?: string }
}

export function CommentsView({ threads, selectedIndex, scope }: CommentsViewProps) {
  // Flatten threads into navigable items
  const items = flattenForNavigation(threads)
  
  // Header text
  const headerText = scope.mode === "file"
    ? `${scope.filename} (${threads.length} threads)`
    : `All files (${threads.length} threads)`
  
  return Box(
    { width: "100%", height: "100%", flexDirection: "column" },
    
    // Header
    Header({ title: "Comments", subtitle: headerText }),
    
    // Scrollable content
    ScrollBox(
      { id: "comments-scroll", flexGrow: 1, scrollY: true },
      Box(
        { flexDirection: "column", width: "100%", paddingX: 1 },
        ...renderThreads(threads, selectedIndex, scope.mode === "all")
      )
    ),
    
    // Status bar
    StatusBar({ 
      hints: ["Tab: diff", "j/k: nav", "Enter: jump", "r: reply", "e: edit", "d: del", "x: resolve"] 
    })
  )
}

function renderThreads(
  threads: Thread[], 
  selectedIndex: number, 
  showFileHeaders: boolean
): Element[] {
  const elements: Element[] = []
  let currentFile = ""
  let itemIndex = 0
  
  for (const thread of threads) {
    // File header when showing all files
    if (showFileHeaders && thread.filename !== currentFile) {
      currentFile = thread.filename
      elements.push(FileHeader({ filename: currentFile }))
    }
    
    // Render thread
    for (let i = 0; i < thread.comments.length; i++) {
      const comment = thread.comments[i]
      const isRoot = i === 0
      const isSelected = itemIndex === selectedIndex
      
      elements.push(
        CommentRow({
          comment,
          isRoot,
          isSelected,
          threadLine: thread.line,
        })
      )
      
      itemIndex++
    }
    
    // Spacing between threads
    elements.push(Box({ height: 1 }))
  }
  
  return elements
}
```

### Navigation

```typescript
// Navigable items in comments view
type NavItem = {
  type: "comment"
  comment: Comment
  thread: Thread
  indexInThread: number
}

function flattenForNavigation(threads: Thread[]): NavItem[] {
  const items: NavItem[] = []
  
  for (const thread of threads) {
    for (let i = 0; i < thread.comments.length; i++) {
      items.push({
        type: "comment",
        comment: thread.comments[i],
        thread,
        indexInThread: i,
      })
    }
  }
  
  return items
}
```

### Keyboard Handling

```typescript
// When viewMode === "comments"
switch (key.name) {
  case "tab":
    state = { ...state, viewMode: "diff" }
    render()
    break
    
  case "j":
  case "down":
    const items = flattenForNavigation(getVisibleThreads(state))
    state = {
      ...state,
      selectedCommentIndex: Math.min(
        state.selectedCommentIndex + 1,
        items.length - 1
      )
    }
    render()
    break
    
  case "k":
  case "up":
    state = {
      ...state,
      selectedCommentIndex: Math.max(state.selectedCommentIndex - 1, 0)
    }
    render()
    break
    
  case "enter":
  case "return":
    // Jump to diff view at this comment's location
    const navItems = flattenForNavigation(getVisibleThreads(state))
    const selected = navItems[state.selectedCommentIndex]
    if (selected) {
      // Find file index
      const fileIndex = state.files.findIndex(
        f => f.filename === selected.comment.filename
      )
      if (fileIndex >= 0) {
        state = {
          ...state,
          viewMode: "diff",
          currentFileIndex: fileIndex,
          cursorLine: selected.comment.line,
        }
        render()
        // Scroll to line
        setTimeout(() => {
          scrollBox?.scrollTo(selected.comment.line - 5)
          updateIndicators()
        }, 0)
      }
    }
    break
    
  case "r":
    // Reply to current thread
    const replyItems = flattenForNavigation(getVisibleThreads(state))
    const replyTarget = replyItems[state.selectedCommentIndex]
    if (replyTarget) {
      await handleReplyToThread(replyTarget.thread)
    }
    break
    
  case "e":
    // Edit own comment in $EDITOR
    const editItems = flattenForNavigation(getVisibleThreads(state))
    const editTarget = editItems[state.selectedCommentIndex]
    if (editTarget && isOwnComment(editTarget.comment)) {
      await handleEditComment(editTarget.comment)
    }
    break
    
  case "d":
    // Delete own comment (with confirmation)
    const deleteItems = flattenForNavigation(getVisibleThreads(state))
    const deleteTarget = deleteItems[state.selectedCommentIndex]
    if (deleteTarget && isOwnComment(deleteTarget.comment)) {
      await handleDeleteComment(deleteTarget.comment)
    }
    break
    
  case "x":
    // Toggle resolved state on thread
    const resolveItems = flattenForNavigation(getVisibleThreads(state))
    const resolveTarget = resolveItems[state.selectedCommentIndex]
    if (resolveTarget) {
      await handleToggleResolved(resolveTarget.thread)
    }
    break
}
```

### Edit Comment Workflow

The `e` key opens the selected comment in `$EDITOR` for editing:

```typescript
async function handleEditComment(comment: Comment) {
  // Only allow editing own comments
  if (!isOwnComment(comment)) return
  
  // Create temp file with comment body
  const tmpFile = `/tmp/riff-edit-${comment.id}.md`
  await Bun.write(tmpFile, comment.body)
  
  // Suspend renderer, open editor
  renderer.suspend()
  const editor = Bun.env.EDITOR || "nvim"
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit", 
    stderr: "inherit",
  })
  await proc.exited
  renderer.resume()
  
  // Read edited content
  const newBody = await Bun.file(tmpFile).text()
  
  // Update if changed
  if (newBody.trim() !== comment.body.trim()) {
    updateComment(comment.id, { body: newBody.trim() })
  }
  
  // Cleanup
  await unlink(tmpFile)
}

function isOwnComment(comment: Comment): boolean {
  // Local comments are always own
  if (comment.status === "local") return true
  
  // For synced comments, check author matches current user
  const currentUser = state.currentUser // from GitHub auth
  return comment.author === currentUser
}
```

### Delete Comment Workflow

The `d` key shows a confirmation before deleting:

```typescript
async function handleDeleteComment(comment: Comment) {
  // Only allow deleting own comments
  if (!isOwnComment(comment)) return
  
  // Show confirmation inline
  const confirmed = await showConfirmation({
    message: "Delete this comment?",
    confirmKey: "d",  // Press d again to confirm
    cancelKey: "escape",
  })
  
  if (!confirmed) return
  
  // For local comments, just remove from state
  if (comment.status === "local") {
    state = {
      ...state,
      comments: state.comments.filter(c => c.id !== comment.id)
    }
    render()
    return
  }
  
  // For synced comments on GitHub PRs, delete via API
  if (comment.githubId && state.prInfo) {
    const { owner, repo } = state.prInfo
    await $`gh api repos/${owner}/${repo}/pulls/comments/${comment.githubId} -X DELETE`
    
    // Remove from local state
    state = {
      ...state,
      comments: state.comments.filter(c => c.id !== comment.id)
    }
    render()
  }
}
```

### Confirmation UI

When `d` is pressed on a deletable comment, show inline confirmation:

```
┌─────────────────────────────────────────────────────────────────┐
│ Comments │ src/app.ts (2 threads)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   L42 │ @octocat [synced]                                       │
│       │ This should use a logger instead of console.log         │
│       │                                                         │
│       └─ @you [local] ◀ DELETE? (d=confirm, Esc=cancel)         │
│          Will fix                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ d: confirm delete  Esc: cancel                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Resolve Thread Workflow

The `x` key toggles the resolved state of a thread:

```typescript
async function handleToggleResolved(thread: Thread) {
  const newResolved = !thread.resolved
  
  // For local-only threads, just update state
  if (isLocalThread(thread)) {
    updateThread(thread.id, { resolved: newResolved })
    render()
    return
  }
  
  // For GitHub threads, use the GraphQL API
  // Note: REST API doesn't support resolve/unresolve, must use GraphQL
  if (thread.githubThreadId && state.prInfo) {
    const mutation = newResolved ? "resolveReviewThread" : "unresolveReviewThread"
    
    await $`gh api graphql -f query='
      mutation {
        ${mutation}(input: { threadId: "${thread.githubThreadId}" }) {
          thread {
            isResolved
          }
        }
      }
    '`
    
    // Update local state
    updateThread(thread.id, { resolved: newResolved })
    render()
  }
}

function isLocalThread(thread: Thread): boolean {
  // Thread is local if root comment is local
  const rootComment = thread.comments[0]
  return rootComment?.status === "local"
}
```

### Thread State

```typescript
export interface Thread {
  id: string                    // Root comment's ID
  githubThreadId?: string       // GitHub's node_id for GraphQL API
  filename: string
  line: number
  comments: Comment[]           // Root + replies, chronological
  resolved: boolean
}
```

### Resolved Visual Indicator

```
│   L42 │ @octocat [synced] ✓                    # ✓ = resolved
│       │ This looks good now                    
│                                                
│   L58 │ @reviewer [synced]                     # No ✓ = unresolved
│       │ Missing null check here                
```

When viewing resolved threads:
- Thread header shows `✓` indicator
- Optionally dim resolved threads (configurable)
- `x` on resolved thread unresolves it

### Comment Permissions

```typescript
interface CommentPermissions {
  canEdit: boolean
  canDelete: boolean
}

function getCommentPermissions(comment: Comment, state: AppState): CommentPermissions {
  const isOwn = isOwnComment(comment)
  
  return {
    // Can edit own local comments, or own synced comments on GitHub
    canEdit: isOwn,
    // Can delete own local comments, or own synced comments on GitHub
    canDelete: isOwn,
  }
}
```

### Visual Indicators

Comments show available actions based on permissions:

```
│   L42 │ @octocat [synced]              # No indicators (not own)
│       │ Some comment text              
│                                        
│   L58 │ @you [local] ✎                 # ✎ = editable
│       │ My local comment               
```

The `✎` indicator appears on own comments to show they're editable.

### File Structure

```
src/
├── state.ts                  # Add viewMode, selectedCommentIndex
├── utils/
│   └── threads.ts            # Thread grouping utilities
└── components/
    └── CommentsView.ts       # Comments view component
```

### Interaction with File Panel

The file panel works the same in both views:
- `Ctrl+b` toggles file panel visibility
- `Enter` on a file selects it → views scope to that file
- `Escape` clears selection → views show all content
- Default state: no file selected (show all)
- The panel shows comment counts per file in both views

### State Changes

```typescript
export interface AppState {
  // ... existing
  
  // null = no file selected, show all
  // number = index of selected file, scope views to that file
  selectedFileIndex: number | null
  
  // Tree highlight (for navigation) is separate from selection
  treeHighlightIndex: number
}

// Initial state
selectedFileIndex: null,  // Default: show all
treeHighlightIndex: 0,    // Highlight starts at first item
```
