import { test, expect, describe } from "bun:test"
import { positional, underPath, driftOf, hashLine } from "./comments"
import type { Comment } from "../types"

const comment = (over: Partial<Comment>): Comment => ({
  id: "c",
  filename: "src/a.ts",
  line: 3,
  side: "RIGHT",
  body: "…",
  createdAt: "2026-01-01T00:00:00.000Z",
  status: "local",
  ...over,
})

describe("positional", () => {
  test("a flag's value is not a target", () => {
    expect(positional(["--path", "src", "--json"])).toEqual([])
    expect(positional(["list", "--path", "src", "HEAD~3"])).toEqual(["list", "HEAD~3"])
  })

  test("bare words are still arguments", () => {
    expect(positional(["resolve", "abc1234", "--json"])).toEqual(["resolve", "abc1234"])
  })
})

describe("underPath", () => {
  const all = [
    comment({ id: "a", filename: "src/a.ts" }),
    comment({ id: "deep", filename: "src/utils/b.ts" }),
    comment({ id: "other", filename: "docs/c.md" }),
    comment({ id: "prefix", filename: "srcery/d.ts" }),
  ]

  test("a directory takes everything under it, and nothing that merely starts the same", () => {
    expect(underPath(all, "src").map((c) => c.id)).toEqual(["a", "deep"])
  })

  test("a file takes itself", () => {
    expect(underPath(all, "src/a.ts").map((c) => c.id)).toEqual(["a"])
  })

  test("no path, `.` and a trailing slash all mean everything", () => {
    expect(underPath(all, undefined)).toHaveLength(4)
    expect(underPath(all, ".")).toHaveLength(4)
    expect(underPath(all, "src/").map((c) => c.id)).toEqual(["a", "deep"])
  })
})

describe("driftOf", () => {
  const lines = ["one", "two", "three", "four", "five"]
  const anchored = comment({ line: 3, anchorHash: hashLine("three") })

  test("a line that has not moved says so", () => {
    expect(driftOf(anchored, lines)).toEqual({ at: 3, moved: false })
  })

  test("a line that moved is found and named", () => {
    expect(driftOf(anchored, ["inserted", ...lines])).toEqual({ at: 4, moved: true })
  })

  test("the nearest match wins, because code repeats itself", () => {
    const repeated = ["three", "x", "three", "y", "three"]
    expect(driftOf(comment({ line: 2, anchorHash: hashLine("three") }), repeated)).toEqual({
      at: 1,
      moved: true,
    })
  })

  test("a line that is gone is lost, not silently pointed at", () => {
    expect(driftOf(anchored, ["one", "two", "four"])).toEqual({ at: null, moved: false })
  })

  test("a comment written before the hash existed is not judged", () => {
    expect(driftOf(comment({ line: 3 }), lines)).toBeNull()
    expect(driftOf(anchored, null)).toBeNull()
  })

  test("indentation alone does not move a line", () => {
    expect(driftOf(anchored, ["one", "two", "      three", "four"])).toEqual({ at: 3, moved: false })
  })
})
