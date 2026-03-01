# 028 - PR Info Panel

**Status**: Draft

## Description

A read-only quick info panel showing PR metadata at a glance. Opened via action picker, displays author, branch, title, description, CI checks status, approval status, and required reviewers.

This is distinct from spec 019 (PR Management) which handles creating and editing PRs. This panel is for quickly viewing detailed PR status without leaving the diff view.

## Out of Scope

- Editing PR title/description (see spec 019)
- Creating PRs (see spec 019)
- Requesting reviewers
- Managing labels or milestones
- Merge operations
- Full conversation history (use Comments View for that)

## Capabilities

### P1 - MVP

- **Open via action picker**: `Ctrl+p` → "PR Info" action
- **Show basic info**: Title, author, branch names (base ← head)
- **Show description**: PR body/description text
- **Show status**: Draft, open, merged, closed
- **Close panel**: `Esc` or `q` to dismiss

### P2 - Enhanced

- **CI checks**: Show check runs with status (pending, success, failure)
- **Approvals**: List users who approved, requested changes, or commented
- **Required reviewers**: Show required reviewers and their status
- **Mergeable status**: Show if PR can be merged (conflicts, checks, approvals)

### P3 - Polish

- **Clickable links**: Open PR in browser with `o`
- **Copy PR URL**: `y` to copy URL to clipboard
- **Labels**: Show PR labels with colors
- **Timestamps**: Created at, updated at, time since last update

## UI

### Panel Layout

```
┌─ PR Info ────────────────────────────────────────────────────────┐
│                                                                  │
│  #1234  Add dark mode support                                    │
│  ══════════════════════════════════════════════════════════════  │
│                                                                  │
│  Status      Open                                                │
│  Author      @alice                                              │
│  Branch      alice/dark-mode → main                              │
│  Created     2 days ago                                          │
│                                                                  │
│  ─ Description ──────────────────────────────────────────────── │
│  This PR adds dark mode toggle to the settings page.             │
│  - Added theme context                                           │
│  - Updated all components                                        │
│                                                                  │
│  ─ Checks ───────────────────────────────────────────────────── │
│  ✓ CI / build         passed                                     │
│  ✓ CI / test          passed                                     │
│  ○ CI / deploy        pending                                    │
│                                                                  │
│  ─ Reviews ──────────────────────────────────────────────────── │
│  ✓ @bob               approved                                   │
│  ● @charlie           requested changes                          │
│  ○ @diana             pending (required)                         │
│                                                                  │
│  ─ Merge Status ─────────────────────────────────────────────── │
│  ✗ Cannot merge: 1 required reviewer pending                     │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│  o: open in browser   y: copy URL   Esc: close                   │
└──────────────────────────────────────────────────────────────────┘
```

### Status Indicators

| Symbol | Meaning |
|--------|---------|
| `✓` | Success / Approved |
| `✗` | Failed / Changes requested |
| `○` | Pending / Waiting |
| `●` | In progress / Needs attention |

### Compact Mode (P3)

For narrow terminals, show condensed view:

```
┌─ PR #1234 ───────────────────────────────┐
│ Add dark mode support                    │
│ @alice · alice/dark-mode → main          │
│ Open · 2/3 checks · 1/2 approvals        │
├──────────────────────────────────────────┤
│ Esc: close                               │
└──────────────────────────────────────────┘
```

## Technical Notes

### PR Info Data Structure

```typescript
// src/types.ts

export interface PRInfo {
  number: number
  title: string
  body: string
  state: "open" | "closed" | "merged"
  draft: boolean
  
  // Author
  author: string
  authorAvatarUrl?: string
  
  // Branches
  headRef: string          // e.g., "alice/dark-mode"
  baseRef: string          // e.g., "main"
  headSha: string
  
  // Timestamps
  createdAt: string
  updatedAt: string
  mergedAt?: string
  
  // URLs
  htmlUrl: string
  
  // Reviews
  reviews: PRReview[]
  requiredReviewers: string[]
  
  // Checks
  checks: PRCheck[]
  
  // Merge status
  mergeable: boolean | null   // null = unknown/checking
  mergeableState: "clean" | "blocked" | "behind" | "dirty" | "unknown"
  mergeBlockers: string[]     // Reasons why merge is blocked
  
  // Labels (P3)
  labels: PRLabel[]
}

export interface PRReview {
  author: string
  state: "approved" | "changes_requested" | "commented" | "pending" | "dismissed"
  submittedAt?: string
  required: boolean
}

export interface PRCheck {
  name: string
  status: "queued" | "in_progress" | "completed"
  conclusion?: "success" | "failure" | "neutral" | "cancelled" | "skipped" | "timed_out"
  detailsUrl?: string
}

export interface PRLabel {
  name: string
  color: string   // hex without #
}
```

### Fetching PR Info

```typescript
// src/providers/github.ts

export async function fetchPRInfo(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRInfo> {
  // Fetch PR details
  const pr = await $`gh pr view ${prNumber} --json \
    number,title,body,state,isDraft,author,headRefName,baseRefName,headRefOid,\
    createdAt,updatedAt,mergedAt,url,labels,mergeable,mergeStateStatus`.json()
  
  // Fetch reviews
  const reviews = await $`gh api repos/${owner}/${repo}/pulls/${prNumber}/reviews`.json()
  
  // Fetch check runs
  const checks = await $`gh api repos/${owner}/${repo}/commits/${pr.headRefOid}/check-runs`.json()
  
  // Fetch required reviewers from branch protection (if accessible)
  let requiredReviewers: string[] = []
  try {
    const protection = await $`gh api repos/${owner}/${repo}/branches/${pr.baseRefName}/protection`.json()
    requiredReviewers = protection.required_pull_request_reviews?.required_approving_review_count ?? []
  } catch {
    // Branch protection not accessible or not configured
  }
  
  return {
    number: pr.number,
    title: pr.title,
    body: pr.body || "",
    state: pr.mergedAt ? "merged" : pr.state,
    draft: pr.isDraft,
    author: pr.author.login,
    headRef: pr.headRefName,
    baseRef: pr.baseRefName,
    headSha: pr.headRefOid,
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
    mergedAt: pr.mergedAt,
    htmlUrl: pr.url,
    reviews: mapReviews(reviews, requiredReviewers),
    requiredReviewers,
    checks: mapChecks(checks.check_runs),
    mergeable: pr.mergeable,
    mergeableState: pr.mergeStateStatus?.toLowerCase() || "unknown",
    mergeBlockers: getMergeBlockers(pr, reviews, checks),
    labels: pr.labels.map((l: any) => ({ name: l.name, color: l.color })),
  }
}

function mapReviews(reviews: any[], required: string[]): PRReview[] {
  // Group by author, keep latest review per author
  const byAuthor = new Map<string, any>()
  for (const review of reviews) {
    byAuthor.set(review.user.login, review)
  }
  
  return Array.from(byAuthor.values()).map(r => ({
    author: r.user.login,
    state: r.state.toLowerCase(),
    submittedAt: r.submitted_at,
    required: required.includes(r.user.login),
  }))
}

function mapChecks(checkRuns: any[]): PRCheck[] {
  return checkRuns.map(c => ({
    name: c.name,
    status: c.status,
    conclusion: c.conclusion,
    detailsUrl: c.details_url,
  }))
}

function getMergeBlockers(pr: any, reviews: any[], checks: any): string[] {
  const blockers: string[] = []
  
  if (pr.isDraft) {
    blockers.push("PR is still a draft")
  }
  
  if (pr.mergeable === false) {
    blockers.push("Has merge conflicts")
  }
  
  const failedChecks = checks.check_runs?.filter(
    (c: any) => c.conclusion === "failure"
  )
  if (failedChecks?.length > 0) {
    blockers.push(`${failedChecks.length} check(s) failed`)
  }
  
  const pendingChecks = checks.check_runs?.filter(
    (c: any) => c.status !== "completed"
  )
  if (pendingChecks?.length > 0) {
    blockers.push(`${pendingChecks.length} check(s) pending`)
  }
  
  const changesRequested = reviews.filter(
    (r: any) => r.state === "CHANGES_REQUESTED"
  )
  if (changesRequested.length > 0) {
    blockers.push("Changes requested by reviewer")
  }
  
  return blockers
}
```

### Action Registration

```typescript
// src/actions/index.ts

{
  id: "pr-info",
  label: "PR Info",
  description: "Show PR details, checks, and approvals",
  shortcut: "gi",
  handler: () => openPRInfoPanel(),
  available: () => state.mode === "pr",
  context: "pr",
}
```

### Component

```typescript
// src/components/PRInfoPanel.tsx

interface PRInfoPanelProps {
  prInfo: PRInfo
  onClose: () => void
}

export function PRInfoPanel({ prInfo, onClose }: PRInfoPanelProps) {
  return (
    <Box
      position="absolute"
      top="10%"
      left="15%"
      width="70%"
      height="80%"
      borderStyle="single"
      borderColor={colors.primary}
      backgroundColor={theme.base}
      flexDirection="column"
    >
      {/* Header */}
      <Box paddingX={2} paddingY={1}>
        <Text fg={colors.textDim}>#{prInfo.number}  </Text>
        <Text fg={colors.text} bold>{prInfo.title}</Text>
      </Box>
      
      <Divider />
      
      {/* Scrollable content */}
      <ScrollBox flexGrow={1} paddingX={2}>
        {/* Basic info */}
        <InfoRow label="Status" value={formatStatus(prInfo)} />
        <InfoRow label="Author" value={`@${prInfo.author}`} />
        <InfoRow label="Branch" value={`${prInfo.headRef} → ${prInfo.baseRef}`} />
        <InfoRow label="Created" value={formatTimeAgo(prInfo.createdAt)} />
        
        {/* Description */}
        {prInfo.body && (
          <>
            <SectionHeader title="Description" />
            <Text fg={colors.textDim}>{prInfo.body}</Text>
          </>
        )}
        
        {/* Checks */}
        {prInfo.checks.length > 0 && (
          <>
            <SectionHeader title="Checks" />
            {prInfo.checks.map(check => (
              <CheckRow key={check.name} check={check} />
            ))}
          </>
        )}
        
        {/* Reviews */}
        {prInfo.reviews.length > 0 && (
          <>
            <SectionHeader title="Reviews" />
            {prInfo.reviews.map(review => (
              <ReviewRow key={review.author} review={review} />
            ))}
          </>
        )}
        
        {/* Merge status */}
        <SectionHeader title="Merge Status" />
        <MergeStatus prInfo={prInfo} />
      </ScrollBox>
      
      {/* Footer hints */}
      <Divider />
      <Box paddingX={2} paddingY={1}>
        <Text fg={colors.textDim}>
          o: open in browser   y: copy URL   Esc: close
        </Text>
      </Box>
    </Box>
  )
}

function CheckRow({ check }: { check: PRCheck }) {
  const icon = check.status !== "completed" 
    ? "○" 
    : check.conclusion === "success" 
      ? "✓" 
      : "✗"
  const color = check.status !== "completed"
    ? colors.yellow
    : check.conclusion === "success"
      ? colors.green
      : colors.red
      
  return (
    <Box flexDirection="row">
      <Text fg={color}>{icon} </Text>
      <Text fg={colors.text} width={20}>{check.name}</Text>
      <Text fg={colors.textDim}>{check.conclusion || check.status}</Text>
    </Box>
  )
}

function ReviewRow({ review }: { review: PRReview }) {
  const icon = review.state === "approved" 
    ? "✓" 
    : review.state === "changes_requested" 
      ? "●"
      : "○"
  const color = review.state === "approved"
    ? colors.green
    : review.state === "changes_requested"
      ? colors.red
      : colors.textDim
      
  const suffix = review.required ? " (required)" : ""
      
  return (
    <Box flexDirection="row">
      <Text fg={color}>{icon} </Text>
      <Text fg={colors.text} width={20}>@{review.author}</Text>
      <Text fg={colors.textDim}>{review.state.replace("_", " ")}{suffix}</Text>
    </Box>
  )
}
```

### Keyboard Handling

```typescript
// When PR info panel is open
if (state.prInfoPanelOpen) {
  switch (key.name) {
    case "escape":
    case "q":
      closePRInfoPanel()
      break
    case "o":
      // Open PR in browser
      await $`open ${state.prInfo.htmlUrl}`
      break
    case "y":
      // Copy URL to clipboard
      await $`echo ${state.prInfo.htmlUrl} | pbcopy`
      showToast({ message: "URL copied to clipboard" })
      break
    case "j":
    case "down":
      scrollPRInfo(1)
      break
    case "k":
    case "up":
      scrollPRInfo(-1)
      break
  }
  return
}
```

### State

```typescript
// src/state.ts

interface AppState {
  // ... existing fields
  
  prInfo: PRInfo | null
  prInfoPanelOpen: boolean
  prInfoScrollOffset: number
}
```

### Configuration

```toml
# config.toml

[keys]
pr_info = "g i"    # Also accessible via Ctrl+p → "PR Info"
```

### File Structure

```
src/
├── providers/
│   └── github.ts         # fetchPRInfo
├── components/
│   └── PRInfoPanel.tsx   # Panel component
├── actions/
│   └── index.ts          # Add pr-info action
├── state.ts              # Add prInfo, prInfoPanelOpen
└── types.ts              # PRInfo, PRReview, PRCheck types
```

### Edge Cases

1. **No checks configured**: Hide checks section entirely
2. **No reviews yet**: Show "No reviews yet" message
3. **Private repo**: Some API calls may fail, show available info only
4. **Long description**: ScrollBox handles overflow
5. **Draft PR**: Show draft status prominently
6. **Merged PR**: Show merged status with merge timestamp
7. **Stale data**: Add refresh hint if data is old
