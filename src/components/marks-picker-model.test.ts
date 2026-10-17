import { describe, test, expect } from "bun:test"
import { marksPickerModel } from "./marks-picker-model"
import type { MarkEntry } from "../features/marks"
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
        letterFg: theme.peach,
        location: "src/greet.ts:12",
        locationFg: theme.subtext1,
        text: "return template(name)",
        textFg: theme.overlay0,
      },
      {
        id: "Q",
        selected: true,
        letter: "Q",
        letterFg: theme.peach,
        location: "README.md",
        locationFg: theme.text,
        text: "",
        textFg: theme.subtext0,
      },
    ])
  })

  test("an empty list says how to set a mark, or that the filter matched none", () => {
    expect(marksPickerModel([], 0, false, TALL).empty).toBe("No marks — m{letter} sets one")
    expect(marksPickerModel([], 0, true, TALL).empty).toBe("No matching marks")
  })
})
