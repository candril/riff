# 034 - Delete Comments & Pending Reviews

**Status**: Draft

## Description

Delete local comments, synced comments (from GitHub), and discard pending reviews with safeguard confirmation dialogs. Destructive actions require explicit confirmation to prevent accidental data loss.

## Out of Scope

- Bulk delete operations (delete all comments at once)
- Undo/restore deleted comments
- Archiving comments instead of deleting

## Capabilities

### P1 - MVP

- **Delete local comment**: `d` on a local comment shows confirmation, then deletes from storage
- **Delete synced comment**: `d` on own synced comment shows confirmation, then deletes from GitHub
- **Confirmation dialog**: All deletes require pressing the trigger key again (e.g., `d` then `d`) or Enter
- **Cancel delete**: `Esc` cancels the pending delete operation
- **Visual feedback**: Selected item shows delete confirmation state inline
- **Error handling**: Show toast on delete failure

### P2 - Enhanced

- **Discard pending review**: `gD` discards all pending (unsent) comments
- **Delete thread**: Option to delete entire thread (all replies) when deleting root comment
- **Keyboard hints**: Status bar updates to show confirmation keys
- **Delete from diff view**: `d` works on commented lines in diff view, not just comments view

### P3 - Polish

- **Undo toast**: "Comment deleted. Press u to undo" (brief window)
- **Soft delete**: Mark as deleted locally, sync deletion on next push
- **Delete confirmation setting**: Config option to skip confirmation for local-only comments

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `d` | On own comment (diff/comments view) | Start delete confirmation |
| `d` | In delete confirmation state | Confirm and delete |
| `Enter` | In delete confirmation state | Confirm and delete |
| `Esc` | In delete confirmation state | Cancel delete |
| `gD` | Anywhere in PR mode (P2) | Start discard pending review |
| `gD` / `Enter` | In discard confirmation | Confirm discard |

## Technical Notes

### Confirmation Dialog States

The confirmation is inline (no modal popup). The comment row transforms to show the confirmation prompt:

```typescript
interface DeleteConfirmState {
  active: boolean
  targetId: string | null      // Comment ID being deleted
  targetType: "comment" | "review"
}

// In app state
interface AppState {
  // ... existing
  deleteConfirm: DeleteConfirmState
}
```

### Confirmation UI - Comments View

When `d` is pressed on a deletable comment:

```
Before:
│   L42 │ @you [local]                                            │
│       │ This should use a logger instead of console.log         │

During confirmation:
│   L42 │ @you [local]                                            │
│       │ This should use a logger instead of console.log         │
│       │                                                         │
│       │ Delete this comment? (d/Enter=confirm, Esc=cancel)      │
```

Or more compact inline:

```
Before:
│       └─ @you [local]                                           │
│          Will fix                                               │

During confirmation:
│       └─ @you [local] DELETE? (d=confirm, Esc=cancel)           │
│          Will fix                                               │
```

### Confirmation UI - Diff View

When `d` is pressed on a line with own comments:

```
Before:
  42 + │   console.log("debug")                    ● 1 comment

During confirmation:
  42 + │   console.log("debug")                    DELETE? (d/Esc)
```

### Discard Pending Review UI (P2)

When `gD` is pressed with pending comments:

```
┌─────────────────────────────────────────────────────────────────┐
│ Discard Pending Review?                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ This will delete 5 unsent comments:                             │
│                                                                 │
│   src/app.ts:42    "This should use a logger..."                │
│   src/app.ts:58    "Missing null check"                         │
│   src/utils.ts:12  "Typo in variable name"                      │
│   ... and 2 more                                                │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ gD/Enter: Discard all    Esc: Cancel                            │
└─────────────────────────────────────────────────────────────────┘
```

### Permission Checks

```typescript
interface DeletePermissions {
  canDelete: boolean
  reason?: string  // If can't delete, why not
}

function getDeletePermissions(comment: Comment, state: AppState): DeletePermissions {
  // Local comments can always be deleted
  if (comment.status === "local") {
    return { canDelete: true }
  }
  
  // Pending comments can be deleted (not yet on GitHub)
  if (comment.status === "pending") {
    return { canDelete: true }
  }
  
  // Synced comments: only if own
  if (comment.status === "synced") {
    const currentUser = state.username
    if (comment.author === currentUser) {
      return { canDelete: true }
    }
    return { canDelete: false, reason: "Cannot delete others' comments" }
  }
  
  return { canDelete: false, reason: "Unknown comment status" }
}
```

### Delete Comment Flow

```typescript
async function handleDeleteComment(comment: Comment) {
  const permissions = getDeletePermissions(comment, state)
  if (!permissions.canDelete) {
    showToast({ message: permissions.reason!, type: "error" })
    return
  }
  
  // Enter confirmation state
  state = {
    ...state,
    deleteConfirm: {
      active: true,
      targetId: comment.id,
      targetType: "comment",
    }
  }
  render()
  
  // Wait for confirmation (handled in keyboard loop)
}

async function confirmDeleteComment(commentId: string) {
  const comment = state.comments.find(c => c.id === commentId)
  if (!comment) return
  
  try {
    // Delete from GitHub if synced
    if (comment.status === "synced" && comment.githubId && state.prInfo) {
      const { owner, repo } = state.prInfo
      await $`gh api repos/${owner}/${repo}/pulls/comments/${comment.githubId} -X DELETE`
    }
    
    // Delete local file
    await deleteCommentFile(comment.id, source)
    
    // Update state
    state = deleteComment(state, commentId)
    state = { ...state, deleteConfirm: { active: false, targetId: null, targetType: "comment" } }
    
    showToast({ message: "Comment deleted", type: "success" })
    render()
  } catch (err) {
    state = { ...state, deleteConfirm: { active: false, targetId: null, targetType: "comment" } }
    showToast({ message: `Delete failed: ${err}`, type: "error" })
    render()
  }
}

function cancelDelete() {
  state = {
    ...state,
    deleteConfirm: { active: false, targetId: null, targetType: "comment" }
  }
  render()
}
```

### Discard Pending Review Flow (P2)

```typescript
function getPendingComments(state: AppState): Comment[] {
  return state.comments.filter(c => 
    c.status === "local" || c.status === "pending"
  )
}

async function handleDiscardPendingReview() {
  const pending = getPendingComments(state)
  if (pending.length === 0) {
    showToast({ message: "No pending comments to discard", type: "info" })
    return
  }
  
  // Enter confirmation state
  state = {
    ...state,
    deleteConfirm: {
      active: true,
      targetId: null,  // null = all pending
      targetType: "review",
    }
  }
  render()
}

async function confirmDiscardReview() {
  const pending = getPendingComments(state)
  
  try {
    // Delete all local files
    for (const comment of pending) {
      await deleteCommentFile(comment.id, source)
    }
    
    // Update state
    state = {
      ...state,
      comments: state.comments.filter(c => 
        c.status !== "local" && c.status !== "pending"
      ),
      deleteConfirm: { active: false, targetId: null, targetType: "comment" }
    }
    
    showToast({ message: `Discarded ${pending.length} comments`, type: "success" })
    render()
  } catch (err) {
    state = { ...state, deleteConfirm: { active: false, targetId: null, targetType: "comment" } }
    showToast({ message: `Discard failed: ${err}`, type: "error" })
    render()
  }
}
```

### Keyboard Handling

```typescript
// In main keyboard handler
if (state.deleteConfirm.active) {
  // Confirmation state captures all input
  switch (key.name) {
    case "escape":
      cancelDelete()
      return
      
    case "return":
    case "enter":
      if (state.deleteConfirm.targetType === "review") {
        await confirmDiscardReview()
      } else {
        await confirmDeleteComment(state.deleteConfirm.targetId!)
      }
      return
      
    case "d":
      // d again confirms single comment delete
      if (state.deleteConfirm.targetType === "comment") {
        await confirmDeleteComment(state.deleteConfirm.targetId!)
      }
      return
      
    case "g":
      // gD again confirms review discard (P2)
      // Track g press, wait for D
      return
      
    default:
      // Any other key cancels
      cancelDelete()
      return
  }
}

// Normal state - initiate delete
if (key.name === "d") {
  const comment = getCurrentComment()  // Works in both diff and comments view
  if (comment) {
    await handleDeleteComment(comment)
  }
}
```

### Status Bar Updates

During confirmation, update status bar hints:

```typescript
function getStatusBarHints(): string[] {
  if (state.deleteConfirm.active) {
    if (state.deleteConfirm.targetType === "review") {
      return ["gD/Enter: confirm discard", "Esc: cancel"]
    }
    return ["d/Enter: confirm delete", "Esc: cancel"]
  }
  // ... normal hints
}
```

### Component Updates

```typescript
// In CommentRow component
function CommentRow({ comment, isSelected, deleteConfirmActive }: CommentRowProps) {
  const showConfirm = isSelected && deleteConfirmActive
  
  return Box(
    { flexDirection: "column" },
    // Comment content
    Box(
      { flexDirection: "row" },
      Text({ content: `@${comment.author}`, fg: colors.author }),
      Text({ content: ` [${comment.status}]`, fg: colors.dim }),
      showConfirm 
        ? Text({ content: " DELETE?", fg: colors.error, bold: true })
        : null,
    ),
    Text({ content: comment.body, fg: colors.text }),
    showConfirm
      ? Text({ 
          content: "(d/Enter=confirm, Esc=cancel)", 
          fg: colors.warning,
          marginTop: 1,
        })
      : null,
  )
}
```

### GitHub API

```typescript
// Delete a PR comment
async function deleteGitHubComment(
  owner: string,
  repo: string,
  commentId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await $`gh api repos/${owner}/${repo}/pulls/comments/${commentId} -X DELETE`
    return { success: true }
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    }
  }
}

// Delete a pending review (all pending comments)
async function deletePendingReview(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId} -X DELETE`
    return { success: true }
  } catch (err) {
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Unknown error" 
    }
  }
}
```

### File Structure

```
src/
├── state.ts                  # Add DeleteConfirmState to AppState
├── components/
│   ├── CommentsViewPanel.ts  # Update to show confirmation state
│   ├── VimDiffView.ts        # Update to show confirmation on comment lines
│   └── DiscardReviewModal.ts # New: Modal for gD confirmation (P2)
├── providers/
│   └── github.ts             # Add deleteGitHubComment function
└── app.ts                    # Handle d and gD keybindings
```

### Edge Cases

1. **Delete root comment with replies**: 
   - Local: Delete just the root, replies become orphaned (or delete all)
   - GitHub: GitHub automatically deletes thread when root deleted

2. **Delete while offline (PR mode)**:
   - Queue deletion for later sync
   - Mark comment as "pending_delete" status
   - Show visual indicator

3. **Concurrent edit during delete**:
   - If confirmation takes too long, re-fetch before delete
   - Or accept optimistic delete

4. **Delete last comment in view**:
   - Move selection up after delete
   - If no comments left, switch to diff view

### Configuration (P3)

```toml
[confirm]
# Skip confirmation for local-only comments
skip_local_delete = false

# Timeout for confirmation (ms) - auto-cancel if exceeded
confirm_timeout = 10000
```
