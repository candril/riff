import type { PrCheck, PrCommit, PrConversationComment, PrInfo, PrReview } from "../providers/github/types"
import type { Comment } from "../types"
import type { PreviewSet } from "../utils/previews"

export function prInfo(body: string, extra: Partial<PrInfo> = {}): PrInfo {
  return {
    number: 1259,
    title: "Add the update-tv-channels skill",
    body,
    author: "someone",
    state: "open",
    headRef: "a-branch",
    baseRef: "master",
    owner: "owner",
    repo: "repo",
    url: "https://github.com/owner/repo/pull/1259",
    additions: 98,
    deletions: 0,
    changedFiles: 1,
    ...extra,
  }
}

/*
 * The fixtures below are dated against PR_NOW, so a test that freezes the
 * clock there sees the same "5m" and "2h" on every run.
 */

export const PR_NOW = new Date("2026-03-01T12:00:00Z")
export const ago = (minutes: number) => new Date(PR_NOW.getTime() - minutes * 60_000).toISOString()

/** Bob approved, then asked for changes, so only alice and erin still approve. */
export function reviews(): PrReview[] {
  return [
    { id: "PRR_alice", databaseId: 101, author: "alice", state: "APPROVED", submittedAt: ago(300) },
    { id: "PRR_bob1", databaseId: 102, author: "bob", state: "APPROVED", submittedAt: ago(240) },
    { id: "PRR_erin", databaseId: 105, author: "erin", state: "APPROVED", submittedAt: ago(200) },
    { id: "PRR_bob2", databaseId: 103, author: "bob", state: "CHANGES_REQUESTED", submittedAt: ago(120) },
    {
      id: "PRR_carol",
      databaseId: 104,
      author: "carol",
      state: "COMMENTED",
      body: "Looks fine overall, **one question** about naming.",
      submittedAt: ago(60),
    },
  ]
}

export function conversationComments(): PrConversationComment[] {
  return [
    {
      id: 501,
      body: "I tried this on `staging` and it [works](https://example.com) for me.\n\n- one\n- two",
      author: "dana",
      createdAt: ago(400),
      updatedAt: ago(400),
      url: "https://github.com/owner/repo/pull/1259#issuecomment-501",
      isBot: false,
      reactions: [
        { content: "+1", count: 2, viewerHasReacted: false },
        { content: "rocket", count: 1, viewerHasReacted: true },
      ],
    },
    {
      id: 502,
      body: "Deployed to the preview environment.",
      author: "deploy-bot[bot]",
      createdAt: ago(30),
      updatedAt: ago(30),
      url: "https://github.com/owner/repo/pull/1259#issuecomment-502",
      isBot: true,
    },
  ]
}

const check = (id: number, name: string, over: Partial<PrCheck>): PrCheck => ({
  id,
  name,
  status: "completed",
  conclusion: "success",
  detailsUrl: `https://github.com/owner/repo/actions/runs/${id}`,
  startedAt: ago(20),
  completedAt: ago(10),
  ...over,
})

/**
 * Every failing check has its annotations already settled: expanding one
 * whose status is unset would ask the app for them.
 */
export function checks(): PrCheck[] {
  return [
    check(1, "build", {}),
    check(2, "lint", { status: "in_progress", conclusion: null, completedAt: null }),
    check(3, "test", {
      conclusion: "failure",
      annotationsStatus: "loaded",
      annotations: [
        { path: "src/greet.ts", startLine: 12, endLine: 12, startColumn: 5, level: "failure", message: "Expected 2, got 3\nat greet.test.ts:4" },
        { path: "src/farewell.ts", startLine: 0, endLine: 0, level: "warning", message: "Unused export" },
      ],
    }),
    check(4, "e2e", { conclusion: "failure", annotationsStatus: "loading" }),
    check(5, "deploy", { conclusion: "timed_out", annotationsStatus: "error" }),
    check(6, "audit", { conclusion: "action_required", annotationsStatus: "loaded", annotations: [] }),
  ]
}

export const LONG_COMMIT_MESSAGE =
  "feat: a commit message far longer than any terminal row has room for, so it has to be cut somewhere along the way to the edge"

/** `count` commits an hour apart, the newest last, the first with a long message. */
export function commits(count: number): PrCommit[] {
  return Array.from({ length: count }, (_, i) => ({
    sha: `c${String(i).padStart(2, "0")}abcdef0123`,
    message: i === 0 ? LONG_COMMIT_MESSAGE : `fix: step ${i}`,
    author: "someone",
    date: ago((count - i) * 60),
  }))
}

const reviewComment = (id: string, over: Partial<Comment>): Comment => ({
  id,
  filename: "src/greet.ts",
  line: 12,
  side: "RIGHT",
  body: "",
  createdAt: ago(130),
  status: "synced",
  githubReviewId: 103,
  ...over,
})

/**
 * Bob's changes-requested review holds three threads: one with two replies
 * and a diff hunk, one resolved, one outdated on a long path.
 */
export function reviewThreadComments(): Comment[] {
  return [
    reviewComment("t1", {
      githubId: 9001,
      author: "bob",
      body: "Rename `greet` to `welcome`, it reads better in the call sites.",
      diffHunk: "@@ -10,3 +10,4 @@ export function greet()\n const a = 1\n-const old = 2\n+const greet = 3",
    }),
    reviewComment("t1r1", { author: "someone", body: "Done, renamed.", createdAt: ago(100), inReplyTo: "t1" }),
    reviewComment("t1r2", { author: "bob", body: "Thanks!", createdAt: ago(90), inReplyTo: "t1" }),
    reviewComment("t2", {
      githubId: 9002,
      filename: "src/farewell.ts",
      line: 3,
      author: "bob",
      body: "Typo here",
      createdAt: ago(125),
      isThreadResolved: true,
    }),
    reviewComment("t3", {
      githubId: 9003,
      filename: "src/very/deep/path/an-extremely-long-module-name-that-needs-cutting.ts",
      line: 40,
      author: "bob",
      body: "This moved",
      createdAt: ago(122),
      outdated: true,
    }),
  ]
}

export function previews(): PreviewSet {
  return {
    rows: [
      {
        app: "web",
        links: [
          { label: "preview", url: "https://web-pr1259.example.com" },
          { label: "storybook", url: "https://sb-pr1259.example.com" },
        ],
        built: { label: "#812", url: "https://github.com/owner/repo/actions/runs/812" },
      },
      { app: "admin", links: [], status: "on demand" },
    ],
    commentId: "502",
    author: "deploy-bot[bot]",
    createdAt: ago(30),
  }
}
