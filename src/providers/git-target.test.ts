import { describe, expect, test } from "bun:test"
import { gitSidesOf } from "./git-target"

describe("the revisions a git review's diff runs between", () => {
  test("a branch review runs from where the branch and HEAD last met to HEAD", () => {
    expect(gitSidesOf("branch:main")).toEqual({ head: "HEAD", base: { mergeBaseOf: ["main", "HEAD"] } })
    expect(gitSidesOf("branch:feature/x")).toEqual({
      head: "HEAD",
      base: { mergeBaseOf: ["feature/x", "HEAD"] },
    })
  })

  test("a three-dot range runs from the merge base of its ends to its right end", () => {
    expect(gitSidesOf("a...b")).toEqual({ head: "b", base: { mergeBaseOf: ["a", "b"] } })
    expect(gitSidesOf("a...")).toEqual({ head: "HEAD", base: { mergeBaseOf: ["a", "HEAD"] } })
    expect(gitSidesOf("...b")).toEqual({ head: "b", base: { mergeBaseOf: ["HEAD", "b"] } })
  })

  test("a two-dot range runs from its left end to its right end", () => {
    expect(gitSidesOf("a..b")).toEqual({ head: "b", base: { rev: "a" } })
    expect(gitSidesOf("a..")).toEqual({ head: "HEAD", base: { rev: "a" } })
    expect(gitSidesOf("..b")).toEqual({ head: "b", base: { rev: "HEAD" } })
  })

  test("a single revision runs from its parent to itself", () => {
    expect(gitSidesOf("abc123")).toEqual({ head: "abc123", base: { rev: "abc123^" } })
  })
})
