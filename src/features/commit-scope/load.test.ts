import { describe, expect, test } from "bun:test"
import { commitsReview, loadContext, patch } from "../../testing/commit-scope"
import { scopeFiles, spanBaseRef } from "./load"

describe("scopeFiles", () => {
  test("asks a PR for a run's diff from the parent of its oldest commit to its newest", async () => {
    const asked: string[][] = []
    const ctx = loadContext(commitsReview("pr"), {
      fetchCommitRangeDiff: async (owner, repo, base, head) => {
        asked.push([owner, repo, base, head])
        return patch("a.ts", "run")
      },
    })

    const files = await scopeFiles(ctx, ["ccc3333", "bbb2222"])

    expect(asked).toEqual([["owner", "repo", "aaa1111", "ccc3333"]])
    expect(files.map((file) => file.filename)).toEqual(["a.ts"])
  })

  test("reads a single commit of a local review as its own patch", async () => {
    const asked: Array<[string, string | undefined]> = []
    const ctx = loadContext(commitsReview("local"), {
      getLocalCommitDiff: async (sha, target) => {
        asked.push([sha, target])
        return patch("a.ts", "one")
      },
    })

    const files = await scopeFiles(ctx, ["bbb2222"])

    expect(asked).toEqual([["bbb2222", undefined]])
    expect(files[0]?.additions).toBe(1)
  })

  test("merges a file two commits of a gapped scope touched, oldest first", async () => {
    const patches: Record<string, string> = {
      ddd4444: patch("a.ts", "newer", 20),
      bbb2222: [patch("a.ts", "older"), patch("b.ts", "only")].join("\n"),
    }
    const ctx = loadContext(commitsReview("pr"), {
      fetchCommitDiff: async (_owner, _repo, sha) => patches[sha]!,
    })

    const files = await scopeFiles(ctx, ["ddd4444", "bbb2222"])

    const a = files.find((file) => file.filename === "a.ts")!
    expect(files.map((file) => file.filename)).toEqual(["a.ts", "b.ts"])
    expect([a.additions, a.deletions]).toEqual([2, 0])
    expect(a.content.indexOf("+older")).toBeGreaterThan(-1)
    expect(a.content.indexOf("+older")).toBeLessThan(a.content.indexOf("+newer"))
  })
})

describe("spanBaseRef", () => {
  test("names the commit before the oldest from the list, without asking", async () => {
    const asked: string[] = []
    const ctx = loadContext(commitsReview("pr"), {
      getCommitParentSha: async (_owner, _repo, sha) => {
        asked.push(sha)
        return "base0000"
      },
    })

    expect(await spanBaseRef(ctx, "ccc3333")).toBe("bbb2222")
    expect(asked).toEqual([])
    expect(await spanBaseRef(ctx, "aaa1111")).toBe("base0000")
    expect(asked).toEqual(["aaa1111"])
  })

  test("is null when the API cannot name the first commit's parent", async () => {
    const ctx = loadContext(commitsReview("pr"), {
      getCommitParentSha: async () => {
        throw new Error("Not Found")
      },
    })

    expect(await spanBaseRef(ctx, "aaa1111")).toBeNull()
  })
})
