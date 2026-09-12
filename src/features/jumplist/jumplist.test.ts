import { test, expect, describe } from "bun:test"
import { isStepMotion, sameLocation, capture, push, cursorFile } from "./index"
import { createInitialState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { DiffFile } from "../../utils/diff-parser"

const files: DiffFile[] = ["a.ts", "b.ts"].map((filename) => ({
  filename,
  additions: 0,
  deletions: 0,
  status: "unchanged" as const,
  content: "",
}))

const at = (fileIndex: number | null, line: number, col = 0) => {
  const state = { ...createInitialState(files, [], "local", ""), selectedFileIndex: fileIndex }
  return { state, vim: { ...createCursorState(), line, col } }
}

describe("isStepMotion", () => {
  test("stepping and scrolling inside a file are not jumps", () => {
    for (const name of ["j", "k", "h", "l", "w", "b", "e", "0", "^", "$", "up", "down"]) {
      expect(isStepMotion({ name })).toBe(true)
    }
    for (const name of ["d", "u", "e", "y"]) {
      expect(isStepMotion({ name, ctrl: true })).toBe(true)
    }
  })

  test("walking the list does not extend it", () => {
    expect(isStepMotion({ name: "o", ctrl: true })).toBe(true)
    expect(isStepMotion({ name: "i", ctrl: true })).toBe(true)
    expect(isStepMotion({ name: "tab" })).toBe(true)
  })

  test("everything that takes you somewhere is a jump", () => {
    // The picker, search, thread motion, file motion, gg/G — none excluded.
    for (const key of [{ name: "f", ctrl: true }, { name: "g" }, { name: "G" }, { name: "n" }, { name: "return" }, { name: "]" }]) {
      expect(isStepMotion(key)).toBe(false)
    }
  })
})

describe("sameLocation", () => {
  test("a different file, line or column is a different place", () => {
    const here = capture(at(0, 5).state, at(0, 5).vim)
    expect(sameLocation(here, capture(at(0, 5).state, at(0, 5).vim))).toBe(true)
    expect(sameLocation(here, capture(at(1, 5).state, at(1, 5).vim))).toBe(false)
    expect(sameLocation(here, capture(at(0, 9).state, at(0, 9).vim))).toBe(false)
    expect(sameLocation(here, capture(at(0, 5, 3).state, at(0, 5, 3).vim))).toBe(false)
  })
})

describe("push", () => {
  test("the column travels with the jump", () => {
    const { state, vim } = at(0, 5, 12)
    const pushed = push(state, capture(state, vim))
    expect(pushed.jumpList.entries[0]).toMatchObject({ cursorLine: 5, cursorCol: 12 })
  })

  test("the same place twice is one entry", () => {
    const { state, vim } = at(0, 5)
    const once = push(state, capture(state, vim))
    const twice = push(once, capture(once, vim))
    expect(twice.jumpList.entries.length).toBe(1)
  })
})

describe("cursorFile", () => {
  const mapping = {
    getLine: (i: number) =>
      i < 3 ? { filename: "a.ts" } : i < 6 ? { filename: "b.ts" } : undefined,
  }

  test("says which file the cursor stands in, selected or not", () => {
    expect(cursorFile(mapping, 0)).toBe("a.ts")
    expect(cursorFile(mapping, 4)).toBe("b.ts")
    expect(cursorFile(mapping, 9)).toBeNull()
  })

  test("stepping within one file stays in it; stepping out changes it", () => {
    // `j` from row 2 to row 3 leaves a.ts — the boundary the all-files view
    // crosses without any file-switching key.
    expect(cursorFile(mapping, 2)).toBe(cursorFile(mapping, 1))
    expect(cursorFile(mapping, 3)).not.toBe(cursorFile(mapping, 2))
  })
})
