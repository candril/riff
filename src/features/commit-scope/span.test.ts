import { describe, expect, test } from "bun:test"
import type { PrCommit } from "../../providers/github/types"
import { contiguousRun, parentOfCommit, scopeSpan } from "./span"

// Newest first, as the review lists them.
const commits: PrCommit[] = ["ddd4444", "ccc3333", "bbb2222", "aaa1111"].map((sha) => ({
  sha,
  message: `commit ${sha}`,
  author: "a",
  date: "2026-01-01T00:00:00Z",
}))

describe("contiguousRun", () => {
  test("spans a run from its oldest to its newest, whatever order it was picked in", () => {
    expect(contiguousRun(commits, ["bbb2222", "ddd4444", "ccc3333"])).toEqual({ oldest: "bbb2222", newest: "ddd4444" })
  })

  test("gives null for a scope with a gap", () => {
    expect(contiguousRun(commits, ["ddd4444", "bbb2222"])).toBeNull()
  })

  test("gives null for a single commit", () => {
    expect(contiguousRun(commits, ["ccc3333"])).toBeNull()
  })

  test("gives null when a commit is not in the list", () => {
    expect(contiguousRun(commits, ["ddd4444", "eee5555"])).toBeNull()
  })
})

describe("parentOfCommit", () => {
  test("is the commit before it in the list", () => {
    expect(parentOfCommit(commits, "main", "ccc3333")).toBe("bbb2222")
  })

  test("falls back to the base for the oldest commit, and to its git parent without one", () => {
    expect(parentOfCommit(commits, "main", "aaa1111")).toBe("main")
    expect(parentOfCommit(commits, undefined, "aaa1111")).toBe("aaa1111^")
  })
})

describe("scopeSpan", () => {
  const scoped = (viewingCommit: string | null, viewingCommitScope: string[] | null = null) =>
    scopeSpan({ viewingCommit, viewingCommitScope, commits })

  test("is null with the whole review in view", () => {
    expect(scoped(null)).toBeNull()
  })

  test("is the commit itself for one commit", () => {
    expect(scoped("ccc3333")).toEqual({ oldest: "ccc3333", newest: "ccc3333" })
  })

  test("is the run's ends for a run", () => {
    expect(scoped("ddd4444", ["ddd4444", "ccc3333"])).toEqual({ oldest: "ccc3333", newest: "ddd4444" })
  })

  test("is null for a scope with a gap", () => {
    expect(scoped("ddd4444", ["ddd4444", "aaa1111"])).toBeNull()
  })
})
