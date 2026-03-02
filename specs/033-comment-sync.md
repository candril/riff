# 033 - Comment Sync

**Status**: Ready

## Description

Sync local changes to GitHub without submitting a new review. This handles:
1. **Edits to synced comments** - Update comments that were already posted
2. **Replies to threads** - Post replies without creating a new review
3. **Preview before sync** - Show what would be sent

This is different from "Submit Review" (`gS`) which creates a new review with new comments. Sync (`gs`) updates existing content.

## Capabilities

### P1 - MVP

- **Sync preview**: `gs` opens a preview showing pending changes
- **Edit sync**: Comments with `localEdit` are updated on GitHub via PATCH
- **Reply sync**: Local replies (`inReplyTo` set, status `local`) are posted
- **Confirmation**: Enter to sync, Esc to cancel
- **Status update**: After sync, `localEdit` is cleared, replies become `synced`
- **Error handling**: Show errors inline, allow retry

### P2 - Enhanced

- **Selective sync**: Toggle individual items to include/exclude
- **Diff view**: Show old vs new for edits
- **Dry run**: Option to preview API calls without executing

### P3 - Polish

- **Batch optimization**: Group operations where possible
- **Undo**: Revert last sync operation
- **Conflict detection**: Warn if remote changed since last fetch

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `gs` | Anywhere in PR mode | Open sync preview |
| `Enter` | In sync preview | Confirm and sync all changes |
| `Esc` | In sync preview | Cancel and close preview |
| `Space` | In sync preview (P2) | Toggle item inclusion |
| `j/k` | In sync preview | Navigate items |

## What Gets Synced

### 1. Edited Comments
Comments where `localEdit` is set (different from `body`):
- Original `body` = what's on GitHub
- `localEdit` = user's changes
- Sync: PATCH the comment with `localEdit`, then clear `localEdit` and update `body`

### 2. Local Replies  
Comments where:
- `inReplyTo` is set (points to a synced comment)
- `status` is `local`
- Sync: POST as reply to parent's `githubId`

### NOT Synced (use Submit Review instead)
- New top-level comments (`status: local`, no `inReplyTo`)
- These need a review context to be posted

## Technical Notes

### Sync Preview UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Sync Changes                                               esc  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Edits (2)                                                       │
│                                                                 │
│   src/app.ts:42  @you                                          │
│   - This should use a logger                                    │
│   + This should use a logger instead of console.log            │
│                                                                 │
│   src/utils.ts:15  @you                                        │
│   - Fix this                                                    │
│   + Fix this typo in the variable name                         │
│                                                                 │
│ Replies (1)                                                     │
│                                                                 │
│   src/app.ts:42  → @reviewer                                   │
│   Good point, will fix                                          │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Enter: Sync 3 changes                                      esc  │
└─────────────────────────────────────────────────────────────────┘
```

### Gathering Sync Items

```typescript
interface SyncItem {
  type: "edit" | "reply"
  comment: Comment
  // For edits: the new body to send
  newBody?: string
  // For replies: the parent GitHub ID
  parentGithubId?: number
}

function gatherSyncItems(comments: Comment[]): SyncItem[] {
  const items: SyncItem[] = []
  
  for (const comment of comments) {
    // Edits: synced comments with localEdit
    if (comment.status === "synced" && comment.localEdit && comment.githubId) {
      items.push({
        type: "edit",
        comment,
        newBody: comment.localEdit,
      })
    }
    
    // Replies: local comments with inReplyTo pointing to a synced comment
    if (comment.status === "local" && comment.inReplyTo) {
      const parent = comments.find(c => c.id === comment.inReplyTo)
      if (parent?.githubId) {
        items.push({
          type: "reply",
          comment,
          parentGithubId: parent.githubId,
        })
      }
    }
  }
  
  return items
}
```

### Executing Sync

```typescript
async function executeSync(
  items: SyncItem[],
  owner: string,
  repo: string,
  prNumber: number
): Promise<{ success: SyncItem[]; failed: { item: SyncItem; error: string }[] }> {
  const success: SyncItem[] = []
  const failed: { item: SyncItem; error: string }[] = []
  
  for (const item of items) {
    try {
      if (item.type === "edit" && item.newBody && item.comment.githubId) {
        const result = await updateComment(owner, repo, item.comment.githubId, item.newBody)
        if (result.success) {
          // Clear localEdit, update body
          item.comment.body = item.newBody
          item.comment.localEdit = undefined
          await saveComment(item.comment, source)
          success.push(item)
        } else {
          failed.push({ item, error: result.error || "Unknown error" })
        }
      }
      
      if (item.type === "reply" && item.parentGithubId) {
        const result = await submitReply(owner, repo, prNumber, item.comment, item.parentGithubId)
        if (result.success) {
          item.comment.status = "synced"
          item.comment.githubId = result.githubId
          item.comment.githubUrl = result.githubUrl
          await saveComment(item.comment, source)
          success.push(item)
        } else {
          failed.push({ item, error: result.error || "Unknown error" })
        }
      }
    } catch (err) {
      failed.push({ item, error: err instanceof Error ? err.message : "Unknown error" })
    }
  }
  
  return { success, failed }
}
```

### State Flow

```
Edit flow:
  synced comment (body: "original")
    ↓ user edits
  synced comment (body: "original", localEdit: "edited")
    ↓ gs sync
  synced comment (body: "edited", localEdit: undefined)

Reply flow:
  local reply (inReplyTo: "gh-123", status: "local")
    ↓ gs sync  
  synced reply (inReplyTo: "gh-123", status: "synced", githubId: 456)
```

## File Structure

```
src/
├── components/
│   └── SyncPreview.ts      # New: Sync preview modal
├── providers/
│   └── github.ts           # Already has updateComment, submitReply
└── app.ts                  # Handle gs keybinding
```
