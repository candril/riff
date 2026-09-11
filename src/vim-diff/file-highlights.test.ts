import { test, expect, describe } from "bun:test"
import {
  mapFileHighlights,
  lineStarts,
  worthHighlighting,
  MAX_HIGHLIGHT_BYTES,
} from "./file-highlights"
import type { SimpleHighlight } from "@opentui/core"

// A file whose middle is folded away on screen.
const file = ["const a = 1", "/**", " * explanation", " */", "const b = 2"].join("\n")

describe("moving a file's highlights onto the rows on screen", () => {
  test("a row keeps the file's reading of its line", () => {
    // The whole comment, as tree-sitter would report it over the file.
    const comment: SimpleHighlight = [
      file.indexOf("/**"),
      file.indexOf("*/") + 2,
      "comment",
    ]
    // On screen: the explanation line only — the fences are folded away.
    const rows = " * explanation"

    const mapped = mapFileHighlights({
      fileHighlights: [comment],
      fileContent: file,
      rowsContent: rows,
      rowLines: [3],
    })

    expect(mapped).toEqual([[0, rows.length, "comment"]])
  })

  test("a highlight is cut at each line, since the rows are not neighbours", () => {
    const rows = [" * explanation", "const b = 2"].join("\n")
    const comment: SimpleHighlight = [file.indexOf("/**"), file.indexOf("*/") + 2, "comment"]

    const mapped = mapFileHighlights({
      fileHighlights: [comment],
      fileContent: file,
      rowsContent: rows,
      rowLines: [3, 5],
    })

    // Only the explanation row is inside the comment; `const b = 2` is not
    // dragged into it by sitting next to it on screen.
    expect(mapped).toEqual([[0, " * explanation".length, "comment"]])
  })

  test("columns survive the move", () => {
    const rows = "const b = 2"
    const keyword: SimpleHighlight = [file.lastIndexOf("const"), file.lastIndexOf("const") + 5, "keyword"]

    expect(
      mapFileHighlights({
        fileHighlights: [keyword],
        fileContent: file,
        rowsContent: rows,
        rowLines: [5],
      })
    ).toEqual([[0, 5, "keyword"]])
  })

  test("a row the file has no line for is left alone", () => {
    const rows = ["▸ 3 lines", "const b = 2"].join("\n")
    const keyword: SimpleHighlight = [file.lastIndexOf("const"), file.lastIndexOf("const") + 5, "keyword"]

    const mapped = mapFileHighlights({
      fileHighlights: [keyword],
      fileContent: file,
      rowsContent: rows,
      rowLines: [null, 5],
    })

    expect(mapped).toEqual([["▸ 3 lines".length + 1, "▸ 3 lines".length + 6, "keyword"]])
  })

  test("nothing to map, nothing mapped", () => {
    expect(
      mapFileHighlights({ fileHighlights: [], fileContent: file, rowsContent: "", rowLines: [] })
    ).toEqual([])
  })

  test("line starts are where the lines start", () => {
    expect(lineStarts("ab\ncd\n")).toEqual([0, 3, 6])
  })
})

describe("what is worth parsing", () => {
  test("a file a person wrote", () => {
    expect(worthHighlighting("x".repeat(200_000))).toBe(true)
  })

  test("a generated one", () => {
    expect(worthHighlighting("x".repeat(MAX_HIGHLIGHT_BYTES + 1))).toBe(false)
  })
})
