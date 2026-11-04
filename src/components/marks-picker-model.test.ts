import { describe, test, expect } from "bun:test"
import { marksPickerModel } from "./marks-picker-model"
import { filterMarkEntries, type MarkEntry } from "../features/marks"
import { theme } from "../theme"

/** Tall enough that no list here is cut to the terminal. */
const TALL = 60

const ENTRIES: MarkEntry[] = [
  { mark: { letter: "a", filename: "src/greet.ts", line: 12, side: "RIGHT" }, text: "return template(name)" },
  { mark: { letter: "Q", filename: "README.md", line: null, side: "RIGHT" }, text: "" },
]

describe("marksPickerModel", () => {
  test("titles the list with the delete key", () => {
    expect(marksPickerModel(ENTRIES, 1, true, TALL)).toMatchObject({ title: "Marks", count: "2/2", hints: ["^x delete", "esc"], empty: null })
  })

  test("gives each mark its letter in peach, its place and its line's text", () => {
    expect(marksPickerModel(ENTRIES, 1, true, TALL).rows).toEqual([
      {
        id: "a",
        selected: false,
        letter: "a",
        letterSpans: [{ text: "a", matched: false }],
        letterFg: theme.peach,
        location: "src/greet.ts:12",
        locationSpans: [{ text: "src/greet.ts:12", matched: false }],
        locationFg: theme.subtext1,
        text: "return template(name)",
        textSpans: [{ text: "return template(name)", matched: false }],
        textFg: theme.overlay0,
      },
      {
        id: "Q",
        selected: true,
        letter: "Q",
        letterSpans: [{ text: "Q", matched: false }],
        letterFg: theme.peach,
        location: "README.md",
        locationSpans: [{ text: "README.md", matched: false }],
        locationFg: theme.text,
        text: "",
        textSpans: [],
        textFg: theme.subtext0,
      },
    ])
  })

  test("an empty list says how to set a mark, or that the filter matched none", () => {
    expect(marksPickerModel([], 0, false, TALL).empty).toBe("No marks — m{letter} sets one")
    expect(marksPickerModel([], 0, true, TALL).empty).toBe("No matching marks")
  })
})

describe("marksPickerModel: highlighted matches (spec 007)", () => {
  const m = (text: string) => ({ text, matched: true })
  const u = (text: string) => ({ text, matched: false })
  const rowsFor = (query: string) => marksPickerModel(filterMarkEntries(ENTRIES, query), 0, true, TALL).rows

  test("a match in the location lands on the location, the letter and text plain", () => {
    expect(rowsFor("greet")[0]).toMatchObject({
      letterSpans: [u("a")],
      locationSpans: [u("src/"), m("greet"), u(".ts:12")],
      textSpans: [u("return template(name)")],
    })
  })

  test("terms matching the letter and the line's text each land on their own part", () => {
    expect(rowsFor("a templ")[0]).toMatchObject({
      letterSpans: [m("a")],
      locationSpans: [u("src/greet.ts:12")],
      textSpans: [u("return "), m("templ"), u("ate(name)")],
    })
  })
})
