import { describe, expect, test } from "bun:test"
import { adjacentCommit } from "./bracket-commands"

const commits = [{ sha: "a" }, { sha: "b" }, { sha: "c" }]

describe("adjacentCommit", () => {
  test("steps from all commits to the first, or back to the last", () => {
    expect(adjacentCommit(commits, null, 1)).toBe("a")
    expect(adjacentCommit(commits, null, -1)).toBe("c")
  })

  test("steps between commits", () => {
    expect(adjacentCommit(commits, "a", 1)).toBe("b")
    expect(adjacentCommit(commits, "c", -1)).toBe("b")
  })

  test("wraps through all commits at either end", () => {
    expect(adjacentCommit(commits, "c", 1)).toBeNull()
    expect(adjacentCommit(commits, "a", -1)).toBeNull()
  })

  test("selects nothing without commits", () => {
    expect(adjacentCommit([], null, 1)).toBeUndefined()
    expect(adjacentCommit([], "a", -1)).toBeUndefined()
  })
})
