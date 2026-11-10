import { describe, expect, mock, test } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import type { Comment } from "../../types"
import type { DiffFile } from "../../utils/diff-parser"
import type { DiffLineMapping } from "../../vim-diff/line-mapping"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { FlatConversationItem } from "../../components/pr-info-items"
import { followLink, type DeepLinkJumpDeps } from "./jump"
import { parseFragment } from "./parse"
import { pathHash } from "./resolve"

const files: DiffFile[] = [
  { filename: "src/a.ts", additions: 1, deletions: 0, status: "modified", content: "" },
  { filename: "src/b.ts", additions: 1, deletions: 0, status: "modified", content: "" },
]

const comment = (id: string, extra: Partial<Comment>): Comment => ({
  id,
  filename: "src/b.ts",
  line: 8,
  side: "RIGHT",
  body: id,
  createdAt: "2026-01-01T00:00:00Z",
  status: "synced",
  ...extra,
})

const comments = [comment("root", { githubId: 1 }), comment("reply", { githubId: 2, inReplyTo: "root", line: 0 })]

/** The app as the jump sees it, recording what it was asked to do. */
function app({ rows = [] as FlatConversationItem[], lines = new Map<string, number>() } = {}) {
  let state: AppState = { ...createInitialState(files, [], "gh:owner/repo#5", "", null, null, comments, "pr", null), viewMode: "state" }
  let vimState = createCursorState()
  const toasts: string[] = []
  const calls: string[] = []
  const threads: Comment[] = []
  const deps: DeepLinkJumpDeps = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    render: () => {},
    toast: { show: (message) => void toasts.push(message), clear: () => {} },
    later: () => {},
    recordJump: () => void calls.push("record"),
    openThread: (c) => void threads.push(c),
    openOverview: () => void calls.push("overview"),
    revealConversationItem: (matches) => rows.some(matches),
    selectFile: (index) => void calls.push(`file ${index}`),
    getLineMapping: () =>
      ({
        findLineForComment: ({ filename, line, side }: Pick<Comment, "filename" | "line" | "side">) =>
          lines.get(`${filename}:${side}:${line}`) ?? null,
      }) as unknown as DiffLineMapping,
    getVimState: () => vimState,
    setVimState: (s) => { vimState = s },
    ensureCursorVisible: mock(() => {}),
  }
  return { deps, toasts, calls, threads, state: () => state, vimState: () => vimState }
}

const follow = (fragment: string, deps: DeepLinkJumpDeps) => followLink(parseFragment(fragment)!, deps)

describe("followLink", () => {
  test("a review comment opens its thread", () => {
    const { deps, threads, toasts, calls } = app()
    follow("discussion_r1", deps)
    expect(threads.map((c) => c.id)).toEqual(["root"])
    expect(calls).toEqual(["record"])
    expect(toasts).toEqual([])
  })

  test("a reply opens the thread it is in, on the reply", () => {
    const { deps, threads } = app()
    follow("r2", deps)
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({ id: "reply", filename: "src/b.ts", line: 8 })
  })

  test("a deleted review comment is said in a toast, and nothing moves", () => {
    const { deps, threads, toasts, calls } = app()
    follow("r99", deps)
    expect(threads).toEqual([])
    expect(calls).toEqual([])
    expect(toasts).toEqual(["That review comment isn't on this PR anymore"])
  })

  test("a conversation comment and a review open the overview on their row", () => {
    const rows = [
      { type: "pr-comment", data: { id: 7 } },
      { type: "review-header", data: { databaseId: 8 } },
    ] as unknown as FlatConversationItem[]
    const { deps, toasts, calls } = app({ rows })
    follow("issuecomment-7", deps)
    follow("pullrequestreview-8", deps)
    expect(calls).toEqual(["record", "overview", "record", "overview"])
    expect(toasts).toEqual([])

    follow("issuecomment-8", deps)
    follow("pullrequestreview-7", deps)
    expect(toasts).toEqual(["That comment isn't on this PR anymore", "That review isn't on this PR anymore"])
  })

  test("a file opens in the diff", () => {
    const { deps, calls, state, toasts } = app()
    follow(`diff-${pathHash("src/b.ts")}`, deps)
    expect(state().viewMode).toBe("diff")
    expect(calls).toEqual(["record", "file 1"])
    expect(toasts).toEqual([])
  })

  test("a file's line puts the cursor on it, on the side it names", () => {
    const lines = new Map([["src/a.ts:LEFT:3", 17]])
    const { deps, vimState, toasts } = app({ lines })
    follow(`diff-${pathHash("src/a.ts")}L3-L9`, deps)
    expect(vimState().line).toBe(17)
    expect(deps.ensureCursorVisible).toHaveBeenCalled()
    expect(toasts).toEqual([])
  })

  test("a line the diff does not show opens the file and says so", () => {
    const { deps, calls, vimState, toasts } = app()
    follow(`diff-${pathHash("src/a.ts")}R300`, deps)
    expect(calls).toEqual(["record", "file 0"])
    expect(vimState().line).toBe(0)
    expect(toasts).toEqual(["Line 300 of src/a.ts isn't in the diff"])
  })

  test("a file not in the diff is said in a toast", () => {
    const { deps, calls, toasts } = app()
    follow(`diff-${pathHash("src/gone.ts")}`, deps)
    expect(calls).toEqual([])
    expect(toasts).toEqual(["That file isn't in this PR's diff"])
  })

  test("a fragment riff cannot read is named, made safe to print", () => {
    const { deps, calls, toasts } = app()
    follow("commits\u001b[2J", deps)
    expect(calls).toEqual([])
    expect(toasts).toEqual(["Can't follow #commits?[2J"])
  })
})
