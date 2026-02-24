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
- **Submit shortcut**: `S` to sync/submit selected local comment to GitHub
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

Comments are stored as individual markdown files with YAML frontmatter (see spec 004).

```typescript
// src/types.ts
export interface Comment {
  id: string
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
  body: string
  createdAt: string
  commit?: string             // Git commit hash for linking
  
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
  updatedAt: string
  
  // GitHub-specific
  prNumber?: number
  owner?: string
  repo?: string
  reviewMode: "single" | "review"  // Current submission mode
  pendingReviewId?: string         // GitHub pending review ID
}
```

**Example comment file** (`.neoriff/comments/a1b2c3d4.md`):

```markdown
---
id: a1b2c3d4-e5f6-7890-abcd-ef1234567890
filename: src/app.ts
line: 42
side: RIGHT
commit: abc1234def5678
createdAt: 2024-01-15T10:30:00Z
status: synced
githubId: 1234567890
githubUrl: https://github.com/owner/repo/pull/123#discussion_r1234567890
---

This should use a logger instead of console.log.
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

### External Editor Flow

Comments are written in `$EDITOR` (nvim by default) with diff context, using a scissors line
to separate the comment from context (like git commit --verbose).

```
This should use a logger instead of console.log

# Enter your comment above.
# Commenting on: src/app.ts:42
#
# Lines starting with # will be ignored.
# Leave empty to cancel.
#
# Do not modify or remove the line below.
# ------------------------ >8 ------------------------

diff --git a/src/app.ts b/src/app.ts
@@ -40,6 +40,7 @@ function main() {
   const result = calculate()
+  console.log("debug:", result)  // <-- commenting on this line
   return result
```

**Workflow:**
1. Press `c` to add comment → opens `$EDITOR` with diff context
2. Write comment above scissors line, save and quit
3. Comment is saved locally with `status: "local"`
4. Press `S` on comment to submit to GitHub → `status: "synced"`

```typescript
// After editor returns, create comment and optionally submit
async function handleAddComment(line: number, diffContent: string, filePath: string) {
  const body = await openCommentEditor({ diffContent, filePath, line })
  
  if (!body) return // User cancelled
  
  const comment = createComment(filePath, line, body)
  addComment(comment) // Always save locally first
  
  // In single-comment mode, could auto-submit:
  // if (session.reviewMode === "single" && config.github.auto_submit) {
  //   await submitComment(session, comment)
  // }
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
add_comment = "c"                  # Open $EDITOR to add comment on current line
sync_comment = "S"                 # Submit selected local comment to GitHub
toggle_review_mode = "ctrl+r"      # Toggle single/review mode
submit_review = "ctrl+shift+s"     # Submit all pending as review
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
├── utils/
│   └── editor.ts             # External editor integration (existing)
└── components/
    ├── CommentIndicators.ts  # Status badges in gutter (existing)
    └── CommentsList.ts       # Comment list with sync status
```
