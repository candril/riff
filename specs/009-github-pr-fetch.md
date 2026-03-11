# GitHub PR Fetch

**Status**: Ready

## Description

Fetch and display GitHub Pull Requests using the `gh` CLI. Support opening PRs by number (`riff #123`), by URL, or by full reference (`gh:owner/repo#123`). Load the PR diff and existing comments for review.

## Out of Scope

- Creating new PRs (use `gh pr create`)
- Merging PRs
- PR approval/request changes (covered in 008)
- Webhooks or real-time updates

## Capabilities

### P1 - MVP

- **PR by URL**: `riff https://github.com/owner/repo/pull/123` (copy from browser)
- **PR by number**: `riff #123` or `riff 123` (infers repo from current directory)
- **PR diff**: Fetch and display the PR diff
- **PR metadata**: Show PR title, author, branch info in header
- **Existing comments**: Load and display existing PR review comments

### P2 - Enhanced

- **Full reference**: `riff gh:owner/repo#123` (for PRs in other repos)
- **Comment threads**: Group comments into threads with replies
- **PR description**: Show PR body in a collapsible panel

### P3 - Polish

- **Multiple PRs**: Open multiple PRs in tabs/splits
- **PR list**: `riff --list` to show open PRs, pick one
- **Refresh**: `R` to refresh PR data from GitHub

## Technical Notes

### CLI Argument Parsing

```typescript
// src/index.ts
interface CliArgs {
  target?: string           // "123", "#123", "gh:owner/repo#123", URL, or revision
  type: "local" | "pr"      // Detected source type
  
  // For PR mode
  prNumber?: number
  owner?: string
  repo?: string
}

function parseArgs(args: string[]): CliArgs {
  const target = args[0]
  
  if (!target) {
    return { type: "local" }
  }
  
  // PR number: "#123" or "123"
  const prMatch = target.match(/^#?(\d+)$/)
  if (prMatch) {
    return {
      target,
      type: "pr",
      prNumber: parseInt(prMatch[1], 10),
      // owner/repo inferred from current directory
    }
  }
  
  // Full reference: "gh:owner/repo#123"
  const ghMatch = target.match(/^gh:([^/]+)\/([^#]+)#(\d+)$/)
  if (ghMatch) {
    return {
      target,
      type: "pr",
      owner: ghMatch[1],
      repo: ghMatch[2],
      prNumber: parseInt(ghMatch[3], 10),
    }
  }
  
  // GitHub URL
  const urlMatch = target.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/)
  if (urlMatch) {
    return {
      target,
      type: "pr",
      owner: urlMatch[1],
      repo: urlMatch[2],
      prNumber: parseInt(urlMatch[3], 10),
    }
  }
  
  // Otherwise treat as local revision (branch, commit, jj revset)
  return { target, type: "local" }
}
```

### GitHub Provider

```typescript
// src/providers/github.ts
import { $ } from "bun"

export interface PrInfo {
  number: number
  title: string
  body: string
  author: string
  state: "open" | "closed" | "merged"
  headRef: string         // Branch name
  baseRef: string         // Target branch (e.g., "main")
  owner: string
  repo: string
  url: string
  additions: number
  deletions: number
  changedFiles: number
}

export interface PrComment {
  id: number
  body: string
  path: string
  line: number
  side: "LEFT" | "RIGHT"
  author: string
  createdAt: string
  updatedAt: string
  url: string
  
  // Thread info
  inReplyToId?: number
  threadId?: number
}

/**
 * Get current repo's owner and name from gh CLI
 */
export async function getCurrentRepo(): Promise<{ owner: string; repo: string }> {
  const result = await $`gh repo view --json owner,name`.json()
  return {
    owner: result.owner.login,
    repo: result.name,
  }
}

/**
 * Fetch PR metadata
 */
export async function getPrInfo(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<PrInfo> {
  const repoArg = owner && repo ? `-R ${owner}/${repo}` : ""
  
  const result = await $`gh pr view ${prNumber} ${repoArg} --json \
    number,title,body,author,state,headRefName,baseRefName,url,additions,deletions,changedFiles`.json()
  
  // Get owner/repo if not provided
  let finalOwner = owner
  let finalRepo = repo
  if (!owner || !repo) {
    const current = await getCurrentRepo()
    finalOwner = current.owner
    finalRepo = current.repo
  }
  
  return {
    number: result.number,
    title: result.title,
    body: result.body,
    author: result.author.login,
    state: result.state.toLowerCase(),
    headRef: result.headRefName,
    baseRef: result.baseRefName,
    owner: finalOwner!,
    repo: finalRepo!,
    url: result.url,
    additions: result.additions,
    deletions: result.deletions,
    changedFiles: result.changedFiles,
  }
}

/**
 * Fetch PR diff
 */
export async function getPrDiff(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  const repoArg = owner && repo ? `-R ${owner}/${repo}` : ""
  return await $`gh pr diff ${prNumber} ${repoArg}`.text()
}

/**
 * Fetch PR review comments (inline comments on diff)
 */
export async function getPrComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PrComment[]> {
  const result = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/comments`.json()
  
  return result.map((c: any) => ({
    id: c.id,
    body: c.body,
    path: c.path,
    line: c.line || c.original_line,
    side: c.side || "RIGHT",
    author: c.user.login,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    url: c.html_url,
    inReplyToId: c.in_reply_to_id,
    // GitHub's pull_request_review_id groups comments into a thread
    threadId: c.pull_request_review_id,
  }))
}
```

### Loading PR and Persisting to Markdown

When fetching a PR, comments are immediately written to `.riff/comments/` as markdown files.
This unifies storage between PR reviews and local diff reviews.

```typescript
// src/providers/github.ts
import { saveComment, saveSession, loadComments } from "../storage"
import type { Comment, ReviewSession } from "../types"

/**
 * Convert a GitHub PR comment to our Comment type
 */
function convertPrComment(c: PrComment, prHeadSha: string): Comment {
  return {
    id: `gh-${c.id}`,
    filename: c.path,
    line: c.line,
    side: c.side,
    body: c.body,
    createdAt: c.createdAt,
    commit: prHeadSha,           // Link to PR head commit
    status: "synced",
    githubId: c.id,
    githubUrl: c.url,
    author: c.author,            // Preserve original author
    inReplyTo: c.inReplyToId ? `gh-${c.inReplyToId}` : undefined,
  }
}

/**
 * Load a GitHub PR - fetches data and persists to local markdown storage
 */
export async function loadPrSession(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<{ prInfo: PrInfo; diff: string; comments: Comment[] }> {
  // Fetch all data in parallel
  const [prInfo, diff, prComments] = await Promise.all([
    getPrInfo(prNumber, owner, repo),
    getPrDiff(prNumber, owner, repo),
    (async () => {
      const resolved = owner && repo 
        ? { owner, repo } 
        : await getCurrentRepo()
      return getPrComments(resolved.owner, resolved.repo, prNumber)
    })(),
  ])
  
  // Get PR head SHA for linking comments to commit
  const headSha = await getPrHeadSha(prNumber, owner, repo)
  
  // Convert and save each comment as markdown file
  const comments: Comment[] = []
  for (const prComment of prComments) {
    const comment = convertPrComment(prComment, headSha)
    await saveComment(comment)
    comments.push(comment)
  }
  
  // Save session metadata
  const session: ReviewSession = {
    id: crypto.randomUUID(),
    source: `gh:${prInfo.owner}/${prInfo.repo}#${prInfo.number}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    prNumber: prInfo.number,
    owner: prInfo.owner,
    repo: prInfo.repo,
    reviewMode: "single",
  }
  await saveSession(session)
  
  return { prInfo, diff, comments }
}

/**
 * Get PR head commit SHA
 */
async function getPrHeadSha(
  prNumber: number,
  owner?: string,
  repo?: string
): Promise<string> {
  const repoArg = owner && repo ? `-R ${owner}/${repo}` : ""
  const result = await $`gh pr view ${prNumber} ${repoArg} --json headRefOid`.json()
  return result.headRefOid
}
```

**Result: Same storage format for any source**

```
.riff/
├── session.toml
└── comments/
    ├── gh-12345678.md    # Comment from GitHub (status: synced)
    ├── gh-23456789.md    # Another GitHub comment
    └── a1b2c3d4.md       # Local comment (status: local)
```

**Example synced comment file** (`.riff/comments/gh-12345678.md`):

```markdown
---
id: gh-12345678
filename: src/app.ts
line: 42
side: RIGHT
commit: abc1234def5678
createdAt: 2024-01-15T10:30:00Z
status: synced
githubId: 12345678
githubUrl: https://github.com/owner/repo/pull/123#discussion_r12345678
author: octocat
---

This should use a logger instead of console.log.
```

### Updated App Entry

```typescript
// src/index.ts
import { createApp } from "./app"
import { loadPrSession } from "./providers/github"
import { loadComments, loadSession } from "./storage"

async function main() {
  const args = parseArgs(process.argv.slice(2))
  
  if (args.type === "pr") {
    // Fetch PR and persist comments to markdown files
    const { prInfo, diff, comments } = await loadPrSession(
      args.prNumber!,
      args.owner,
      args.repo
    )
    
    await createApp({
      mode: "pr",
      diff,
      comments,  // Already saved to disk, but pass for initial state
      prInfo,
    })
  } else {
    // Local diff mode - load any existing comments from storage
    const comments = await loadComments()
    
    await createApp({
      target: args.target,
      comments,
    })
  }
}
```

### Unified Comment Loading

Both PR and local modes use the same storage. On app start:

```typescript
// src/app.ts
import { loadComments } from "./storage"

export async function createApp(options: AppOptions) {
  // Always load comments from markdown files
  // For PR mode, these were just written by loadPrSession
  // For local mode, these are any previously saved comments
  const comments = await loadComments()
  
  // Filter comments relevant to current diff (by commit or filename)
  const relevantComments = filterRelevantComments(comments, options)
  
  // ... rest of app setup
}
```

### Header Display for PR

```
┌─────────────────────────────────────────────────────────────────┐
│ #123: Fix memory leak in connection pool                        │
│ author/branch-name → main  +42 -15  3 files                    │
└─────────────────────────────────────────────────────────────────┘
```

```typescript
// src/components/Header.ts - updated for PR mode
function PrHeader(prInfo: PrInfo): BoxElement {
  return Box(
    { flexDirection: "column", paddingX: 1 },
    Text({ 
      content: `#${prInfo.number}: ${prInfo.title}`,
      fg: theme.text,
      bold: true,
    }),
    Text({
      content: `${prInfo.author}/${prInfo.headRef} → ${prInfo.baseRef}  ` +
               `+${prInfo.additions} -${prInfo.deletions}  ${prInfo.changedFiles} files`,
      fg: theme.textMuted,
    })
  )
}
```

### Types Update

```typescript
// src/types.ts

// ReviewSession is just metadata - comments are stored as separate files
export interface ReviewSession {
  id: string
  source: string              // "local", "gh:owner/repo#123"
  createdAt: string
  updatedAt: string
  
  // GitHub-specific (optional, only for PR sessions)
  prNumber?: number
  owner?: string
  repo?: string
  reviewMode?: "single" | "review"
  pendingReviewId?: string
}

export interface Comment {
  id: string
  filename: string
  line: number
  side: "LEFT" | "RIGHT"
  body: string
  createdAt: string
  commit?: string             // Git SHA to link comment to specific revision
  
  // Sync status
  status: "local" | "pending" | "synced"
  
  // GitHub fields (populated for synced comments)
  githubId?: number
  githubUrl?: string
  author?: string             // GitHub username (for others' comments)
  inReplyTo?: string          // Parent comment ID for threads
}
```

### Error Handling

```typescript
// Handle common gh CLI errors
async function safeGhCommand<T>(cmd: () => Promise<T>): Promise<T> {
  try {
    return await cmd()
  } catch (error) {
    const msg = String(error)
    
    if (msg.includes("gh auth login")) {
      throw new Error("Not logged in to GitHub. Run: gh auth login")
    }
    if (msg.includes("Could not resolve")) {
      throw new Error("PR not found. Check the PR number and repository.")
    }
    if (msg.includes("not a git repository")) {
      throw new Error("Not in a git repository. Specify full repo: riff gh:owner/repo#123")
    }
    
    throw error
  }
}
```

### File Structure

```
src/
├── index.ts              # CLI parsing, mode detection
├── providers/
│   ├── local.ts          # Git/jj local diffs (existing)
│   └── github.ts         # GitHub PR fetching + comments
└── types.ts              # Updated with GitHub fields
```

### Usage Examples

```bash
# Review PR in current repo
riff #123
riff 123

# Review PR in another repo
riff gh:facebook/react#12345

# Review PR by URL (copy from browser)
riff https://github.com/owner/repo/pull/123

# Still works: local diff review
riff              # Uncommitted changes
riff branch:main  # Diff against main
riff @-           # Previous jj revision
```
