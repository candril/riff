import { describe, expect, test } from "bun:test"
import { clampSelection, filterAtCandidates, MENTION_VISIBLE_LIMIT } from "./at-picker"

describe("the @ picker's list", () => {
  test("clamp keeps a selection that still fits", () => {
    expect(clampSelection(2, 5)).toBe(2)
    expect(clampSelection(7, 5)).toBe(4)
  })

  test("ranks on the keys a candidate gives, the first strongest, and shows no more than fit", () => {
    const files = ["input/deeply/nested/other.ts", "a/b/input.ts"]
    const keys = (path: string) => [path.slice(path.lastIndexOf("/") + 1), path]
    expect(filterAtCandidates(files, "input", keys)).toEqual(["a/b/input.ts", "input/deeply/nested/other.ts"])
    const many = Array.from({ length: 10 }, (_, i) => `name${i}`)
    expect(filterAtCandidates(many, "", (c) => c)).toHaveLength(MENTION_VISIBLE_LIMIT)
  })
})
