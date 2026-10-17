import { describe, test, expect } from "bun:test"
import { occurrencePickerModel, countText, type OccurrenceHitRow } from "./occurrence-picker-model"
import { findOccurrences } from "../features/occurrence-picker/filter"
import type { OccurrenceRow } from "../features/occurrence-picker/corpus"
import { theme, colors } from "../theme"

/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

function row(filename: string, lineNum: number, text: string, kind: OccurrenceRow["kind"] = "context"): OccurrenceRow {
  return { fileIndex: 0, filename, kind, lineNum, side: kind === "deletion" ? "LEFT" : "RIGHT", text }
}

const ROWS: OccurrenceRow[] = [
  row("a.ts", 2, "const old = greeting", "deletion"),
  row("a.ts", 3, "const greeting = 1", "addition"),
  row("a.ts", 4, "  return greeting"),
  row("b.ts", 10, "greeting()", "addition"),
]

const MANY: OccurrenceRow[] = Array.from({ length: 30 }, (_, i) => row("long.ts", i + 1, `hit ${i}`))

describe("occurrencePickerModel", () => {
  test("puts each file's header before its hits, keyed so a row keeps its id as the list moves", () => {
    const model = occurrencePickerModel("greeting", false, findOccurrences(ROWS, "greeting"), 0, TALL)
    expect(model.rows.map((r) => r.id)).toEqual(["file:a.ts", "hit:0", "hit:1", "hit:2", "file:b.ts", "hit:3"])
    expect(model.rows[0]).toMatchObject({ kind: "file", selected: false, count: "3", name: [{ text: "a.ts", mark: "plain" }] })
  })

  test("gives a hit its line number, marker and excerpt, brighter when selected", () => {
    const rows = occurrencePickerModel("greeting", false, findOccurrences(ROWS, "greeting"), 1, TALL).rows
    const hits = rows.filter((r): r is OccurrenceHitRow => r.kind === "hit")
    expect(hits.map((h) => [h.lineNum, h.marker, h.markerFg, h.selected])).toEqual([
      ["     2", "-", colors.removedFg, false],
      ["     3", "+", colors.addedFg, true],
      ["     4", " ", theme.overlay0, false],
      ["    10", "+", colors.addedFg, false],
    ])
    expect(hits[1]!.textFg).toBe(theme.text)
    expect(hits[0]!.textFg).toBe(theme.subtext1)
    expect(hits[2]!.excerpt).toEqual([
      { text: "return ", mark: "plain" },
      { text: "greeting", mark: "match" },
    ])
  })

  test("orders its hints as the toggle, the count and esc, and badges the query while narrowing", () => {
    const searching = occurrencePickerModel("greeting", false, findOccurrences(ROWS, "greeting"), 0, TALL)
    expect(searching).toMatchObject({ title: "Occurrences", badge: null, count: null, hints: ["^g narrow", "4 in 2 files", "esc"] })
    const narrowing = occurrencePickerModel("greeting", true, findOccurrences(ROWS, "greeting", "b.ts"), 0, TALL)
    expect(narrowing).toMatchObject({ badge: "greeting ›", hints: ["^g search", "1 in 1 file", "esc"] })
    expect(narrowing.rows[0]).toMatchObject({ name: [{ text: "b.ts", mark: "narrow" }] })
  })

  test("says there are no matches only once something is typed", () => {
    expect(occurrencePickerModel("nowhere", false, findOccurrences(ROWS, "nowhere"), 0, TALL).empty).toBe("No matches in the diff")
    expect(occurrencePickerModel("", false, findOccurrences(ROWS, ""), 0, TALL)).toMatchObject({ empty: null, hints: ["^g narrow", "", "esc"] })
  })

  test("windows the rows around the selected hit, and puts its file's header in place of a hit at the top", () => {
    const model = occurrencePickerModel("hit", false, findOccurrences(MANY, "hit"), 20, TALL)
    expect(model).toMatchObject({ above: 11, below: 0 })
    expect(model.rows).toHaveLength(20)
    expect(model.rows[0]).toMatchObject({ id: "file:long.ts", kind: "file", count: "30" })
    expect(model.rows[1]!.id).toBe("hit:11")
    expect(model.rows.find((r) => r.selected)!.id).toBe("hit:20")
  })

  test("keeps to the rows a short terminal has room for, the selection still in view", () => {
    const model = occurrencePickerModel("hit", false, findOccurrences(MANY, "hit"), 29, 24)
    expect(model.rows).toHaveLength(15)
    expect(model.rows.at(-1)).toMatchObject({ id: "hit:29", selected: true })
  })
})

describe("countText", () => {
  test("counts hits and files, and says when it lists only the first", () => {
    expect(countText("", findOccurrences(ROWS, ""))).toBe("")
    expect(countText("greeting", findOccurrences(ROWS, "greeting"))).toBe("4 in 2 files")
    expect(countText("hit", findOccurrences(MANY, "hit", "", 25))).toBe("first 25 of 30 in 1 file")
  })
})
