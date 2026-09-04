import { describe, expect, test } from "bun:test"
import { assignLabels, findLabelledMatch, FLASH_LABELS } from "./flash-state"

/** Build the `getLineContent` a label assignment needs from a line table. */
function content(lines: Record<number, string>) {
  return (line: number) => lines[line] ?? ""
}

describe("assignLabels", () => {
  test("labels the match nearest the cursor first", () => {
    const lines = { 0: "xx foo", 5: "xx foo", 9: "xx foo" }
    const matches = [
      { line: 0, startCol: 3, endCol: 6 },
      { line: 5, startCol: 3, endCol: 6 },
      { line: 9, startCol: 3, endCol: 6 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 5, col: 0 },
      getLineContent: content(lines),
    })

    // Cursor is on line 5, so that match takes "a"; line 9 is nearer than line 0.
    expect(labelled.map((m) => m.label)).toEqual(["d", "a", "s"])
  })

  test("breaks line ties on column distance", () => {
    const lines = { 2: "foo .... foo" }
    const matches = [
      { line: 2, startCol: 0, endCol: 3 },
      { line: 2, startCol: 9, endCol: 12 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 2, col: 9 },
      getLineContent: content(lines),
    })

    expect(labelled.map((m) => m.label)).toEqual(["s", "a"])
  })

  test("drops keys that would continue the search instead", () => {
    // "fa" and "fs" are both live continuations of "f", so neither `a` nor
    // `s` may double as a label — typing them has to narrow the pattern.
    const lines = { 0: "fa", 1: "fs" }
    const matches = [
      { line: 0, startCol: 0, endCol: 1 },
      { line: 1, startCol: 0, endCol: 1 },
    ]

    const labelled = assignLabels({
      matches,
      cursor: { line: 0, col: 0 },
      getLineContent: content(lines),
    })

    expect(labelled.map((m) => m.label)).toEqual(["d", "f"])
  })

  test("leaves matches unlabelled once the alphabet runs out", () => {
    const line = "x".repeat(FLASH_LABELS.length + 5)
    const matches = Array.from({ length: FLASH_LABELS.length + 5 }, (_, i) => ({
      line: 0,
      startCol: i,
      endCol: i + 1,
    }))

    const labelled = assignLabels({
      matches,
      cursor: { line: 0, col: 0 },
      getLineContent: content({ 0: line }),
    })

    // "x" follows every match, so it is excluded from the 26-key alphabet.
    expect(labelled.filter((m) => m.label !== null)).toHaveLength(FLASH_LABELS.length - 1)
    expect(labelled.filter((m) => m.label === null)).toHaveLength(6)
  })
})

describe("findLabelledMatch", () => {
  const matches = [
    { line: 0, startCol: 0, endCol: 1, label: "a" },
    { line: 1, startCol: 0, endCol: 1, label: null },
  ]

  test("finds a match by its label", () => {
    expect(findLabelledMatch(matches, "a")?.line).toBe(0)
  })

  test("accepts the uppercase variant", () => {
    expect(findLabelledMatch(matches, "A")?.line).toBe(0)
  })

  test("ignores unlabelled matches", () => {
    expect(findLabelledMatch(matches, "s")).toBeNull()
  })
})
