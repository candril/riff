import { describe, expect, test } from "bun:test"
import { createCursorState } from "../vim-diff/cursor-state"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import type { VimCursorState } from "../vim-diff/types"
import { commentScope, scopeAnchors } from "./comment-scope"
import { diffFile } from "./fixtures"
import { RowLineSource } from "./row-source"

/**
 *  left         right
 *  a            a
 *  b            B
 *  c            C
 *  d            d
 *  gone
 *  e            e
 */
const file = diffFile("s.ts", ["@@ -1,6 +1,5 @@", " a", "-b", "-c", "+B", "+C", " d", "-gone", " e"])
const mapping = new DiffLineMapping([file], "all")
const at = (content: string) => mapping.allLines.findIndex((line) => line.content === content)

const cursor = (line: number, selectionAnchor: number | null = null): VimCursorState => ({
  ...createCursorState(),
  line,
  mode: selectionAnchor === null ? "normal" : "visual-line",
  selectionAnchor,
})

const split = (side: "left" | "right") => new RowLineSource(mapping, "split", side)

describe("getCommentAnchor with a pane", () => {
  const anchor = (content: string, pane?: "left" | "right") => {
    const found = mapping.getCommentAnchor(at(content), pane)
    return found && `${found.side}:${found.line}`
  }

  test("without a pane a removal anchors left and anything else right, as unified does", () => {
    expect(anchor("b")).toBe("LEFT:2")
    expect(anchor("B")).toBe("RIGHT:2")
    expect(anchor("d")).toBe("RIGHT:4")
    expect(anchor("e")).toBe("RIGHT:5")
  })

  test("a context line anchors to the pane's side with that side's number", () => {
    expect(anchor("e", "left")).toBe("LEFT:6")
    expect(anchor("e", "right")).toBe("RIGHT:5")
  })

  test("a removal anchors only from the left pane, an addition only from the right", () => {
    expect(anchor("b", "left")).toBe("LEFT:2")
    expect(anchor("b", "right")).toBeNull()
    expect(anchor("B", "right")).toBe("RIGHT:2")
    expect(anchor("B", "left")).toBeNull()
  })
})

describe("commentScope", () => {
  test("unified covers the cursor's line, or every line of the selection", () => {
    expect(commentScope(cursor(at("d")), null)).toEqual({ lines: [at("d")] })
    const lines = commentScope(cursor(at("d"), at("b")), null).lines
    expect(lines).toEqual([at("b"), at("c"), at("B"), at("C"), at("d")])
  })

  test("a split selection covers its rows in the active pane, never the other pane's lines", () => {
    const scope = commentScope(cursor(at("d"), at("b")), split("left"))
    expect(scope).toEqual({ lines: [at("b"), at("c"), at("d")], pane: "left" })
    expect(scopeAnchors(mapping, scope).map((a) => `${a.side}:${a.line}`)).toEqual(["LEFT:2", "LEFT:3", "LEFT:4"])
  })

  test("a selection is ordered by rows, whichever half its anchor was set in", () => {
    const scope = commentScope(cursor(at("b"), at("C")), split("right"))
    expect(scope.lines).toEqual([at("B"), at("C")])
  })

  test("a row whose active half is empty covers nothing", () => {
    const scope = commentScope(cursor(at("gone")), split("right"))
    expect(scope).toEqual({ lines: [], pane: "right" })
    expect(scopeAnchors(mapping, scope)).toEqual([])
  })
})
