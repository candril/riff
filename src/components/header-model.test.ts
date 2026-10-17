import { test, expect, describe } from "bun:test"
import { colors, theme } from "../theme"
import { headerModel, summarizeChecks, type HeaderPart } from "./header-model"
import type { PrCheck, PrCommit, PrInfo } from "../providers/github"
import type { DiffFile } from "../utils/diff-parser"
import type { BranchPr } from "../providers/current-pr"

const GREET: DiffFile = { filename: "src/greet.ts", additions: 2, deletions: 1, status: "modified", content: "" }

function check(id: number, status: PrCheck["status"], conclusion: PrCheck["conclusion"]): PrCheck {
  return { id, name: `check ${id}`, status, conclusion, detailsUrl: null, startedAt: null, completedAt: null }
}

const PR: PrInfo = {
  number: 42,
  title: "Greet by template",
  body: "",
  author: "someone",
  state: "open",
  headRef: "greet",
  baseRef: "main",
  owner: "owner",
  repo: "repo",
  url: "https://github.com/owner/repo/pull/42",
  additions: 2,
  deletions: 1,
  changedFiles: 1,
}

const COMMITS: PrCommit[] = ["aaaaaaa", "bbbbbbb", "ccccccc", "ddddddd"].map((sha, at) => ({
  sha,
  message: `subject ${at + 1}`,
  author: "someone",
  date: "2026-01-01T00:00:00Z",
}))

function branchPr(state: BranchPr["state"], isDraft: boolean): BranchPr {
  return { number: 7, title: "Greet", state, isDraft, url: "https://github.com/owner/repo/pull/7" }
}

const texts = (runs: HeaderPart[][]) => runs.map((run) => run.map((part) => part.content))

describe("local mode", () => {
  test("splits the branch arrow into its own run", () => {
    const model = headerModel({ branchInfo: "greet → main", totalFiles: 3 })
    expect(model.leftGap).toBe(2)
    expect(texts(model.left)).toEqual([["riff"], ["greet"], [" → "], ["main"], ["All files (3)"]])
    expect(model.left[2]![0]!.fg).toBe(theme.subtext0)
    expect(model.right).toEqual([])
  })

  test("a branch with no arrow stays one run, and its open pull request follows it", () => {
    const model = headerModel({ branchInfo: "greet", branchPr: branchPr("OPEN", true) })
    expect(texts(model.left)).toEqual([["riff"], ["greet"], ["  #7 draft"], ["All files"]])
    expect(model.left[2]![0]!.fg).toBe(theme.green)
  })

  test("a closed pull request of the branch is dimmed", () => {
    const model = headerModel({ branchPr: branchPr("CLOSED", false) })
    expect(model.left[1]).toEqual([{ content: "  #7", fg: theme.overlay0 }])
  })

  test("a selected file is named and its counts are one run of three parts", () => {
    const model = headerModel({ selectedFile: GREET })
    expect(model.left.at(-1)).toEqual([{ content: "src/greet.ts", fg: colors.text }])
    expect(model.right).toEqual([[
      { content: "+2", fg: theme.green },
      { content: " ", fg: colors.text },
      { content: "-1", fg: theme.red },
    ]])
  })
})

describe("review progress", () => {
  test("outdated files turn it peach", () => {
    expect(headerModel({ reviewProgress: { reviewed: 1, total: 3, outdated: 1 } }).right).toEqual([
      [{ content: "1/3 reviewed (1 outdated)", fg: theme.peach }],
    ])
  })

  test("everything reviewed turns it green, and partial progress stays muted", () => {
    expect(headerModel({ reviewProgress: { reviewed: 3, total: 3 } }).right).toEqual([
      [{ content: "3/3 reviewed", fg: theme.green }],
    ])
    expect(headerModel({ reviewProgress: { reviewed: 1, total: 3 } }).right[0]![0]!.fg).toBe(theme.subtext0)
  })

  test("nothing to review shows nothing", () => {
    expect(headerModel({ reviewProgress: { reviewed: 0, total: 0 } }).right).toEqual([])
  })
})

describe("commit filter", () => {
  const filter = (viewingCommit: string, viewingCommitScope?: string[]) =>
    texts(headerModel({ commits: COMMITS, viewingCommit, viewingCommitScope }).left).at(-2)

  test("one commit is named with its position", () => {
    expect(filter("bbbbbbb")).toEqual(["commit 2/4 · bbbbbbb subject 2 · esc: all commits"])
  })

  test("an unknown commit is named by its short sha", () => {
    expect(filter("eeeeeeeeeeee")).toEqual(["commit · eeeeeee · esc: all commits"])
  })

  test("a run of commits names how far it reaches", () => {
    expect(filter("bbbbbbb", ["ccccccc", "bbbbbbb", "ddddddd"])).toEqual(["commits 2–4/4 · esc: all commits"])
  })

  test("commits that are not a run are counted", () => {
    expect(filter("aaaaaaa", ["aaaaaaa", "ccccccc"])).toEqual(["2 commits of 4 · esc: all commits"])
  })

  test("is peach, and absent while all commits are shown", () => {
    expect(headerModel({ commits: COMMITS, viewingCommit: "aaaaaaa" }).left.at(-2)![0]!.fg).toBe(theme.peach)
    expect(texts(headerModel({ commits: COMMITS, viewingCommit: null }).left)).toEqual([["riff"], ["All files"]])
  })
})

describe("PR mode", () => {
  test("shows state, number, author and title with a gap of one", () => {
    const model = headerModel({ prInfo: PR })
    expect(model.leftGap).toBe(1)
    expect(texts(model.left)).toEqual([["Open"], ["#42"], ["@someone"], ["Greet by template"]])
  })

  test("a commit filter takes the title's place", () => {
    const model = headerModel({ prInfo: PR, commits: COMMITS, viewingCommit: "aaaaaaa" })
    expect(model.left[3]).toEqual([{ content: "commit 1/4 · aaaaaaa subject 1 · esc: all commits", fg: theme.peach }])
  })

  test("a draft is named so whatever its state", () => {
    expect(headerModel({ prInfo: { ...PR, isDraft: true, state: "merged" } }).left[0]).toEqual([
      { content: "Draft", fg: theme.overlay1 },
    ])
  })

  test("the checks follow whose move it is", () => {
    const model = headerModel({
      prInfo: { ...PR, checks: [check(1, "completed", "failure")] },
      merge: { verdict: "author", text: "checks failing" },
    })
    expect(model.right).toEqual([
      [{ content: "! checks failing", fg: theme.yellow }],
      [{ content: "✗ 1", fg: theme.red }],
    ])
  })
})

describe("summarizeChecks", () => {
  test("a failure outweighs everything", () => {
    expect(summarizeChecks([check(1, "completed", "success"), check(2, "completed", "timed_out"), check(3, "in_progress", null)]))
      .toEqual({ text: "✗ 1", color: theme.red })
  })

  test("pending checks are counted while none failed", () => {
    expect(summarizeChecks([check(1, "completed", "success"), check(2, "queued", null), check(3, "in_progress", null)]))
      .toEqual({ text: "○ 2", color: theme.yellow })
  })

  test("all passing, skipped or neutral is a tick", () => {
    expect(summarizeChecks([check(1, "completed", "success"), check(2, "completed", "skipped"), check(3, "completed", "neutral")]))
      .toEqual({ text: "✓", color: theme.green })
  })

  test("no checks show nothing", () => {
    expect(summarizeChecks([])).toBeNull()
    expect(summarizeChecks(undefined)).toBeNull()
  })
})
