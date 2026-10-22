import { test, expect, describe } from "bun:test"
import { isStepMotion, isListWalk, isFindMotion, sameLocation, sameLine, capture, push, back, forward, cursorFile } from "./index"
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

  test("walking the list is not a step: it is its own kind", () => {
    expect(isStepMotion({ name: "o", ctrl: true })).toBe(false)
    expect(isStepMotion({ name: "i", ctrl: true })).toBe(false)
    expect(isStepMotion({ name: "tab" })).toBe(false)
  })

  test("everything that takes you somewhere is a jump", () => {
    // The picker, search, thread motion, file motion, gg/G — none excluded.
    for (const key of [{ name: "f", ctrl: true }, { name: "g" }, { name: "G" }, { name: "n" }, { name: "return" }, { name: "]" }]) {
      expect(isStepMotion(key)).toBe(false)
    }
  })
})

describe("isListWalk", () => {
  test("Ctrl-o, Ctrl-i and the tab Ctrl-i arrives as walk the list", () => {
    expect(isListWalk({ name: "o", ctrl: true })).toBe(true)
    expect(isListWalk({ name: "i", ctrl: true })).toBe(true)
    expect(isListWalk({ name: "tab" })).toBe(true)
  })

  test("nothing else does", () => {
    for (const key of [{ name: "o" }, { name: "i" }, { name: "d", ctrl: true }, { name: "j" }]) {
      expect(isListWalk(key)).toBe(false)
    }
  })
})

describe("isFindMotion", () => {
  test("f, F, t, T, ; and , find within the line", () => {
    for (const key of [{ name: "f" }, { name: "f", shift: true }, { name: "t" }, { name: "T" }, { name: ";" }, { name: "", sequence: "," }]) {
      expect(isFindMotion(key)).toBe(true)
    }
  })

  test("Ctrl-f is the file picker, not a find", () => {
    expect(isFindMotion({ name: "f", ctrl: true })).toBe(false)
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

describe("sameLine", () => {
  test("the column does not make another line; the file or the line does", () => {
    const here = capture(at(0, 5).state, at(0, 5).vim)
    expect(sameLine(here, capture(at(0, 5, 3).state, at(0, 5, 3).vim))).toBe(true)
    expect(sameLine(here, capture(at(1, 5).state, at(1, 5).vim))).toBe(false)
    expect(sameLine(here, capture(at(0, 6).state, at(0, 6).vim))).toBe(false)
    expect(sameLine(here, { ...here, viewMode: "state" })).toBe(false)
  })
})

describe("the list, as nvim keeps it", () => {
  const { state: start } = at(null, 0)
  const jump = (line: number, col = 0) => capture(start, { ...createCursorState(), line, col })
  const pushAll = (lines: number[]) => lines.reduce((s, line) => push(s, jump(line)), start)
  const lines = (s: typeof start) => s.jumpList.entries.map((entry) => entry.cursorLine)

  test("a jump after going back appends, and keeps the entries ahead of the index", () => {
    const three = pushAll([1, 2, 3])
    const walked = { ...three, jumpList: { ...three.jumpList, index: 0 } }
    const pushed = push(walked, jump(9))
    expect(lines(pushed)).toEqual([1, 2, 3, 9])
    expect(pushed.jumpList.index).toBe(3)
  })

  test("a line already in the list moves to the end, with the column it has now", () => {
    const pushed = push(pushAll([1, 2, 3]), jump(1, 7))
    expect(lines(pushed)).toEqual([2, 3, 1])
    expect(pushed.jumpList.entries[2]!.cursorCol).toBe(7)
  })

  test("holds 100 entries, and the oldest go first", () => {
    const full = pushAll(Array.from({ length: 105 }, (_, i) => i))
    expect(lines(full)).toHaveLength(100)
    expect(lines(full)[0]).toBe(5)
    expect(full.jumpList.index).toBe(99)
  })

  test("back from the newest end records where you are, so forward comes back to it", () => {
    const list = pushAll([1, 2])
    const backed = back(list, { ...createCursorState(), line: 8 })!
    expect(backed.jump.cursorLine).toBe(2)
    expect(lines(backed.state)).toEqual([1, 2, 8])
    const forwarded = forward(backed.state)!
    expect(forwarded.jump.cursorLine).toBe(8)
    expect(forward(forwarded.state)).toBeNull()
  })

  test("back from a line already in the list records it once", () => {
    const backed = back(pushAll([1, 2]), { ...createCursorState(), line: 1 })!
    expect(lines(backed.state)).toEqual([2, 1])
    expect(backed.jump.cursorLine).toBe(2)
  })

  test("at the oldest entry, back does nothing", () => {
    const backed = back(pushAll([1]), { ...createCursorState(), line: 1 })
    expect(backed).toBeNull()
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
