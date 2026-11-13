import { describe, expect, test } from "bun:test"
import type { AppState } from "../../state"
import { parseDiff } from "../../utils/diff-parser"
import { DiffLineMapping } from "../../vim-diff/line-mapping"
import type { VimCursorState } from "../../vim-diff/types"
import { ADDED_NESTED, CONVERSION } from "./fixtures"
import { createNestedDiffState } from "./state"
import { toggleNested, type ToggleNestedDeps } from "./toggle"

const PLAIN = [
  "diff --git a/a.ts b/a.ts",
  "--- a/a.ts",
  "+++ b/a.ts",
  "@@ -1 +1 @@",
  "-old",
  "+new",
].join("\n")

/** gN's deps over a review's files, every call recorded in order. */
function harness(raw: string) {
  const files = parseDiff(raw)
  const nested = createNestedDiffState()
  const state = { viewMode: "diff", focusedPanel: "diff", selectedFileIndex: null, files } as unknown as AppState
  const build = () => new DiffLineMapping(files, "all", undefined, { rawNestedFiles: nested.raw() })
  let mapping = build()
  let vim = { line: 0, col: 3, desiredCol: 3 } as unknown as VimCursorState
  const calls: string[] = []
  const toasts: string[] = []
  const deps: ToggleNestedDeps = {
    getState: () => state,
    getMapping: () => mapping,
    getVimState: () => vim,
    setVimState: (next) => {
      calls.push("setVimState")
      vim = next
    },
    nested,
    rebuildLineMapping: () => {
      calls.push("rebuild")
      mapping = build()
    },
    cursorView: { onceRebuilt: (then) => then(), landCursor: () => calls.push("landCursor") },
    toast: { show: (message) => toasts.push(message), clear: () => {}, current: () => null },
    render: () => calls.push("render"),
  }
  return {
    deps,
    nested,
    calls,
    toasts,
    row: () => mapping.getLine(vim.line)!,
    rowWhere: (match: (line: ReturnType<DiffLineMapping["getLine"]> & {}) => boolean) =>
      (vim = { ...vim, line: mapping.allLines.findIndex(match) }),
  }
}

describe("gN", () => {
  test("shows a nested file's plain diff, the cursor on the line it was on", () => {
    const h = harness(ADDED_NESTED)
    h.rowWhere((line) => line.content === "`GET /new`")
    toggleNested(h.deps)
    expect(h.nested.isRaw("Fetch.md.diff")).toBe(true)
    expect(h.row()).toMatchObject({ content: "+`GET /new`", newLineNum: 6 })
    expect(h.row().inner).toBeUndefined()
    expect(h.calls).toEqual(["rebuild", "setVimState", "render", "landCursor"])
  })

  test("again, reads it nested", () => {
    const h = harness(ADDED_NESTED)
    h.rowWhere((line) => line.newLineNum === 6)
    toggleNested(h.deps)
    toggleNested(h.deps)
    expect(h.row()).toMatchObject({ content: "`GET /new`", inner: "addition" })
  })

  test("on a deleted file paired with its .diff, brings back the plain deletion on the same old line", () => {
    const h = harness(CONVERSION)
    h.rowWhere((line) => line.filename === "Fetch.md" && line.content === "## Deviations")
    toggleNested(h.deps)
    expect(h.nested.isRaw("Fetch.md")).toBe(true)
    expect(h.row()).toMatchObject({ filename: "Fetch.md", type: "deletion", oldLineNum: 5 })
    expect(h.row().pairedFile).toBeUndefined()
  })

  test("says what it reads on any other file, and changes nothing", () => {
    const h = harness(PLAIN)
    h.rowWhere((line) => line.content === "new")
    toggleNested(h.deps)
    expect(h.toasts).toEqual(["gN reads .diff and .patch files, and a file deleted for one"])
    expect(h.nested.raw().size).toBe(0)
    expect(h.calls).not.toContain("rebuild")
  })
})
