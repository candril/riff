import { describe, test, expect } from "bun:test"
import { filePickerModel, type FilteredFile } from "./file-picker-model"
import { theme } from "../theme"
import { getFileColor } from "../utils/file-colors"
import type { DiffFile } from "../utils/diff-parser"

const file = (filename: string, additions: number, deletions: number): DiffFile => ({
  filename,
  additions,
  deletions,
  status: "modified",
  content: "",
})

const FILES: FilteredFile[] = [
  { file: file("src/greet.ts", 12, 3), index: 4, viewed: true },
  { file: file("src/main.ts", 4, 0), index: 7, commentCount: 2 },
  { file: file("notes.unknownext", 0, 7), index: 9, commentCount: 0 },
]

describe("filePickerModel", () => {
  test("titles the list and counts the selection", () => {
    expect(filePickerModel(FILES, 1)).toMatchObject({ title: "Find Files", count: "2/3", hints: ["esc"], above: 0, below: 0, empty: null })
  })

  test("gives each row its name, tick, comment count and stats, keyed by the file's place in the diff", () => {
    const rows = filePickerModel(FILES, 1).rows
    expect(rows.map((r) => [r.id, r.viewed, r.name, r.comments, r.stats, r.selected])).toEqual([
      ["4", true, "src/greet.ts", null, "+12 -3", false],
      ["7", false, "src/main.ts", "2", "+4 -0", true],
      ["9", false, "notes.unknownext", null, "+0 -7", false],
    ])
  })

  test("colours a name by its file type, dims a viewed one, and draws the selection in text", () => {
    const rows = filePickerModel(FILES, 1).rows
    expect(rows[0]!.nameFg).toBe(theme.overlay0)
    expect(rows[1]!.nameFg).toBe(theme.text)
    expect(rows[2]!.nameFg).toBe(getFileColor("notes.unknownext") || theme.subtext1)
    expect(filePickerModel(FILES, 0).rows[0]!.nameFg).toBe(theme.text)
    expect(filePickerModel(FILES, 0).rows[1]!.nameFg).toBe(getFileColor("src/main.ts")!)
  })

  test("has nothing to say about an empty list but its count", () => {
    expect(filePickerModel([], 0)).toMatchObject({ count: "0", rows: [], empty: null })
  })
})
