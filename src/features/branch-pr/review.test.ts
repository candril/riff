import { describe, expect, test } from "bun:test"
import type { BranchPr } from "../../providers/current-pr"
import type { Comment } from "../../types"
import { loadBranchPrReview } from "./review"

const branchPr: BranchPr = { number: 7, title: "t", state: "OPEN", isDraft: false, url: "u" }

const stored: Comment = {
  id: "c1",
  filename: "a.ts",
  line: 1,
  side: "RIGHT",
  body: "on the PR",
  createdAt: "2026-01-10T10:00:00Z",
  status: "synced",
  author: "alice",
}

describe("loadBranchPrReview", () => {
  test("reads the store under the PR's own identity", async () => {
    const asked: string[] = []
    const review = await loadBranchPrReview(branchPr, {
      getCurrentRepo: async () => ({ owner: "owner", repo: "repo" }),
      loadComments: async (source) => {
        asked.push(source)
        return [stored]
      },
    })
    expect(asked).toEqual(["gh:owner/repo#7"])
    expect(review).toEqual([stored])
  })

  test("a repo riff cannot name is no review", async () => {
    const review = await loadBranchPrReview(branchPr, {
      getCurrentRepo: async () => { throw new Error("Not in a git repository") },
      loadComments: async () => [stored],
    })
    expect(review).toEqual([])
  })

  test("a store that cannot be read is no review", async () => {
    const review = await loadBranchPrReview(branchPr, {
      getCurrentRepo: async () => ({ owner: "owner", repo: "repo" }),
      loadComments: async () => { throw new Error("ENOENT") },
    })
    expect(review).toEqual([])
  })
})
