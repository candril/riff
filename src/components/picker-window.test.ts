import { describe, test, expect } from "bun:test"
import { pickerModel, pickerWindow } from "./picker-window"

describe("pickerWindow", () => {
  test("keeps the selection in the middle of a long list", () => {
    expect(pickerWindow(30, 15)).toEqual({ start: 5, end: 25, above: 5, below: 5, count: "16/30" })
  })

  test("stops at the top and at the bottom", () => {
    expect(pickerWindow(30, 3)).toEqual({ start: 0, end: 20, above: 0, below: 10, count: "4/30" })
    expect(pickerWindow(30, 28)).toEqual({ start: 10, end: 30, above: 10, below: 0, count: "29/30" })
  })

  test("shows a list that fits whole", () => {
    expect(pickerWindow(20, 19)).toEqual({ start: 0, end: 20, above: 0, below: 0, count: "20/20" })
    expect(pickerWindow(3, 1, 2)).toEqual({ start: 0, end: 2, above: 0, below: 1, count: "2/3" })
  })

  test("counts 0 when nothing matches", () => {
    expect(pickerWindow(0, 0)).toEqual({ start: 0, end: 0, above: 0, below: 0, count: "0" })
  })
})

describe("pickerModel", () => {
  const header = { title: "T", hints: ["esc"], empty: "Nothing" }
  const row = (n: number, selected: boolean) => ({ id: String(n), selected })

  test("builds only the rows in view, marking the selected one", () => {
    const model = pickerModel(Array.from({ length: 30 }, (_, i) => i), 15, header, row)
    expect(model.rows.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => String(i + 5)))
    expect(model.rows.filter((r) => r.selected).map((r) => r.id)).toEqual(["15"])
    expect(model).toMatchObject({ title: "T", count: "16/30", hints: ["esc"], above: 5, below: 5, empty: null })
  })

  test("says what an empty list says only when it is empty", () => {
    expect(pickerModel([], 0, header, row).empty).toBe("Nothing")
    expect(pickerModel([1], 0, header, row).empty).toBeNull()
  })
})
