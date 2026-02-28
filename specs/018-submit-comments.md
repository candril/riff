# 015 - Submit Comments to GitHub

**Status**: Ready

## Description

Submit local comments to GitHub PRs. Two modes:
1. **Single comment** - Post one comment immediately (like GitHub's "Add single comment")
2. **Submit review** - Preview all pending comments, write overall review comment, then post as a batch review

## Out of Scope

- Editing already-synced comments on GitHub
- Deleting comments from GitHub

## Capabilities

### P1 - MVP

- **Submit single comment**: `S` on a local comment posts it immediately to GitHub
- **Preview review**: `gS` opens a preview of all local comments that will be submitted
- **Overall comment**: In preview, write an overall review comment (summary, LGTM, etc.)
- **Review action**: Choose Comment, Approve, or Request Changes
- **Submit review**: Confirm to submit all comments + overall comment as a review batch
- **Status update**: After submit, comment status changes from `local` to `synced`
- **Error handling**: Show error message if submission fails

### P2 - Enhanced

- **Pending review mode**: Comments added while in review mode are `pending` until batch submitted
- **Cancel review**: Discard pending review without submitting
- **Partial submit**: Select which comments to include in review

### P3 - Polish

- **Reply threading**: Maintain thread structure when submitting replies
- **Retry failed**: Re-attempt submission of failed comments
- **Offline queue**: Queue comments for submission when back online

## Keyboard Bindings

| Key | Context | Action |
|-----|---------|--------|
| `S` | On local comment (diff view) | Submit single comment immediately |
| `S` | On local comment (comments view) | Submit single comment immediately |
| `gS` | Anywhere in PR mode | Open review submission flow |
| `Enter` | In review preview | Confirm and submit review |
| `Esc` | In review preview | Cancel and close preview |
| `Tab` | In review preview | Cycle review action (Comment/Approve/Request Changes) |

## Technical Notes

### Review Preview UI

When pressing `gS`, show a modal/overlay with:

```
┌─────────────────────────────────────────────────────────────────┐
│ Submit Review (3 comments)                                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ src/app.ts:42                                                   │
│   This should use a logger instead of console.log              │
│                                                                 │
│ src/app.ts:58                                                   │
│   Missing null check here                                       │
│                                                                 │
│ src/utils/parser.ts:12                                          │
│   Typo in variable name                                         │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Enter: Submit review    Esc: Cancel                             │
└─────────────────────────────────────────────────────────────────┘
```

### GitHub API

Use `gh` CLI for all GitHub operations:

```typescript
// Submit a single comment (immediately visible)
async function submitSingleComment(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment
): Promise<{ id: number; url: string }> {
  // For new comments (not replies)
  const result = await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/comments \
    -f body=${comment.body} \
    -f path=${comment.filename} \
    -f line=${comment.line} \
    -f side=${comment.side} \
    -f commit_id=${commitSha}`.json()
  
  return { id: result.id, url: result.html_url }
}

// Submit a review with multiple comments
async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  comments: Comment[],
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT"
): Promise<void> {
  const reviewComments = comments.map(c => ({
    path: c.filename,
    line: c.line,
    side: c.side,
    body: c.body,
  }))
  
  await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/reviews \
    -f event=${event} \
    -f body="" \
    --input -`.text({ input: JSON.stringify({ comments: reviewComments }) })
}
```

### Reply Handling

When submitting a reply (comment with `inReplyTo`):

```typescript
// Reply to existing thread
async function submitReply(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment
): Promise<{ id: number; url: string }> {
  // Find the GitHub thread ID from the parent comment
  const parentComment = findComment(comment.inReplyTo)
  if (!parentComment?.githubId) {
    throw new Error("Cannot reply to unsynced comment")
  }
  
  const result = await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/comments/${parentComment.githubId}/replies \
    -f body=${comment.body}`.json()
  
  return { id: result.id, url: result.html_url }
}
```

### State Updates

After successful submission:

```typescript
function markCommentSynced(
  comment: Comment,
  githubId: number,
  githubUrl: string
): Comment {
  return {
    ...comment,
    status: "synced",
    githubId,
    githubUrl,
  }
}
```

### Error Handling

```typescript
async function submitWithRetry(
  submitFn: () => Promise<void>,
  maxRetries: number = 2
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await submitFn()
      return { success: true }
    } catch (err) {
      if (i === maxRetries) {
        return { 
          success: false, 
          error: err instanceof Error ? err.message : "Unknown error" 
        }
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * (i + 1)))
    }
  }
  return { success: false, error: "Max retries exceeded" }
}
```

### File Structure

```
src/
├── providers/
│   └── github.ts             # Add submitSingleComment, submitReview, submitReply
├── components/
│   └── ReviewPreview.ts      # New: Review preview modal
└── app.ts                    # Handle S and gS keybindings
```

### Commit SHA Requirement

GitHub requires `commit_id` when creating PR comments. Get from PR info:

```typescript
// Already have this from PR fetch
const commitSha = state.prInfo?.headSha

// Or fetch if needed
async function getPrHeadSha(prNumber: number): Promise<string> {
  const result = await $`gh pr view ${prNumber} --json headRefOid`.json()
  return result.headRefOid
}
```
