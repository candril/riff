import { test, expect, describe } from "bun:test"
import { DiffLineMapping } from "../vim-diff/line-mapping"
import { RowLineSource } from "./row-source"
import { doc } from "./fixtures"

/**
 *  row  left            right
 *   0   doc.md (file header, full width)
 *   1-4 context lines, the same on both sides
 *   5   (empty)         const b = 2
 *   6   ```
 *   7   divider
 *   8   tail old        tail changed
 *   9   end             end
 *  10   \ No newline    \ No newline
 *  11   divider
 */
const mapping = new DiffLineMapping([doc], "all")

describe("RowLineSource", () => {
  test("unified view reads the mapping unchanged", () => {
    const source = new RowLineSource(mapping, "unified")
    expect(source.lineCount).toBe(mapping.lineCount)
    for (let i = 0; i < mapping.lineCount; i++) {
      expect(source.getLine(i)).toBe(mapping.getLine(i))
      expect(source.getLineContent(i)).toBe(mapping.getLineContent(i))
    }
    for (let n = 1; n <= 12; n++) {
      expect(source.findVisualLineForFileLine(doc.filename, n)).toBe(
        mapping.findVisualLineForFileLine(doc.filename, n),
      )
    }
  })

  test("split view has one index per pair row", () => {
    const source = new RowLineSource(mapping, "split")
    expect(source.lineCount).toBe(12)
    expect(source.lineCount).toBe(source.rows.length)
  })

  test("a removed/added pair reads its own half on each side", () => {
    const source = new RowLineSource(mapping, "split", "left")
    expect(source.getLineContent(8)).toBe("tail old")
    expect(source.getLine(8)?.type).toBe("deletion")
    source.setSide("right")
    expect(source.getLineContent(8)).toBe("tail changed")
    expect(source.getLine(8)?.type).toBe("addition")
  })

  test("an empty half reads its partner", () => {
    const source = new RowLineSource(mapping, "split", "left")
    expect(source.getLineContent(5)).toBe("const b = 2")
    source.setSide("right")
    expect(source.getLineContent(5)).toBe("const b = 2")
  })

  test("a context row reads the same line from either side", () => {
    const source = new RowLineSource(mapping, "split", "left")
    const left = source.lineIndexAt(2)
    source.setSide("right")
    expect(source.lineIndexAt(2)).toBe(left!)
    expect(source.getLineContent(2)).toBe("intro")
  })

  test("out of range reads nothing", () => {
    const source = new RowLineSource(mapping, "split")
    expect(source.getLine(99)).toBeUndefined()
    expect(source.getLineContent(99)).toBe("")
    expect(source.lineIndexAt(-1)).toBeUndefined()
  })

  test("a file line resolves to its row, not its unified line", () => {
    const source = new RowLineSource(mapping, "split")
    expect(mapping.findVisualLineForFileLine(doc.filename, 11)).toBe(12)
    expect(source.findVisualLineForFileLine(doc.filename, 11)).toBe(9)
    expect(source.rowAtLine(12)).toBe(9)
    expect(source.findVisualLineForFileLine(doc.filename, 99)).toBeNull()
  })

  test("crossPane moves between the two panes of a split view only", () => {
    const unified = new RowLineSource(mapping, "unified")
    expect(unified.crossPane(1)).toBe(false)
    expect(unified.crossPane(-1)).toBe(false)

    const split = new RowLineSource(mapping, "split", "left")
    expect(split.crossPane(-1)).toBe(false)
    expect(split.side).toBe("left")
    expect(split.crossPane(1)).toBe(true)
    expect(split.side).toBe("right")
    expect(split.crossPane(1)).toBe(false)
    expect(split.side).toBe("right")
    expect(split.crossPane(-1)).toBe(true)
    expect(split.side).toBe("left")
  })
})
