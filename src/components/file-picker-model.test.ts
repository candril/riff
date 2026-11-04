import { describe, test, expect } from "bun:test"
import { filePickerModel, type FilteredFile } from "./file-picker-model"
import { theme } from "../theme"
import { getFileColor } from "../utils/file-colors"
import type { DiffFile } from "../utils/diff-parser"
import { createInitialState } from "../state"
import { getFilteredFiles } from "../features/file-picker/filter"

/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

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
    expect(filePickerModel(FILES, 1, TALL)).toMatchObject({ title: "Find Files", count: "2/3", hints: ["esc"], above: 0, below: 0, empty: null })
  })

  test("gives each row its name, tick, comment count and stats, keyed by the file's place in the diff", () => {
    const rows = filePickerModel(FILES, 1, TALL).rows
    expect(rows.map((r) => [r.id, r.viewed, r.name, r.comments, r.stats, r.selected])).toEqual([
      ["4", true, "src/greet.ts", null, "+12 -3", false],
      ["7", false, "src/main.ts", "2", "+4 -0", true],
      ["9", false, "notes.unknownext", null, "+0 -7", false],
    ])
  })

  test("colours a name by its file type, dims a viewed one, and draws the selection in text", () => {
    const rows = filePickerModel(FILES, 1, TALL).rows
    expect(rows[0]!.nameFg).toBe(theme.overlay0)
    expect(rows[1]!.nameFg).toBe(theme.text)
    expect(rows[2]!.nameFg).toBe(getFileColor("notes.unknownext") || theme.subtext1)
    expect(filePickerModel(FILES, 0, TALL).rows[0]!.nameFg).toBe(theme.text)
    expect(filePickerModel(FILES, 0, TALL).rows[1]!.nameFg).toBe(getFileColor("src/main.ts")!)
  })

  test("has nothing to say about an empty list but its count", () => {
    expect(filePickerModel([], 0, TALL)).toMatchObject({ count: "0", rows: [], empty: null })
  })
})

describe("filePickerModel: highlighted matches (spec 007)", () => {
  const m = (text: string) => ({ text, matched: true })
  const u = (text: string) => ({ text, matched: false })
  const state = createInitialState(
    [file("src/domain/FamilyReadModel.cs", 1, 1), file("src/greet.ts", 1, 1)],
    [],
    "local",
    "local changes"
  )
  const rowsFor = (query: string) => filePickerModel(getFilteredFiles(state, query), 0, TALL).rows

  test("a match on the basename lands on the basename's characters in the full path drawn", () => {
    expect(getFilteredFiles(state, "frm").map((f) => [f.file.filename, f.matched])).toEqual([
      ["src/domain/FamilyReadModel.cs", [11, 17, 21]],
    ])
    expect(rowsFor("frm")[0]!.nameSpans).toEqual([u("src/domain/"), m("F"), u("amily"), m("R"), u("ead"), m("M"), u("odel.cs")])
  })

  test("a match only the full path makes is drawn where it fell, directories included", () => {
    expect(rowsFor("sdf")[0]!.nameSpans).toEqual([m("s"), u("rc/"), m("d"), u("omain/"), m("F"), u("amilyReadModel.cs")])
  })

  test("no query draws every name plain", () => {
    expect(rowsFor("").map((row) => row.nameSpans)).toEqual([[u("src/domain/FamilyReadModel.cs")], [u("src/greet.ts")]])
  })
})
