import { test, expect, describe } from "bun:test"
import { isStepMotion, isListWalk, isFindMotion, sameLocation, sameLine, capture, push, back, forward, cursorFile, apply, type Jump, type JumpApplyContext } from "./index"
import { createInitialState, type AppState } from "../../state"
import { createCursorState } from "../../vim-diff/cursor-state"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { buildFileTree } from "../../utils/file-tree"
import type { DiffFile } from "../../utils/diff-parser"
import { DOC, X, Y } from "../../testing/marks"

const files: DiffFile[] = ["a.ts", "b.ts"].map((filename) => ({
  filename,
  additions: 0,
  deletions: 0,
  status: "unchanged" as const,
  content: "",
}))

/** A mapping with no rows: no entry is anchored, so the list compares mapping lines. */
const noRows = { getLine: () => undefined }

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
    const here = capture(at(0, 5).state, at(0, 5).vim, noRows)
    expect(sameLocation(here, capture(at(0, 5).state, at(0, 5).vim, noRows))).toBe(true)
    expect(sameLocation(here, capture(at(1, 5).state, at(1, 5).vim, noRows))).toBe(false)
    expect(sameLocation(here, capture(at(0, 9).state, at(0, 9).vim, noRows))).toBe(false)
    expect(sameLocation(here, capture(at(0, 5, 3).state, at(0, 5, 3).vim, noRows))).toBe(false)
  })
})

describe("capture", () => {
  test("records split or unified and the panel that has focus", () => {
    const { state, vim } = at(0, 5)
    const jump = capture({ ...state, splitView: true, focusedPanel: "tree" }, vim, noRows)
    expect(jump).toMatchObject({ splitView: true, focusedPanel: "tree" })
  })
})

describe("push", () => {
  test("the column travels with the jump", () => {
    const { state, vim } = at(0, 5, 12)
    const pushed = push(state, capture(state, vim, noRows))
    expect(pushed.jumpList.entries[0]).toMatchObject({ cursorLine: 5, cursorCol: 12 })
  })

  test("the same place twice is one entry", () => {
    const { state, vim } = at(0, 5)
    const once = push(state, capture(state, vim, noRows))
    const twice = push(once, capture(once, vim, noRows))
    expect(twice.jumpList.entries.length).toBe(1)
  })
})

describe("sameLine", () => {
  test("the column does not make another line; the file or the line does", () => {
    const here = capture(at(0, 5).state, at(0, 5).vim, noRows)
    expect(sameLine(here, capture(at(0, 5, 3).state, at(0, 5, 3).vim, noRows))).toBe(true)
    expect(sameLine(here, capture(at(1, 5).state, at(1, 5).vim, noRows))).toBe(false)
    expect(sameLine(here, capture(at(0, 6).state, at(0, 6).vim, noRows))).toBe(false)
    expect(sameLine(here, { ...here, viewMode: "state" })).toBe(false)
  })

  test("anchored, it is the file's line and side, wherever the mapping put it", () => {
    const anchor = { filename: "a.ts", line: 12, side: "RIGHT" as const }
    const here = { ...capture(at(0, 5).state, at(0, 5).vim, noRows), anchor }
    expect(sameLine(here, { ...here, cursorLine: 40, fileIndex: null, filename: null })).toBe(true)
    expect(sameLine(here, { ...here, anchor: { ...anchor, side: "LEFT" } })).toBe(false)
    expect(sameLine(here, { ...here, anchor: { ...anchor, line: 13 } })).toBe(false)
  })
})

describe("the list, as nvim keeps it", () => {
  const { state: start } = at(null, 0)
  const jump = (line: number, col = 0) => capture(start, { ...createCursorState(), line, col }, noRows)
  const pushAll = (lines: number[]) => lines.reduce((s, line) => push(s, jump(line)), start)
  const lines = (s: typeof start) => s.jumpList.entries.map((entry) => entry.cursorLine)

  test("a jump after going back appends, and keeps the entries ahead of the index", () => {
    const three = pushAll([1, 2, 3])
    const walked = { ...three, jumpList: { ...three.jumpList, index: 0 } }
    const pushed = push(walked, jump(9))
    expect(lines(pushed)).toEqual([1, 2, 3, 9])
    expect(pushed.jumpList.index).toBe(4)
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
    expect(full.jumpList.index).toBe(100)
  })

  test("back from the newest end records where you are, so forward comes back to it", () => {
    const list = pushAll([1, 2])
    const backed = back(list, { ...createCursorState(), line: 8 }, noRows)!
    expect(backed.jump.cursorLine).toBe(2)
    expect(lines(backed.state)).toEqual([1, 2, 8])
    const forwarded = forward(backed.state)!
    expect(forwarded.jump.cursorLine).toBe(8)
    expect(forward(forwarded.state)).toBeNull()
  })

  test("back from a line already in the list records it once", () => {
    const backed = back(pushAll([1, 2]), { ...createCursorState(), line: 1 }, noRows)!
    expect(lines(backed.state)).toEqual([2, 1])
    expect(backed.jump.cursorLine).toBe(2)
  })

  test("on the newest entry, back goes to the one before without recording where you are", () => {
    const walked = forward(back(pushAll([1, 2]), { ...createCursorState(), line: 8 }, noRows)!.state)!
    const backed = back(walked.state, { ...createCursorState(), line: 9 }, noRows)!
    expect(backed.jump.cursorLine).toBe(2)
    expect(lines(backed.state)).toEqual([1, 2, 8])
  })

  test("on the newest entry, forward does nothing", () => {
    const walked = forward(back(pushAll([1, 2]), { ...createCursorState(), line: 8 }, noRows)!.state)!
    expect(forward(walked.state)).toBeNull()
  })

  test("at the oldest entry, back does nothing", () => {
    const backed = back(pushAll([1]), { ...createCursorState(), line: 1 }, noRows)
    expect(backed).toBeNull()
  })
})

describe("an entry whose file left the diff", () => {
  const { state: start } = at(null, 0)
  const inFile = (filename: string, line: number) => ({
    ...capture(start, { ...createCursorState(), line }, noRows),
    anchor: { filename, line, side: "RIGHT" as const },
  })
  const listOf = (entries: ReturnType<typeof inFile>[], index: number) => ({ ...start, jumpList: { entries, index } })
  const lines = (s: typeof start) => s.jumpList.entries.map((entry) => entry.cursorLine)

  test("is walked past going back, and kept", () => {
    const list = listOf([inFile("a.ts", 1), inFile("gone.ts", 2), inFile("left.ts", 3)], 3)
    const backed = back(list, { ...createCursorState(), line: 8 }, noRows)!
    expect(backed.jump.cursorLine).toBe(1)
    expect(backed.state.jumpList.index).toBe(0)
    expect(lines(backed.state)).toEqual([1, 2, 3, 8])
  })

  test("is walked past going forward", () => {
    const forwarded = forward(listOf([inFile("a.ts", 1), inFile("gone.ts", 2), inFile("b.ts", 3)], 0))!
    expect(forwarded.jump.cursorLine).toBe(3)
    expect(forwarded.state.jumpList.index).toBe(2)
  })

  test("leaves nowhere to go when every entry ahead is one", () => {
    expect(forward(listOf([inFile("a.ts", 1), inFile("gone.ts", 2), inFile("left.ts", 3)], 0))).toBeNull()
  })

  test("is judged by the commit it was taken in once that is switched to", () => {
    const elsewhere = { ...inFile("gone.ts", 2), viewingCommit: "abc1234" }
    expect(forward(listOf([inFile("a.ts", 1), elsewhere], 0))!.jump).toBe(elsewhere)
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

describe("apply", () => {
  function applying(diff: DiffFile[], patch: Partial<AppState> = {}) {
    let state: AppState = { ...createInitialState(diff, buildFileTree(diff), "local", ""), ...patch }
    let vim = createCursorState()
    const build = () =>
      new DiffLineMapping(state.files, state.selectedFileIndex === null ? "all" : "single", state.selectedFileIndex ?? undefined, {
        collapsedFiles: state.collapsedFiles,
        collapsedBlocks: state.collapsedBlocks,
      })
    let mapping = build()
    const calls: string[] = []
    const ctx: JumpApplyContext = {
      getState: () => state,
      setState: (update) => {
        state = update(state)
      },
      getVimState: () => vim,
      setVimState: (next) => {
        vim = next
      },
      getLineMapping: () => mapping,
      rebuildLineMapping: () => {
        mapping = build()
      },
      setPane: (pane) => void calls.push(`pane ${pane}`),
      toggleSplitView: () => {
        state = { ...state, splitView: !state.splitView }
        calls.push("toggle split")
      },
      ensureCursorVisible: () => {},
      render: () => {},
      onCommitSelected: () => {
        throw new Error("no commit switch here")
      },
    }
    const entry = (patch: Partial<Jump> = {}): Jump => ({ ...capture(state, vim, mapping), ...patch })
    return { ctx, calls, entry, state: () => state, vim: () => vim, mapping: () => mapping }
  }

  test("toggles split only when the entry's layout differs", () => {
    const h = applying([X, Y])
    apply(h.entry({ splitView: false, anchor: null }), h.ctx)
    expect(h.calls).toEqual([])
    apply(h.entry({ splitView: true, anchor: null }), h.ctx)
    expect(h.calls).toEqual(["toggle split"])
    expect(h.state().splitView).toBe(true)
  })

  test("gives focus back to the panel it was taken in while that panel is open", () => {
    const h = applying([X, Y], { showFilePanel: true })
    apply(h.entry({ focusedPanel: "tree" }), h.ctx)
    expect(h.state().focusedPanel).toBe("tree")
  })

  test("focuses the diff when the panel it was taken in has closed", () => {
    for (const focusedPanel of ["tree", "comments", "chat"] as const) {
      const h = applying([X, Y], { showFilePanel: false, chatOpen: false })
      apply(h.entry({ focusedPanel }), h.ctx)
      expect(h.state().focusedPanel).toBe("diff")
    }
  })

  test("opens the code-block fold that hides the entry's line and lands on it", () => {
    const id = new DiffLineMapping([DOC], "all").foldableBlocks[0]!.id
    const h = applying([DOC], { collapsedBlocks: new Set([id]) })
    apply(h.entry({ anchor: { filename: "doc.md", line: 3, side: "RIGHT" }, cursorLine: 0 }), h.ctx)
    expect(h.state().collapsedBlocks.has(id)).toBe(false)
    expect(h.mapping().getLine(h.vim().line)).toMatchObject({ content: "sequenceDiagram", newLineNum: 3 })
  })

  test("comes back to the PR overview taken with no file selected, from a file in the diff", () => {
    const h = applying([X, Y], { appMode: "pr" })
    const overview = h.entry({ viewMode: "state", anchor: null })
    h.ctx.setState((s) => ({ ...s, selectedFileIndex: 1 }))
    apply(overview, h.ctx)
    expect(h.state().viewMode).toBe("state")
    expect(h.state().selectedFileIndex).toBeNull()
  })

  test("leaves the PR overview for a diff entry in another file without its reaction target", () => {
    const h = applying([X, Y], { appMode: "pr" })
    const diffEntry = h.entry({ viewMode: "diff", fileIndex: 1, filename: "src/y.ts", anchor: null })
    h.ctx.setState((s) => ({ ...s, viewMode: "state", selectedFileIndex: null, reactionTarget: { kind: "issue", prNumber: 1 } }))
    apply(diffEntry, h.ctx)
    expect(h.state().viewMode).toBe("diff")
    expect(h.state().selectedFileIndex).toBe(1)
    expect(h.state().reactionTarget).toBeNull()
  })

  test("makes the entry's side the active pane on a context row", () => {
    // Row 5 of [X, Y] is a context row, old 3 and new 4: see src/testing/marks.ts.
    const h = applying([X, Y], { splitView: true })
    apply(h.entry({ anchor: { filename: "src/x.ts", line: 3, side: "LEFT" }, cursorLine: 5 }), h.ctx)
    expect(h.vim().line).toBe(5)
    expect(h.calls).toEqual(["pane left"])
  })
})
