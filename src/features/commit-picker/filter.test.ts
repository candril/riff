import { test, expect, describe } from "bun:test"
import { markedCommits, getFilteredCommits } from "./filter"
import type { PrCommit } from "../../providers/github/types"

// Newest first, as both providers report them.
const commits: PrCommit[] = [
  { sha: "aaa1111", message: "the last thing", author: "you", date: "2026-09-11T10:00:00Z" },
  { sha: "bbb2222", message: "the middle of it", author: "you", date: "2026-09-11T09:00:00Z" },
  { sha: "ccc3333", message: "where it started", author: "you", date: "2026-09-11T08:00:00Z" },
  { sha: "ddd4444", message: "something else", author: "you", date: "2026-09-11T07:00:00Z" },
]

describe("marking commits", () => {
  test("marks come back newest first, whatever order they were picked in", () => {
    expect(markedCommits(commits, new Set(["ccc3333", "aaa1111"]))).toEqual(["aaa1111", "ccc3333"])
  })

  test("a mark on a commit no longer listed is left out", () => {
    expect(markedCommits(commits, new Set(["bbb2222", "eee5555"]))).toEqual(["bbb2222"])
  })
})

describe("what the filter narrows", () => {
  test("the query still matches message, sha and author", () => {
    expect(getFilteredCommits(commits, "middle").map((row) => row.commit.sha)).toEqual(["bbb2222"])
  })

  test("no query lists every commit, each with its index", () => {
    expect(getFilteredCommits(commits, "").map((row) => row.index)).toEqual([0, 1, 2, 3])
  })
})
