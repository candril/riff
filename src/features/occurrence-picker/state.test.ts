import { describe, expect, test } from "bun:test"
import { createOccurrencePickerState } from "./state"

const CLOSED = { query: "", filter: "", narrowing: false, selectedIndex: 0 }

describe("the occurrence picker's state", () => {
  test("show opens it afresh on its seed, dropping a previous filter, narrowing and selection", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show("old")
    occurrencePicker.setFilter("src")
    occurrencePicker.toggleNarrowing()
    occurrencePicker.move(2, 5)
    occurrencePicker.show("greeting")
    expect(occurrencePicker.open()).toBe(true)
    expect(occurrencePicker.snapshot()).toEqual({ ...CLOSED, query: "greeting" })
  })

  test("show without a seed opens on an empty query", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show()
    expect(occurrencePicker.open()).toBe(true)
    expect(occurrencePicker.snapshot()).toEqual(CLOSED)
  })

  test("close shuts it and clears the query, filter, narrowing and selection", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show("greeting")
    occurrencePicker.setFilter("src")
    occurrencePicker.toggleNarrowing()
    occurrencePicker.move(1, 5)
    occurrencePicker.close()
    expect(occurrencePicker.open()).toBe(false)
    expect(occurrencePicker.snapshot()).toEqual(CLOSED)
  })

  test("setQuery puts the selection back on the first row and keeps the filter", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show()
    occurrencePicker.setFilter("src")
    occurrencePicker.move(3, 5)
    occurrencePicker.setQuery("greeting")
    expect(occurrencePicker.snapshot()).toEqual({ ...CLOSED, query: "greeting", filter: "src" })
  })

  test("setFilter puts the selection back on the first row and keeps the query", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show("greeting")
    occurrencePicker.move(3, 5)
    occurrencePicker.setFilter("src")
    expect(occurrencePicker.snapshot()).toEqual({ ...CLOSED, query: "greeting", filter: "src" })
  })

  test("toggleNarrowing switches the prompt between the query and the filter, leaving both alone", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.show("greeting")
    occurrencePicker.setFilter("src")
    occurrencePicker.move(2, 5)
    occurrencePicker.toggleNarrowing()
    expect(occurrencePicker.snapshot()).toEqual({ query: "greeting", filter: "src", narrowing: true, selectedIndex: 2 })
    occurrencePicker.toggleNarrowing()
    expect(occurrencePicker.narrowing()).toBe(false)
  })

  test("move steps within the list", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.move(2, 5)
    occurrencePicker.move(-1, 5)
    expect(occurrencePicker.selectedIndex()).toBe(1)
  })

  test("move wraps past the last row to the first, and above the first to the last", () => {
    const occurrencePicker = createOccurrencePickerState()
    occurrencePicker.move(-1, 3)
    expect(occurrencePicker.selectedIndex()).toBe(3)
    occurrencePicker.move(1, 3)
    expect(occurrencePicker.selectedIndex()).toBe(0)
  })
})
