# GitHub Comments

**Status**: Ready

## Description

When viewing a GitHub PR, allow submitting comments individually (like GitHub's "Add single comment") or as part of a full review. Comments can be submitted one at a time without starting a formal review.

## Out of Scope

- PR approval/request changes (separate from commenting)
- Resolving/unresolving threads
- Reacting to comments (emoji reactions)

## Capabilities

### P1 - MVP

- **Single comment**: Submit comment immediately to GitHub (like "Add single comment")
- **Comment indicator**: Show which comments are local vs synced
- **Submit shortcut**: `Ctrl+Enter` to submit current comment directly
- **Sync status**: `[local]` / `[synced]` badge on comments

### P2 - Batch Review

- **Start review**: Collect comments locally, submit as batch review
- **Review mode toggle**: Switch between "single comment" and "review" mode
- **Pending review count**: Show "5 pending in review" indicator
- **Submit review**: Submit all pending comments as a review

### P3 - Polish

- **Edit synced comments**: Edit comments already on GitHub
- **Delete synced comments**: Remove comments from GitHub
- **Reply to threads**: Reply to existing comment threads
- **Suggest changes**: GitHub's suggestion syntax support

## Technical Notes

### Comment Submission Modes

| Mode | Behavior | GitHub Equivalent |
|------|----------|-------------------|
| Single | Submit immediately, visible to all | "Add single comment" button |
| Review | Collect locally, submit together | "Start a review" → "Submit review" |

### Data Structure Updates

```typescript
// src/types.ts
export interface Comment {
  id: string
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
  body: string
  createdAt: string
  
  // Sync status
  status: "local" | "pending_review" | "synced"
  githubId?: number           // GitHub comment ID once synced
  githubUrl?: string          // Link to comment on GitHub
  
  // For replies
  inReplyTo?: string          // Parent comment ID
  threadId?: string           // GitHub thread ID
}

export interface ReviewSession {
  id: string
  source: string              // "gh:owner/repo#123"
  createdAt: string
  comments: Comment[]
  fileStatuses: FileReviewStatus[]
  
  // GitHub-specific
  prNumber?: number
  owner?: string
  repo?: string
  reviewMode: "single" | "review"  // Current submission mode
  pendingReviewId?: string         // GitHub pending review ID
}
```

### GitHub API via `gh` CLI

```typescript
// src/providers/github.ts
import { $ } from "bun"

// Submit a single comment (immediately visible)
export async function submitSingleComment(
  owner: string,
  repo: string,
  prNumber: number,
  comment: Comment
): Promise<{ id: number; url: string }> {
  const result = await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/comments \
    -f body=${comment.body} \
    -f path=${comment.filename} \
    -f line=${comment.line} \
    -f side=${comment.side}`.json()
  
  return {
    id: result.id,
    url: result.html_url,
  }
}

// Start a pending review (comments not visible until submitted)
export async function startReview(
  owner: string,
  repo: string,
  prNumber: number
): Promise<string> {
  const result = await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/reviews \
    -f event=PENDING`.json()
  
  return result.id
}

// Add comment to pending review
export async function addReviewComment(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: string,
  comment: Comment
): Promise<{ id: number }> {
  const result = await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/comments \
    -f body=${comment.body} \
    -f path=${comment.filename} \
    -f line=${comment.line} \
    -f side=${comment.side}`.json()
  
  return { id: result.id }
}

// Submit the review (makes all pending comments visible)
export async function submitReview(
  owner: string,
  repo: string,
  prNumber: number,
  reviewId: string,
  event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT"
): Promise<void> {
  await $`gh api \
    repos/${owner}/${repo}/pulls/${prNumber}/reviews/${reviewId}/events \
    -f event=${event}`
}
```

### Submit Comment Flow

```typescript
// src/actions/comments.ts
export async function submitComment(
  session: ReviewSession,
  comment: Comment
): Promise<Comment> {
  if (!session.prNumber || !session.owner || !session.repo) {
    throw new Error("Not connected to a GitHub PR")
  }
  
  if (session.reviewMode === "single") {
    // Submit immediately
    const result = await submitSingleComment(
      session.owner,
      session.repo,
      session.prNumber,
      comment
    )
    
    return {
      ...comment,
      status: "synced",
      githubId: result.id,
      githubUrl: result.url,
    }
  } else {
    // Add to pending review
    if (!session.pendingReviewId) {
      session.pendingReviewId = await startReview(
        session.owner,
        session.repo,
        session.prNumber
      )
    }
    
    const result = await addReviewComment(
      session.owner,
      session.repo,
      session.prNumber,
      session.pendingReviewId,
      comment
    )
    
    return {
      ...comment,
      status: "pending_review",
      githubId: result.id,
    }
  }
}
```

### UI: Comment Input with Submit Option

```
┌─ Add comment ─────────────────────────────────────────────────┐
│                                                               │
│ This should use a logger instead of console.log              │
│                                                               │
├───────────────────────────────────────────────────────────────┤
│ Enter: save local  Ctrl+Enter: submit to GitHub  Esc: cancel │
└───────────────────────────────────────────────────────────────┘
```

```typescript
// In comment input handler
function handleCommentInputKey(key: KeyEvent, commentText: string) {
  if (key.name === "enter" && key.ctrl) {
    // Submit directly to GitHub
    const comment = createComment(currentFile, currentLine, commentText)
    const synced = await submitComment(session, comment)
    addComment(synced)
    showNotification(`Comment submitted to GitHub`)
  } else if (key.name === "enter") {
    // Save locally only
    const comment = createComment(currentFile, currentLine, commentText)
    addComment(comment)
  }
}
```

### Comment Status Indicators

```
  12   function main() {
  13 ● [local]   console.log("hello")     // Local comment
  14 ● [synced]  return result            // Synced to GitHub
  15 ● [pending] doSomething()            // In pending review
```

```typescript
function getCommentBadge(comment: Comment): { text: string; color: string } {
  switch (comment.status) {
    case "local":
      return { text: "[local]", color: "#7aa2f7" }
    case "pending_review":
      return { text: "[pending]", color: "#e0af68" }
    case "synced":
      return { text: "[synced]", color: "#9ece6a" }
  }
}
```

### Review Mode Toggle

```typescript
// Toggle between single comment and review mode
function toggleReviewMode(session: ReviewSession): ReviewSession {
  return {
    ...session,
    reviewMode: session.reviewMode === "single" ? "review" : "single",
  }
}
```

Status bar indicator:
```
┌─────────────────────────────────────────────────────────────────┐
│ Mode: [Single comment] ▼    3 local │ 2 pending │ 5 synced     │
└─────────────────────────────────────────────────────────────────┘
```

### Submit All Pending

```typescript
// Submit entire review with all pending comments
export async function submitAllPending(
  session: ReviewSession
): Promise<ReviewSession> {
  if (!session.pendingReviewId) {
    throw new Error("No pending review to submit")
  }
  
  await submitReview(
    session.owner!,
    session.repo!,
    session.prNumber!,
    session.pendingReviewId,
    "COMMENT"
  )
  
  // Update all pending comments to synced
  const updatedComments = session.comments.map(c =>
    c.status === "pending_review" ? { ...c, status: "synced" as const } : c
  )
  
  return {
    ...session,
    comments: updatedComments,
    pendingReviewId: undefined,
  }
}
```

### Keyboard Bindings

```toml
# In config.toml
[keys]
submit_comment = "ctrl+enter"      # Submit current comment to GitHub
toggle_review_mode = "ctrl+r"      # Toggle single/review mode
submit_review = "ctrl+shift+s"     # Submit all pending as review
sync_comment = "S"                 # Sync selected local comment
```

### Config Integration

```toml
[github]
default_review_mode = "single"     # "single" | "review"
auto_submit = false                # Auto-submit comments on save
```

### File Structure

```
src/
├── providers/
│   └── github.ts             # GitHub API calls via gh CLI
├── actions/
│   └── comments.ts           # Comment submission logic
└── components/
    ├── CommentInput.ts       # Updated with submit option
    ├── CommentBadge.ts       # Status indicator
    └── ReviewModeToggle.ts   # Mode selector
```
