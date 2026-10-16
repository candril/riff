import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "./line-mapping"
import type { LineSource } from "./line-source"
import { VimMotionHandler, type KeyEvent } from "./motion-handler"
import { createCursorState } from "./cursor-state"
import { resolveTextObject } from "./text-objects"
import { searchLines } from "./line-motions"
import { SearchEngine } from "./search-engine"
import { FlashHandler } from "./flash-handler"
import { createFlashState, type FlashState } from "./flash-state"
import { RowLineSource } from "../diff-rows/row-source"
import { diffFile } from "../diff-rows/fixtures"
import type { Side, View } from "../diff-rows/rows"
import type { VimCursorState } from "./types"

/**
 *  row  left                    right
 *   0   function run(opts) {    function run(opts) {
 *   1     const old = "gone"      const name = "kept"
 *   2   (empty line)              let spare = 1
 *   3   }                       }
 */
const file = diffFile("app.ts", [
  "@@ -1,4 +1,4 @@",
  " function run(opts) {",
  '-  const old = "gone"',
  "-",
  '+  const name = "kept"',
  "+  let spare = 1",
  " }",
])
const mapping = new DiffLineMapping([file], "single", 0)
const oldLine = '  const old = "gone"'

function harness(source: LineSource, cursor: { line: number; col: number }) {
  let state: VimCursorState = { ...createCursorState(), ...cursor }
  const handler = new VimMotionHandler({
    getMapping: () => source,
    getState: () => state,
    setState: (next) => {
      state = next
    },
    getViewportHeight: () => 10,
    onCursorMove: () => {},
  })
  return {
    press: (...keys: (string | KeyEvent)[]) => {
      for (const key of keys) handler.handleKey(typeof key === "string" ? { name: key, sequence: key } : key)
    },
    get state() {
      return state
    },
  }
}

const split = (side: Side, view: View = "split") => new RowLineSource(mapping, view, side)

describe("h and l at a line edge", () => {
  test("l past the end of a left line lands on the right at col 0", () => {
    const source = split("left")
    const h = harness(source, { line: 1, col: 0 })
    h.press(...Array<string>(oldLine.length - 1).fill("l"))
    expect(h.state.col).toBe(oldLine.length - 1)
    expect(source.side).toBe("left")

    h.press("l")
    expect(source.side).toBe("right")
    expect(h.state).toMatchObject({ line: 1, col: 0 })
  })

  test("h at col 0 on the right lands on the left's last col", () => {
    const source = split("right")
    const h = harness(source, { line: 1, col: 0 })
    h.press("left")
    expect(source.side).toBe("left")
    expect(h.state).toMatchObject({ line: 1, col: oldLine.length - 1 })
  })

  test("h onto an empty left half clamps to col 0", () => {
    const source = split("right")
    const h = harness(source, { line: 2, col: 0 })
    h.press("h")
    expect(source.side).toBe("left")
    expect(h.state.col).toBe(0)
  })

  test("there is no pane left of the left or right of the right", () => {
    const left = split("left")
    const atStart = harness(left, { line: 1, col: 0 })
    atStart.press("h")
    expect(left.side).toBe("left")
    expect(atStart.state.col).toBe(0)

    const right = split("right")
    const end = right.getLineContent(1).length - 1
    const atEnd = harness(right, { line: 1, col: end })
    atEnd.press("l")
    expect(right.side).toBe("right")
    expect(atEnd.state.col).toBe(end)
  })

  test("a unified source and the mapping itself keep l at the end of the line", () => {
    for (const source of [split("left", "unified"), mapping]) {
      const h = harness(source, { line: 1, col: oldLine.length - 1 })
      h.press("l")
      expect(h.state).toMatchObject({ line: 1, col: oldLine.length - 1 })
    }
  })
})

describe("one pane's text", () => {
  test("w and $ move over the active side", () => {
    const h = harness(split("right"), { line: 1, col: 0 })
    h.press("w", "w", "w")
    expect(h.state.col).toBe('  const name '.length)
    h.press({ name: "$", sequence: "$" })
    expect(h.state.col).toBe('  const name = "kept"'.length - 1)
  })

  test("iw selects the word on the active side", () => {
    expect(resolveTextObject(split("right"), 1, 9, "i", "w")).toEqual({
      kind: "charwise",
      startLine: 1,
      startCol: 8,
      endLine: 1,
      endCol: 11,
    })
    expect(resolveTextObject(split("left"), 1, 9, "i", "w")).toMatchObject({ startCol: 8, endCol: 10 })
  })

  test("searchLines reads the active side and answers with a row", () => {
    expect(searchLines(split("left"), "gone", 0, "forward")).toMatchObject({ line: 1 })
    expect(searchLines(split("right"), "gone", 0, "forward")).toBeNull()
    expect(mapping.getLineContent(4)).toBe("  let spare = 1")
    expect(searchLines(split("right"), "spare", 0, "forward")).toMatchObject({ line: 2 })
  })

  test("incremental search matches the active side's rows", () => {
    const matchesOn = (side: Side) =>
      new SearchEngine(() => split(side), () => null).findAllMatchesInMapping(/spare/g).map((m) => m.line)
    expect(matchesOn("right")).toEqual([2])
    expect(matchesOn("left")).toEqual([])
  })

  test("flash labels the active side's text", () => {
    const labelled = (side: Side) => {
      let flashState: FlashState = createFlashState()
      const handler = new FlashHandler({
        getMapping: () => split(side),
        getFlashState: () => flashState,
        setFlashState: (state) => {
          flashState = state
        },
        getCursor: () => createCursorState(),
        setCursor: () => {},
        getVisibleRegion: () => ({ lines: [0, 1, 2, 3], startCol: 0, endCol: 200 }),
        jumpToRow: () => {},
        onUpdate: () => {},
      })
      handler.start()
      for (const char of "gone") handler.handleChar(char)
      return flashState.matches.map((m) => m.line)
    }
    expect(labelled("left")).toEqual([1])
    expect(labelled("right")).toEqual([])
  })
})

describe("j and k move by rows", () => {
  /**
   *  row  left        right
   *   0   ctx         ctx
   *   1   gone a      kept
   *   2   gone b      (empty line)
   *   3   gone c      (empty line)
   */
  const uneven = diffFile("uneven.ts", ["@@ -1,4 +1,2 @@", " ctx", "-gone a", "-gone b", "-gone c", "+kept"])
  const unevenMapping = new DiffLineMapping([uneven], "single", 0)

  test("j from an addition facing a longer removal lands on the empty right half, and k comes back", () => {
    const source = new RowLineSource(unevenMapping, "split", "right")
    const h = harness(source, { line: 1, col: 0 })
    expect(source.getLineContent(1)).toBe("kept")

    h.press("j")
    expect(h.state.line).toBe(2)
    expect(source.side).toBe("right")
    expect(source.rows[2]).toMatchObject({ kind: "pair", left: 2 })
    expect(source.rows[2]).not.toHaveProperty("right")
    // The vim layer reads an empty half as the line beside it; see lineOf.
    expect(source.getLineContent(2)).toBe("gone b")

    h.press("k")
    expect(h.state.line).toBe(1)
    expect(source.getLineContent(1)).toBe("kept")
  })
})
