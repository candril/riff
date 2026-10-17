import { test, expect, describe } from "bun:test"
import { createInitialState, type AppState } from "../../state"
import { buildFileTree } from "../../utils/file-tree"
import type { DiffFile } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import { createCursorState } from "../../vim-diff/cursor-state"
import type { VimCursorState } from "../../vim-diff/types"
import type { FileNavigationContext } from "../file-navigation"
import { X, Y, DOC } from "../../testing/marks"
import { setMarkAtCursor, jumpToMark, flipMark, type MarksContext } from "./handlers"
import type { Mark } from "./types"

type Pane = "left" | "right"

interface Setup {
  selected?: number | null
  collapsedFiles?: string[]
  collapsedBlocks?: string[]
  pane?: Pane | null
  marks?: Mark[]
  line?: number
}

function harness(files: DiffFile[], setup: Setup = {}) {
  let state: AppState = createInitialState(files, buildFileTree(files), "local", "")
  state = {
    ...state,
    selectedFileIndex: setup.selected ?? null,
    collapsedFiles: new Set(setup.collapsedFiles ?? []),
    collapsedBlocks: new Set(setup.collapsedBlocks ?? []),
    marks: { ...state.marks, marks: setup.marks ?? [] },
  }
  let vim: VimCursorState = { ...createCursorState(), line: setup.line ?? 0 }
  const build = () =>
    new DiffLineMapping(state.files, state.selectedFileIndex === null ? "all" : "single", state.selectedFileIndex ?? undefined, {
      collapsedFiles: state.collapsedFiles,
      collapsedBlocks: state.collapsedBlocks,
    })
  let mapping = build()
  const panes: Pane[] = []
  const saved: (readonly Mark[])[] = []

  const fileNavContext: FileNavigationContext = {
    getState: () => state,
    setState: (fn) => { state = fn(state) },
    getVimState: () => vim,
    setVimState: (s) => { vim = s },
    getLineMapping: () => mapping,
    createLineMapping: () => (mapping = build()),
    getCursorView: () => { throw new Error("not drawn") },
    ensureCursorVisible: () => {},
    render: () => {},
    mode: "local",
    prInfo: null,
    source: "local",
    getHeadSha: () => null,
    setHeadSha: () => {},
  }
  const ctx: MarksContext = {
    getState: () => state,
    setState: fileNavContext.setState,
    getVimState: () => vim,
    setVimState: (s) => { vim = s },
    getLineMapping: () => mapping,
    getPane: () => setup.pane ?? null,
    setPane: (pane) => { panes.push(pane) },
    ensureCursorVisible: () => {},
    render: () => {},
    fileNavContext,
    save: (marks) => { saved.push(marks) },
  }

  return {
    ctx,
    panes,
    saved,
    state: () => state,
    vim: () => vim,
    mapping: () => mapping,
    moveTo: (line: number) => { vim = { ...vim, line } },
    toast: () => state.toast.message,
  }
}

const mark = (letter: string, filename: string, line: number | null, side: Mark["side"] = "RIGHT"): Mark => ({
  letter,
  filename,
  line,
  side,
})

// Rows of [X, Y] in all-files mode: see src/testing/marks.ts.
describe("m{letter}", () => {
  test.each([
    ["an addition, its new line", 3, null, { line: 2, side: "RIGHT" }],
    ["a deletion, its old line", 2, null, { line: 2, side: "LEFT" }],
    ["a context row, on the left pane's side", 5, "left", { line: 3, side: "LEFT" }],
    ["a file header, the file", 0, null, { line: null, side: "RIGHT" }],
    ["a divider, the line above it", 6, null, { line: 4, side: "RIGHT" }],
  ] as const)("on %s, sets the mark and saves the marks", (_, row, pane, place) => {
    const h = harness([X, Y], { line: row, pane })
    setMarkAtCursor("a", h.ctx)

    const set = { letter: "a", filename: "src/x.ts", ...place }
    expect(h.state().marks.marks).toEqual([set])
    expect(h.saved).toEqual([[set]])
    expect(h.toast()).toBe("Mark a set")
  })

  test("setting a letter again moves it and saves the moved mark", () => {
    const h = harness([X, Y], { line: 3 })
    setMarkAtCursor("a", h.ctx)
    h.moveTo(15)
    setMarkAtCursor("a", h.ctx)
    expect(h.saved.at(-1)).toEqual([mark("a", "src/y.ts", 2)])
  })

  test("with no file under the cursor, says so and sets nothing", () => {
    const h = harness([X, Y], { line: 999 })
    setMarkAtCursor("a", h.ctx)
    expect(h.state().marks.marks).toEqual([])
    expect(h.saved).toEqual([])
    expect(h.toast()).toBe("Mark a needs a file under the cursor")
  })
})

describe("'{letter}", () => {
  test("jumps within a file", () => {
    const h = harness([X, Y], { line: 1, marks: [mark("a", "src/x.ts", 10)] })
    expect(jumpToMark("a", h.ctx)).toBe(true)
    expect(h.vim()).toMatchObject({ line: 9, col: 0, desiredCol: null })
    expect(h.panes).toEqual(["right"])
    expect(h.state().marks.current).toBe("a")
    expect(h.toast()).toBeNull()
  })

  test("jumps to another file in all-files mode", () => {
    const h = harness([X, Y], { line: 1, marks: [mark("a", "src/y.ts", 2)] })
    jumpToMark("a", h.ctx)
    expect(h.vim().line).toBe(15)
  })

  test("unfolds a collapsed file to reach the mark", () => {
    const h = harness([X, Y], { collapsedFiles: ["src/y.ts"], marks: [mark("a", "src/y.ts", 2)] })
    jumpToMark("a", h.ctx)
    expect(h.state().collapsedFiles.has("src/y.ts")).toBe(false)
    expect(h.mapping().getLine(h.vim().line)).toMatchObject({ filename: "src/y.ts", newLineNum: 2 })
  })

  test("switches the file in single-file mode", () => {
    const h = harness([X, Y], { selected: 0, line: 3, marks: [mark("a", "src/y.ts", 2)] })
    jumpToMark("a", h.ctx)
    expect(h.state().selectedFileIndex).toBe(1)
    expect(h.mapping().getLine(h.vim().line)).toMatchObject({ filename: "src/y.ts", newLineNum: 2 })
  })

  test("a file not in this diff says so and leaves the cursor", () => {
    const h = harness([X, Y], { line: 4, marks: [mark("a", "src/gone.ts", 3)] })
    expect(jumpToMark("a", h.ctx)).toBe(false)
    expect(h.vim().line).toBe(4)
    expect(h.state().marks.current).toBeNull()
    expect(h.toast()).toBe("Mark a: src/gone.ts is not in this diff")
  })

  test("a letter never set says so", () => {
    const h = harness([X, Y], { line: 4 })
    expect(jumpToMark("q", h.ctx)).toBe(false)
    expect(h.vim().line).toBe(4)
    expect(h.toast()).toBe("Mark q is not set")
  })

  test("a LEFT mark on a context row makes the left pane active", () => {
    const h = harness([X, Y], { marks: [mark("a", "src/x.ts", 3, "LEFT")] })
    jumpToMark("a", h.ctx)
    expect(h.vim().line).toBe(5)
    expect(h.panes).toEqual(["left"])
  })
})

describe("a mark under a folded block", () => {
  const blockId = () => new DiffLineMapping([DOC], "all").foldableBlocks[0]!.id

  test("opens the fold and lands on its line, with nothing to say", () => {
    const id = blockId()
    const h = harness([DOC], { collapsedBlocks: [id], marks: [mark("a", "doc.md", 3)] })
    jumpToMark("a", h.ctx)
    expect(h.state().collapsedBlocks.has(id)).toBe(false)
    expect(h.mapping().getLine(h.vim().line)).toMatchObject({ content: "sequenceDiagram", newLineNum: 3 })
    expect(h.toast()).toBeNull()
  })

  test("stays shut when the line it lands near is not inside it", () => {
    const id = blockId()
    const h = harness([DOC], { collapsedBlocks: [id], marks: [mark("a", "doc.md", 40)] })
    jumpToMark("a", h.ctx)
    expect(h.state().collapsedBlocks.has(id)).toBe(true)
    expect(h.mapping().getLine(h.vim().line)).toMatchObject({ content: "prose after" })
    expect(h.toast()).toBe("Mark a: line 40 of doc.md is gone — landed nearby")
  })
})

describe("''", () => {
  const marks = [mark("a", "src/x.ts", 10), mark("b", "src/y.ts", 2)]

  test("before two marks were visited, says so and stays", () => {
    const h = harness([X, Y], { line: 4, marks })
    expect(flipMark(h.ctx)).toBe(false)
    expect(h.toast()).toBe("No earlier mark to go back to")

    jumpToMark("a", h.ctx)
    h.moveTo(4)
    expect(flipMark(h.ctx)).toBe(false)
    expect(h.vim().line).toBe(4)
  })

  test("flips between the last two marks visited", () => {
    const h = harness([X, Y], { marks })
    jumpToMark("a", h.ctx)
    jumpToMark("b", h.ctx)
    expect(h.vim().line).toBe(15)

    flipMark(h.ctx)
    expect(h.vim().line).toBe(9)
    flipMark(h.ctx)
    expect(h.vim().line).toBe(15)
    flipMark(h.ctx)
    expect(h.vim().line).toBe(9)
  })
})
